"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { OPENROUTER_MODEL, OpenRouterError, openRouterKey, toBase64 } from "./lib/openrouter";
import {
  PROMPT_DRAFT_SYSTEM,
  VIDEO_MODEL,
  classifyHttpFailure,
  downloadVideo,
  looksLikeMp4,
  pollVideo,
  submitVideo,
} from "./lib/openrouterVideo";
import { DOWNLOAD_URL_TTL_SECONDS, MAX_FILE_BYTES, r2 } from "./lib/storage";

/**
 * AI video generation: the three functions that touch the network.
 *
 * `"use node"` because `r2.store` goes through the AWS SDK, which is gated on a
 * Node runtime. A Convex module cannot mix `"use node"` with queries and
 * mutations, so every read and write lives in `aiVideoQueue.ts` — the same
 * split as `aiReview.ts` / `aiReviewQueue.ts`.
 *
 * These three are kept deliberately thin. Everything worth testing — the
 * backoff, the response parsing, the terminal/transient decision, the MP4
 * check, and every state transition — lives in `lib/openrouterVideo.ts` or in
 * the queue's mutations, because a `fetch` to a paid third party cannot be
 * exercised by `npm test` without either mocking the network (which tests the
 * mock) or spending money on every run.
 */

/** OpenRouter's chat completions endpoint, for the prompt-drafting step. */
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Read a document and propose a video prompt.
 *
 * Phase one of two, and the reason the feature is two actions rather than one:
 * the prompt is what an admin reads, edits and approves before any money is
 * spent on rendering.
 *
 * Gated by `sourceForDraft`, which runs `requireAdmin` — an action has no
 * `ctx.db`, so the internal query it calls first *is* the gate.
 */
export const draftPrompt = action({
  args: { jobId: v.id("aiVideoJobs"), assetId: v.id("assets") },
  returns: v.object({ prompt: v.string() }),
  handler: async (ctx, args): Promise<{ prompt: string }> => {
    const source = await ctx.runQuery(internal.aiVideoQueue.sourceForDraft, {
      assetId: args.assetId,
    });

    const apiKey = openRouterKey();
    if (apiKey === null) {
      throw new ConvexError({
        code: "NOT_CONFIGURED",
        message: "Video generation is not configured. Set OPENROUTER_API_KEY on the deployment.",
      });
    }

    try {
      // The bytes are posted rather than a signed URL, for the reason
      // `aiReview` gives: a presigned link is an expiring credential to our own
      // bucket, and posting the file keeps it inside this function.
      const url = await r2.getUrl(source.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
      const download = await fetch(url);
      if (!download.ok) {
        throw new OpenRouterError(`Could not read the document from storage (${download.status}).`);
      }
      const bytes = new Uint8Array(await download.arrayBuffer());

      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Cliffview Academy",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
          messages: [
            { role: "system", content: PROMPT_DRAFT_SYSTEM },
            {
              role: "user",
              content: [
                {
                  type: "file",
                  file: {
                    filename: source.fileName,
                    file_data: `data:${source.contentType};base64,${toBase64(bytes)}`,
                  },
                },
                {
                  type: "text",
                  text: "Write the video prompt for this document. Reply with the prompt only.",
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new OpenRouterError(
          `OpenRouter refused the request (${response.status}). ${body.slice(0, 400)}`,
        );
      }

      const payload: unknown = await response.json();
      const prompt = readContent(payload);
      if (prompt === null) {
        throw new OpenRouterError("The model did not return a prompt.");
      }

      await ctx.runMutation(internal.aiVideoQueue.recordDraft, {
        jobId: args.jobId,
        draftPrompt: prompt,
      });
      return { prompt };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Drafting the prompt failed.";
      await ctx.runMutation(internal.aiVideoQueue.failJob, {
        jobId: args.jobId,
        errorMessage: message,
      });
      throw new ConvexError({ code: "DRAFT_FAILED", message });
    }
  },
});

/**
 * Submit the video for rendering.
 *
 * Returns as soon as the provider accepts the job. It does **not** wait for the
 * video: rendering takes minutes, and an action holding a promise open for that
 * long is a browser tab that fails on a deploy. The screen subscribes to the
 * job row instead.
 */
export const startGeneration = action({
  args: {
    jobId: v.id("aiVideoJobs"),
    prompt: v.string(),
    durationSeconds: v.number(),
    resolution: v.string(),
    aspectRatio: v.string(),
  },
  returns: v.object({ lessonTitle: v.string() }),
  handler: async (ctx, args): Promise<{ lessonTitle: string }> => {
    const apiKey = openRouterKey();
    if (apiKey === null) {
      throw new ConvexError({
        code: "NOT_CONFIGURED",
        message: "Video generation is not configured. Set OPENROUTER_API_KEY on the deployment.",
      });
    }

    // The gate for everything downstream. Also the claim: a second click reads
    // "generating" and is refused here rather than submitting twice.
    const claim = await ctx.runMutation(internal.aiVideoQueue.claimForGeneration, {
      jobId: args.jobId,
      prompt: args.prompt,
      durationSeconds: args.durationSeconds,
      resolution: args.resolution,
      aspectRatio: args.aspectRatio,
    });

    try {
      const submitted = await submitVideo({
        apiKey,
        prompt: args.prompt,
        durationSeconds: args.durationSeconds,
        resolution: args.resolution,
        aspectRatio: args.aspectRatio,
      });
      await ctx.runMutation(internal.aiVideoQueue.recordSubmission, {
        jobId: args.jobId,
        providerJobId: submitted.providerJobId,
        pollingUrl: submitted.pollingUrl,
        model: VIDEO_MODEL,
      });
      return claim;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not start the video.";
      await ctx.runMutation(internal.aiVideoQueue.failJob, {
        jobId: args.jobId,
        errorMessage: message,
      });
      throw new ConvexError({ code: "GENERATION_FAILED", message });
    }
  },
});

/**
 * One poll, then hand the outcome back to be recorded.
 *
 * This action never schedules the next poll. Every path ends in a call to
 * `recordPoll` or `attachResult`, and those mutations own the rescheduling, so
 * the row's idea of what happens next and what is actually scheduled share a
 * transaction and cannot drift apart.
 *
 * No authorization of its own: `claimForGeneration` gated this once, and an
 * `internalAction` is unreachable from any client. It takes only a job id, and
 * reads the lesson and settings off the row — so nothing here can be pointed at
 * a lesson the caller chose.
 */
export const poll = internalAction({
  args: { jobId: v.id("aiVideoJobs"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.runQuery(internal.aiVideoQueue.jobForPoll, { jobId: args.jobId });
    // Already finished, cancelled, or polled by a twin. Before the download and
    // before anything is stored, which is what makes a double-schedule cheap.
    if (job === null) return null;

    const apiKey = openRouterKey();
    if (apiKey === null) {
      await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
        jobId: args.jobId,
        attempt: args.attempt,
        outcome: "terminal",
        message: "OPENROUTER_API_KEY was removed while this video was generating.",
      });
      return null;
    }

    let videoUrl: string;
    try {
      const result = await pollVideo({ apiKey, pollingUrl: job.pollingUrl });

      if ("httpStatus" in result) {
        await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
          jobId: args.jobId,
          attempt: args.attempt,
          outcome: classifyHttpFailure(result.httpStatus),
          message: `The provider answered ${result.httpStatus}. ${result.message}`,
        });
        return null;
      }

      if (result.outcome.kind === "pending") {
        await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
          jobId: args.jobId,
          attempt: args.attempt,
          outcome: "pending",
        });
        return null;
      }

      if (result.outcome.kind === "failed") {
        await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
          jobId: args.jobId,
          attempt: args.attempt,
          outcome: "terminal",
          message: result.outcome.message,
        });
        return null;
      }

      videoUrl = result.outcome.videoUrl;
    } catch (caught) {
      // A thrown fetch is a network blip, not a verdict on the job.
      await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
        jobId: args.jobId,
        attempt: args.attempt,
        outcome: "transient",
        message: caught instanceof Error ? caught.message : "The poll failed.",
      });
      return null;
    }

    return await storeAndAttach(ctx, args.jobId, args.attempt, apiKey, videoUrl);
  },
});

/**
 * Download the finished video and put it in the bucket.
 *
 * Stops there. Publishing it to a lesson is a person's decision, made on the
 * AI Videos screen after watching it — the poller's job ends at "the file
 * exists and somebody should look at it".
 *
 * Split out to keep the branching in `poll` readable. The ordering is the
 * careful part: the key is recorded in the database the moment it exists, so a
 * crash immediately after storing still leaves the orphan findable.
 */
async function storeAndAttach(
  ctx: ActionCtx,
  id: Id<"aiVideoJobs">,
  attempt: number,
  apiKey: string,
  videoUrl: string,
): Promise<null> {
  let bytes: Uint8Array;
  try {
    bytes = await downloadVideo({ apiKey, videoUrl });
  } catch (caught) {
    // Retryable: the next poll will report "completed" again and we try once
    // more, bounded by the consecutive-error cap.
    await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
      jobId: id,
      attempt,
      outcome: "transient",
      message: caught instanceof Error ? caught.message : "The download failed.",
    });
    return null;
  }

  if (!looksLikeMp4(bytes) || bytes.byteLength > MAX_FILE_BYTES) {
    // An error page served as a 200 would otherwise reach a lesson labelled
    // video/mp4, and a teacher would open it to a black rectangle.
    await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
      jobId: id,
      attempt,
      outcome: "terminal",
      message: "The provider returned something that is not a playable video.",
    });
    return null;
  }

  let key: string;
  try {
    // No key of our own: `store` throws if metadata already exists for a key it
    // is handed, so letting it mint a uuid is what keeps a retry safe.
    key = await r2.store(ctx, bytes, { type: "video/mp4" });
  } catch (caught) {
    await ctx.runMutation(internal.aiVideoQueue.recordPoll, {
      jobId: id,
      attempt,
      outcome: "transient",
      message: caught instanceof Error ? caught.message : "Could not store the video.",
    });
    return null;
  }

  // Recorded before the job is advanced, so a failure after this point leaves
  // a key the watchdog and the sweep know how to clean up.
  await ctx.runMutation(internal.aiVideoQueue.markStored, { jobId: id, r2Key: key });

  const { recorded } = await ctx.runMutation(internal.aiVideoQueue.recordVideo, {
    jobId: id,
    r2Key: key,
    sizeBytes: bytes.byteLength,
  });

  if (!recorded) {
    // Another poll won the race, or the job was cancelled while this one was
    // downloading. Either way this copy belongs to nobody — honouring the
    // return value is what stops idempotency from leaking a blob.
    await r2.deleteObject(ctx, key);
  }
  return null;
}

/** The assistant's reply text, or null when the model returned nothing usable. */
function readContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content !== "string" || content.trim().length === 0) return null;
  return content.trim();
}
