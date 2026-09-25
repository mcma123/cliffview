import { OpenRouterError } from "./openrouter";

/**
 * Talking to OpenRouter's video API, and the decisions around it.
 *
 * Split from `openrouter.ts` because the shapes have nothing in common: chat
 * returns an answer, video returns a *job* that has to be polled until it
 * finishes. The three `fetch` wrappers at the bottom are the untestable part;
 * everything above them is a pure function, so the retry policy, the response
 * parsing and the "is this actually a video" check are all unit-tested with no
 * network and no database.
 *
 * @see https://openrouter.ai/docs/features/video-generation
 */

const VIDEO_URL = "https://openrouter.ai/api/v1/videos";

/**
 * Seedance 2.0 Mini.
 *
 * The brief asked for "Seedance Mini 2.1", which does not exist; this is the id
 * from the documentation it quoted.
 */
export const VIDEO_MODEL = "bytedance/seedance-2.0-mini";

/**
 * Fifteen seconds, the model's maximum in a single call.
 *
 * The original brief described stitching four 5-second clips to reach twenty,
 * which was written against an older cap. `duration` accepts 4 to 15, and one
 * call needs no stitching — which matters because FFmpeg cannot run in a Convex
 * action, so concatenating MP4s server-side was never available anyway.
 */
export const MAX_DURATION_SECONDS = 15;
export const DURATION_CHOICES = [5, 8, 10, 12, 15] as const;
export const RESOLUTION_CHOICES = ["480p", "720p"] as const;
export const ASPECT_CHOICES = ["16:9", "9:16", "1:1", "4:3"] as const;

/** A prompt long enough to describe a scene, short enough to stay one. */
export const MAX_PROMPT_CHARS = 2000;

// --- Timing ---------------------------------------------------------------
//
// A 15-second clip on a "mini" model is documented at roughly one to five
// minutes. Everything below is chosen against that, not guessed.

/** Long enough for the provider to accept the job, short enough to fail fast. */
export const SUBMIT_TIMEOUT_MS = 60_000;
export const POLL_TIMEOUT_MS = 20_000;
export const DOWNLOAD_TIMEOUT_MS = 120_000;

/** The video is never ready instantly; polling sooner just wastes a request. */
export const FIRST_POLL_DELAY_MS = 15_000;

/**
 * Caps, deliberately both.
 *
 * Scheduler delays are a floor rather than a promise, so an attempt count alone
 * could stretch across an hour under load. The attempt cap is the belt and the
 * wall-clock deadline is the braces; whichever is reached first ends the job.
 * Twelve minutes is about 2.4x the documented worst case — long enough to ride
 * out provider queueing, short enough that a wedged job resolves while somebody
 * is still around to care.
 */
export const MAX_POLL_ATTEMPTS = 40;
export const DEADLINE_MS = 12 * 60_000;

/** How long after the deadline the watchdog steps in. */
export const WATCHDOG_GRACE_MS = 90_000;

/** Consecutive transient failures before a job is called dead. */
export const MAX_CONSECUTIVE_POLL_ERRORS = 6;

/**
 * How long to wait before the next poll.
 *
 * Fast while the answer is plausibly imminent, slower once the job is already
 * unusual. Ten seconds for the first two minutes costs at most twelve requests
 * and adds at most ten seconds of latency in the common case; past that the
 * admin has stopped watching the screen anyway.
 */
export function nextPollDelayMs(attempt: number): number {
  if (attempt <= 12) return 10_000;
  if (attempt <= 24) return 20_000;
  return 30_000;
}

/** Exponential backoff for transient errors, capped so it stays a retry. */
export function errorDelayMs(consecutiveErrors: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.max(0, consecutiveErrors));
}

// --- Pure decisions -------------------------------------------------------

export type PollOutcome =
  | { kind: "pending" }
  | { kind: "ready"; videoUrl: string }
  | { kind: "failed"; message: string };

/**
 * Read a poll response.
 *
 * `completed` with no URL is treated as a failure rather than as "keep
 * waiting": the provider has said it is done, so waiting longer cannot help,
 * and a job that polls forever against a finished id is worse than one that
 * reports the truth.
 */
export function parsePoll(payload: unknown): PollOutcome {
  if (typeof payload !== "object" || payload === null) {
    return { kind: "failed", message: "The provider returned something unreadable." };
  }
  const body = payload as Record<string, unknown>;
  const status = typeof body.status === "string" ? body.status : "";

  if (status === "failed" || status === "error" || status === "cancelled") {
    const error = body.error;
    const message =
      typeof error === "string" && error.trim().length > 0
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "The provider could not generate this video.";
    return { kind: "failed", message };
  }

  if (status === "completed" || status === "succeeded") {
    const urls = body.unsigned_urls;
    const first =
      Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string" ? urls[0] : null;
    if (first === null || first.length === 0) {
      return { kind: "failed", message: "The provider reported success but returned no video." };
    }
    return { kind: "ready", videoUrl: first };
  }

  return { kind: "pending" };
}

/**
 * Whether an HTTP failure is worth retrying.
 *
 * A rejected key or a malformed request will not fix itself in thirty seconds,
 * and forty polls against a dead key is forty wasted invocations. A 404 is
 * transient on purpose: a polling URL can legitimately 404 in the first seconds
 * after a job is submitted.
 */
export function classifyHttpFailure(status: number): "terminal" | "transient" {
  if (status === 401 || status === 403) return "terminal";
  if (status === 400 || status === 422) return "terminal";
  return "transient";
}

/**
 * Whether these bytes are an MP4.
 *
 * An error page fetched from a CDN is a 200 with HTML in it. Without this check
 * that HTML gets attached to a lesson labelled `video/mp4`, and a teacher opens
 * the lesson to a black rectangle with no indication anything went wrong.
 *
 * The check is the ISO base-media `ftyp` box at offset 4, which every MP4 the
 * provider can return will carry.
 */
export function looksLikeMp4(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  return (
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 //   p
  );
}

/** Trim a prompt to something the provider will accept. */
export function clampPrompt(prompt: string): string {
  return prompt.trim().slice(0, MAX_PROMPT_CHARS);
}

/** The instruction that turns a policy document into a scene description. */
export const PROMPT_DRAFT_SYSTEM = [
  "You write prompts for a text-to-video model that renders a single continuous shot.",
  "You are given a school policy or training document.",
  "Write one vivid, concrete visual description of a scene that illustrates its main idea:",
  "the setting, who is in frame, what they do, the camera movement, the lighting and the mood.",
  "Describe only what a camera can see. No narration, no captions, no on-screen text,",
  "no lists, no headings, and no words the model should render as letters.",
  "Keep it under 120 words.",
].join(" ");

// --- The network edge -----------------------------------------------------

/** What `POST /videos` gives back: a job, not a video. */
export type SubmitResult = { providerJobId: string; pollingUrl: string };

/** Submit a generation job. */
export async function submitVideo(args: {
  apiKey: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
}): Promise<SubmitResult> {
  const response = await fetch(VIDEO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Cliffview Academy",
    },
    body: JSON.stringify({
      model: VIDEO_MODEL,
      prompt: clampPrompt(args.prompt),
      duration: args.durationSeconds,
      resolution: args.resolution,
      aspect_ratio: args.aspectRatio,
    }),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new OpenRouterError(
      `OpenRouter refused the video request (${response.status}). ${body.slice(0, 400)}`,
    );
  }

  const payload: unknown = await response.json();
  const body = (payload ?? {}) as Record<string, unknown>;
  const providerJobId = typeof body.id === "string" ? body.id : "";
  const pollingUrl = typeof body.polling_url === "string" ? body.polling_url : "";
  if (pollingUrl.length === 0) {
    throw new OpenRouterError("OpenRouter accepted the job but returned no polling URL.");
  }
  return { providerJobId, pollingUrl };
}

/** Ask the provider how a job is going. Throws with the status on a failure. */
export async function pollVideo(args: {
  apiKey: string;
  pollingUrl: string;
}): Promise<{ outcome: PollOutcome } | { httpStatus: number; message: string }> {
  const response = await fetch(args.pollingUrl, {
    headers: { Authorization: `Bearer ${args.apiKey}` },
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    return { httpStatus: response.status, message: body.slice(0, 200) };
  }
  return { outcome: parsePoll(await response.json()) };
}

/**
 * Download the finished video.
 *
 * "Unsigned" is the provider's word rather than a guarantee, so a 401 or 403 is
 * retried once with the API key attached before being treated as a failure.
 */
export async function downloadVideo(args: {
  apiKey: string;
  videoUrl: string;
}): Promise<Uint8Array> {
  let response = await fetch(args.videoUrl, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    response = await fetch(args.videoUrl, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  }

  if (!response.ok) {
    throw new OpenRouterError(`Could not download the generated video (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
