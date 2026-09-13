"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  MAX_GENERATED_QUESTIONS,
  OpenRouterError,
  generateQuestions,
  openRouterKey,
  toBase64,
} from "./lib/openrouter";
import { DOWNLOAD_URL_TTL_SECONDS, r2 } from "./lib/storage";

/**
 * Generating assessment questions from a module's own documents.
 *
 * The action lives here, apart from the queries and mutations in
 * `aiReviewQueue.ts`, because a Convex file that runs in the Node runtime
 * cannot also export queries or mutations.
 *
 * What this deliberately is not: there is no vector database, no embedding
 * step and no text-extraction service. Retrieval solves "the corpus is larger
 * than the context window", and a school policy document is not — the model
 * holds a million tokens and reads a PDF natively, so the whole document goes
 * in as one message. Adding a parser and a vector store would be three more
 * systems to run for a school with nine modules.
 *
 * The generated questions land in `aiQuestions` as `pending`, never in the live
 * assessment bank. A model's reading of a safeguarding policy is a draft an
 * administrator approves, not content a teacher is graded on.
 */

export const generateFromAsset = action({
  args: {
    assetId: v.id("assets"),
    /** How many to ask for. The model may return fewer, and says so. */
    count: v.optional(v.number()),
  },
  returns: v.object({
    generationId: v.id("aiGenerations"),
    questionCount: v.number(),
    discarded: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    generationId: Id<"aiGenerations">;
    questionCount: number;
    discarded: number;
  }> => {
    // First line, and a real gate: an action has no `ctx.db`, so the admin check
    // lives in the internal query and identity propagates into `runQuery`.
    // Same shape as `invites.resend`.
    const asset = await ctx.runQuery(internal.aiReviewQueue.sourceAsset, {
      assetId: args.assetId,
    });

    const key = openRouterKey();
    if (key === null) {
      throw new ConvexError({
        code: "NOT_CONFIGURED",
        message: "Question generation is not configured. Set OPENROUTER_API_KEY on the deployment.",
      });
    }

    // Opened before any model call, so a failure has somewhere to be recorded.
    // An admin who kicked off a generation and saw nothing is the failure mode
    // the whole `aiGenerations` table exists to prevent.
    const generationId = await ctx.runMutation(internal.aiReviewQueue.openGeneration, {
      moduleId: asset.moduleId,
      r2Key: asset.r2Key,
      sourceFileName: asset.fileName,
    });

    try {
      // Fetched here rather than handing OpenRouter a signed URL: a presigned
      // link is an expiring credential to our own bucket, and posting the bytes
      // keeps it inside this function. It also fails honestly — either we read
      // the file or we do not, with no dependence on a third party reaching R2.
      const url = await r2.getUrl(asset.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
      const download = await fetch(url);
      if (!download.ok) {
        throw new OpenRouterError(`Could not read the file from storage (${download.status}).`);
      }
      const bytes = new Uint8Array(await download.arrayBuffer());

      const result = await generateQuestions({
        apiKey: key,
        fileName: asset.fileName,
        fileBase64: toBase64(bytes),
        contentType: asset.contentType,
        moduleTitle: asset.moduleTitle,
        requestedCount: args.count ?? 8,
      });

      await ctx.runMutation(internal.aiReviewQueue.recordQuestions, {
        generationId,
        moduleId: asset.moduleId,
        questions: result.questions,
      });

      return {
        generationId,
        questionCount: result.questions.length,
        discarded: result.discarded,
      };
    } catch (caught) {
      // The run is marked failed with the reason attached, then the error is
      // rethrown so the admin sees it now rather than discovering a stuck
      // "running" row later.
      const message =
        caught instanceof Error ? caught.message : "Question generation failed unexpectedly.";
      await ctx.runMutation(internal.aiReviewQueue.failGeneration, {
        generationId,
        errorMessage: message.slice(0, 500),
      });
      throw new ConvexError({ code: "GENERATION_FAILED", message });
    }
  },
});

export { MAX_GENERATED_QUESTIONS };
