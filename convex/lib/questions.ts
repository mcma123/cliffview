import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { MAX_OPTIONS } from "./ordering";

/**
 * What makes a question gradable, in one place.
 *
 * Two paths write questions now — an admin typing one into the builder, and the
 * generator reading a document — and they must agree on every rule. A question
 * with no correct answer nobody can pass, or with two, is the state the whole
 * atomic-save design exists to prevent; it must not become reachable just
 * because a model produced it instead of a person.
 */

/** True/false questions are stored as these two options, in this order. */
const TRUE_FALSE_TEXT = ["True", "False"] as const;

export type OptionInput = { text: string; isCorrect: boolean };

/**
 * Everything that has to be true before a question is worth storing.
 *
 * All of it is checked before a single row is written, so a refused save leaves
 * the previous version of the question exactly as it was. The returned list is
 * the normalised one to write — trimmed, and for true/false rewritten to the
 * canonical two options.
 */
export function normaliseOrThrow(
  kind: Doc<"assessmentQuestions">["kind"],
  prompt: string,
  options: ReadonlyArray<OptionInput>,
): { prompt: string; options: Array<OptionInput> } {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length === 0) {
    throw new ConvexError({ code: "INVALID", message: "A question needs a prompt." });
  }

  const trimmed = options.map((option) => ({
    text: option.text.trim(),
    isCorrect: option.isCorrect,
  }));

  if (trimmed.some((option) => option.text.length === 0)) {
    throw new ConvexError({ code: "INVALID", message: "Every answer needs some text." });
  }

  // The invariant the whole atomic-save design exists to protect. Zero correct
  // options is a question nobody can pass; two is a question the grader cannot
  // grade.
  if (trimmed.filter((option) => option.isCorrect).length !== 1) {
    throw new ConvexError({
      code: "INVALID",
      message: "Mark exactly one answer as the correct one.",
    });
  }

  if (kind === "true_false") {
    if (trimmed.length !== 2) {
      throw new ConvexError({
        code: "INVALID",
        message: "A true or false question has exactly two answers.",
      });
    }
    // Normalised server-side rather than validated, so a typo in the submitted
    // text cannot produce a question that reads "Ture". Only which one is
    // correct survives from the caller.
    return {
      prompt: trimmedPrompt,
      options: TRUE_FALSE_TEXT.map((text, index) => ({
        text,
        isCorrect: trimmed[index].isCorrect,
      })),
    };
  }

  if (trimmed.length < 2) {
    throw new ConvexError({
      code: "INVALID",
      message: "A multiple-choice question needs at least two answers.",
    });
  }
  if (trimmed.length > MAX_OPTIONS) {
    throw new ConvexError({
      code: "INVALID",
      message: `A question can have at most ${MAX_OPTIONS} answers.`,
    });
  }

  // One right answer and an identical wrong one is ungradable by a human, and
  // the learner has no way to tell which they picked.
  const seen = new Set(trimmed.map((option) => option.text.toLowerCase()));
  if (seen.size !== trimmed.length) {
    throw new ConvexError({ code: "INVALID", message: "Two answers read the same." });
  }

  return { prompt: trimmedPrompt, options: trimmed };
}
