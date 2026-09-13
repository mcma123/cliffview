/**
 * The OpenRouter client, and the one call this app makes to a language model.
 *
 * Chosen over a vector database and a parsing pipeline because the task does
 * not need either. Retrieval exists to find relevant passages when a corpus is
 * too large for a context window; a school policy document is not. This model
 * carries a 1,050,000-token window, so a whole module document goes in as one
 * message, and it reads PDFs natively, so nothing has to extract the text first.
 *
 * Two settings do real work here:
 *
 * - `engine: "native"` on the PDF plugin. OpenRouter's default is `mistral-ocr`
 *   at $2 per 1,000 pages, which is worth paying for scans and worth avoiding
 *   for a text PDF a native-file model can read as input tokens.
 * - `response_format` with a strict JSON schema. The questions have to satisfy
 *   the same invariants `questions.save` enforces — exactly one correct answer,
 *   two to six of them — and a constrained decode is what stops this being a
 *   parse-and-repair loop over prose.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * 1M context, native file input, structured outputs, and roughly 25x cheaper
 * per input token than the frontier tier — which matters because a document is
 * re-read in full on every generation.
 */
export const OPENROUTER_MODEL = "openai/gpt-5.6-luna-pro";

/** Answers per question. Mirrors MAX_OPTIONS in `lib/ordering.ts`. */
const MIN_ANSWERS = 2;
const MAX_ANSWERS = 6;

/** What one generation may produce. A cap, so a long document cannot run away. */
export const MAX_GENERATED_QUESTIONS = 20;

export type GeneratedQuestion = {
  prompt: string;
  difficulty: "Easy" | "Medium" | "Hard";
  confidencePercent: number;
  options: Array<{ text: string; isCorrect: boolean }>;
};

/**
 * The shape the model must return.
 *
 * `strict: true` with `additionalProperties: false` throughout: the fields are
 * written straight into `aiQuestions` and `aiQuestionOptions`, so a hallucinated
 * extra key or a missing one is a write that fails validation at the database
 * rather than something a reviewer notices later.
 */
const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "difficulty", "confidencePercent", "options"],
        properties: {
          prompt: { type: "string", description: "The question, as a learner reads it." },
          difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
          confidencePercent: {
            type: "integer",
            description:
              "How well the source document supports this question and its answer, 0-100.",
          },
          options: {
            type: "array",
            minItems: MIN_ANSWERS,
            maxItems: MAX_ANSWERS,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "isCorrect"],
              properties: {
                text: { type: "string" },
                isCorrect: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You write assessment questions for a South African primary school's staff training platform.

You are given one training document. Write multiple-choice questions that check whether a teacher has read and understood it.

Rules:
- Every question must be answerable from the document alone. Never use outside knowledge, and never invent a policy detail the document does not state.
- Exactly one option is correct. The wrong options must be plausible to somebody who skimmed the document, not obviously silly — a question anyone can guess teaches nothing.
- Ask about what a teacher would have to DO: procedures, thresholds, who to tell, in what order. Prefer that to definitions and dates.
- Keep the language plain and the questions short. The audience is busy teachers, not exam candidates.
- confidencePercent is how squarely the document supports the question. Use a low number when you had to infer, and expect a reviewer to reject it.
- If the document is too thin to support good questions, return fewer. Returning nothing is better than padding.`;

export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/** The deployment's key. Absent means the feature is not configured, not broken. */
export function openRouterKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY;
  return key === undefined || key.length === 0 ? null : key;
}

/**
 * Base64 for a file, in chunks.
 *
 * `String.fromCharCode(...bytes)` on a multi-megabyte document overflows the
 * call stack, which fails as a `RangeError` far from anything that reads like
 * a file problem.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Keep only what can actually be stored and graded. */
function usable(question: GeneratedQuestion): boolean {
  if (question.prompt.trim().length === 0) return false;
  const options = question.options ?? [];
  if (options.length < MIN_ANSWERS || options.length > MAX_ANSWERS) return false;
  if (options.some((option) => option.text.trim().length === 0)) return false;
  // The invariant the whole assessment feature rests on.
  if (options.filter((option) => option.isCorrect).length !== 1) return false;
  const seen = new Set(options.map((option) => option.text.trim().toLowerCase()));
  return seen.size === options.length;
}

/**
 * Read one document and return questions about it.
 *
 * Returns what survived validation alongside how many were dropped, rather than
 * throwing on a partly-good batch: nineteen usable questions and one malformed
 * one is a successful generation, and the count is worth surfacing.
 */
export async function generateQuestions(args: {
  apiKey: string;
  fileName: string;
  /** Base64 of the document, no data-URL prefix. */
  fileBase64: string;
  contentType: string;
  moduleTitle: string;
  requestedCount: number;
  /** Identifies this app to OpenRouter. Optional but good manners. */
  refererUrl?: string;
}): Promise<{ questions: Array<GeneratedQuestion>; discarded: number; model: string }> {
  const count = Math.min(Math.max(1, args.requestedCount), MAX_GENERATED_QUESTIONS);

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      ...(args.refererUrl === undefined ? {} : { "HTTP-Referer": args.refererUrl }),
      "X-Title": "Cliffview Academy",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      // The model reads the file itself. `mistral-ocr`, the default, would bill
      // $2 per 1,000 pages to extract text this model can already see.
      plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "assessment_questions", strict: true, schema: QUESTION_SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is the training document for the module "${args.moduleTitle}". Write ${count} multiple-choice questions about it.`,
            },
            {
              type: "file",
              file: {
                filename: args.fileName,
                file_data: `data:${args.contentType};base64,${args.fileBase64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    // OpenRouter puts the useful part in the body; the status alone says little.
    const body = await response.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter refused the request (${response.status}). ${body.slice(0, 400)}`.trim(),
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    model?: string;
  };

  // A 200 with an error body is a real OpenRouter shape, not a hypothetical.
  if (payload.error !== undefined) {
    throw new OpenRouterError(payload.error.message ?? "OpenRouter returned an error.");
  }

  const content = payload.choices?.[0]?.message?.content;
  if (content === undefined || content.length === 0) {
    throw new OpenRouterError("OpenRouter returned no content.");
  }

  let parsed: { questions?: Array<GeneratedQuestion> };
  try {
    parsed = JSON.parse(content) as { questions?: Array<GeneratedQuestion> };
  } catch {
    throw new OpenRouterError("The model did not return the JSON shape that was asked for.");
  }

  const all = parsed.questions ?? [];
  const questions = all.filter(usable).slice(0, MAX_GENERATED_QUESTIONS);
  return {
    questions,
    discarded: all.length - questions.length,
    model: payload.model ?? OPENROUTER_MODEL,
  };
}
