import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { COUNTER, bumpCounter } from "./lib/counts";
import { MAX_OPTIONS, MAX_SIBLINGS, nextQuestionOrder } from "./lib/ordering";
import { normaliseOrThrow } from "./lib/questions";
import schema from "./schema";
import { questionDifficulty, reviewDecision } from "./validators";

/**
 * The review queue: reading generated questions, and deciding what happens to
 * them.
 *
 * Separate from `aiReview.ts` because that file runs in the Node runtime, and a
 * Convex module cannot mix `"use node"` with queries and mutations.
 *
 * The shape of the thing: a generated question is a **draft**. It sits in
 * `aiQuestions` with `status: "pending"` and is graded against nobody. Approving
 * it is what copies it into `assessmentQuestions`, through exactly the same
 * validation an admin's hand-typed question passes — which is why
 * `normaliseOrThrow` moved to `convex/lib/questions.ts` rather than being
 * duplicated here. A model that returns two correct answers is refused on the
 * same line a person would be.
 */

const MAX_QUEUE = 200;

// ---------------------------------------------------------------------------
// Internal: used by the generation action
// ---------------------------------------------------------------------------

/** The document to read, with everything the action needs to describe it. */
export const sourceAsset = internalQuery({
  args: { assetId: v.id("assets") },
  returns: v.object({
    moduleId: v.id("modules"),
    moduleTitle: v.string(),
    r2Key: v.string(),
    fileName: v.string(),
    contentType: v.string(),
  }),
  handler: async (ctx, args) => {
    // The gate for `aiReview.generateFromAsset`, which cannot call it directly.
    await requireAdmin(ctx);

    const asset = await ctx.db.get("assets", args.assetId);
    if (asset === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That asset no longer exists." });
    }
    if (asset.r2Key === undefined) {
      throw new ConvexError({
        code: "NO_FILE",
        message: "That asset has no file attached yet, so there is nothing to read.",
      });
    }
    const module = await ctx.db.get("modules", asset.moduleId);
    if (module === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
    }
    return {
      moduleId: module._id,
      moduleTitle: module.title,
      r2Key: asset.r2Key,
      fileName: asset.fileName ?? `${asset.title}.pdf`,
      // A default rather than a refusal: the browser's reported type is a first
      // guess anyway, and PDF is what these documents are.
      contentType: asset.contentType ?? "application/pdf",
    };
  },
});

export const openGeneration = internalMutation({
  args: {
    moduleId: v.id("modules"),
    r2Key: v.string(),
    sourceFileName: v.string(),
  },
  returns: v.id("aiGenerations"),
  handler: async (ctx, args) =>
    await ctx.db.insert("aiGenerations", {
      status: "running",
      moduleId: args.moduleId,
      r2Key: args.r2Key,
      sourceFileName: args.sourceFileName,
      startedAt: Date.now(),
      questionCount: 0,
    }),
});

export const failGeneration = internalMutation({
  args: { generationId: v.id("aiGenerations"), errorMessage: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("aiGenerations", args.generationId, {
      status: "failed",
      completedAt: Date.now(),
      errorMessage: args.errorMessage,
    });
    return null;
  },
});

export const recordQuestions = internalMutation({
  args: {
    generationId: v.id("aiGenerations"),
    moduleId: v.id("modules"),
    questions: v.array(
      v.object({
        prompt: v.string(),
        difficulty: questionDifficulty,
        confidencePercent: v.number(),
        options: v.array(v.object({ text: v.string(), isCorrect: v.boolean() })),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const question of args.questions) {
      const questionId = await ctx.db.insert("aiQuestions", {
        moduleId: args.moduleId,
        generationId: args.generationId,
        prompt: question.prompt.trim(),
        difficulty: question.difficulty,
        // Clamped: a model is free to return 140, and a confidence over 100
        // would render as a meter past the end of its track.
        confidencePercent: Math.max(0, Math.min(100, Math.round(question.confidencePercent))),
        status: "pending",
      });
      for (let i = 0; i < question.options.length; i++) {
        await ctx.db.insert("aiQuestionOptions", {
          questionId,
          // Display key, kept because `aiQuestionOptions` declares it. The
          // assessment tables deliberately do not — there the letter is derived
          // from order by the presenter.
          key: String.fromCharCode(65 + i),
          text: question.options[i].text.trim(),
          isCorrect: question.options[i].isCorrect,
          order: i + 1,
        });
      }
      await bumpCounter(ctx, COUNTER.aiQuestionsPending, 1);
    }

    await ctx.db.patch("aiGenerations", args.generationId, {
      status: "complete",
      completedAt: Date.now(),
      questionCount: args.questions.length,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The review queue.
 *
 * Pending first, because that is the work; decided questions stay visible so a
 * reviewer can see what they just did and undo a misclick by re-deciding.
 */
export const queue = query({
  args: {},
  returns: v.object({
    questions: v.array(
      v.object({
        question: schema.doc("aiQuestions"),
        moduleTitle: v.string(),
        moduleSlug: v.string(),
        options: v.array(schema.doc("aiQuestionOptions")),
      }),
    ),
    generations: v.array(schema.doc("aiGenerations")),
    /** Documents that could be read, so the screen can offer them. */
    sources: v.array(
      v.object({
        assetId: v.id("assets"),
        title: v.string(),
        fileName: v.string(),
        moduleId: v.id("modules"),
        moduleTitle: v.string(),
      }),
    ),
    configured: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const modules = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_SIBLINGS);
    const moduleById = new Map(modules.map((module) => [module._id, module]));

    const rows = await ctx.db.query("aiQuestions").withIndex("by_status").take(MAX_QUEUE);
    const questions = [];
    for (const question of rows) {
      const module = moduleById.get(question.moduleId);
      const options = await ctx.db
        .query("aiQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
        .take(MAX_OPTIONS);
      questions.push({
        question,
        moduleTitle: module?.title ?? "Unknown module",
        moduleSlug: module?.slug ?? "",
        options,
      });
    }
    // Pending first; within that, newest first.
    const rank = (status: string) => (status === "pending" ? 0 : 1);
    questions.sort(
      (a, b) =>
        rank(a.question.status) - rank(b.question.status) ||
        b.question._creationTime - a.question._creationTime,
    );

    const generations = await ctx.db
      .query("aiGenerations")
      .withIndex("by_status_and_startedAt")
      .take(MAX_QUEUE);
    generations.sort((a, b) => b.startedAt - a.startedAt);

    const sources = [];
    for (const module of modules) {
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
        .take(MAX_SIBLINGS);
      for (const asset of assets) {
        // Only what can actually be read: a document with bytes behind it.
        if (asset.r2Key === undefined) continue;
        if (asset.kind !== "document" && asset.kind !== "worksheet") continue;
        sources.push({
          assetId: asset._id,
          title: asset.title,
          fileName: asset.fileName ?? asset.title,
          moduleId: module._id,
          moduleTitle: module.title,
        });
      }
    }

    return {
      questions,
      generations: generations.slice(0, 10),
      sources,
      // Reported rather than assumed, so the screen can say "not configured"
      // instead of offering a button that fails.
      configured: (process.env.OPENROUTER_API_KEY ?? "").length > 0,
    };
  },
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Approve, reject, or edit-and-approve one generated question.
 *
 * Approving is the only path from a draft to something a teacher is graded on,
 * and it runs `normaliseOrThrow` — the same validation an admin's hand-typed
 * question passes. A model that returned two correct answers is refused here
 * exactly as a person would be.
 */
export const setDecision = mutation({
  args: {
    questionId: v.id("aiQuestions"),
    decision: reviewDecision,
    /** Set when the reviewer rewrote the prompt before approving. */
    editedPrompt: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.object({ assessmentQuestionId: v.union(v.id("assessmentQuestions"), v.null()) }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const question = await ctx.db.get("aiQuestions", args.questionId);
    if (question === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That question no longer exists." });
    }

    const now = Date.now();
    const prompt = args.editedPrompt?.trim() ?? question.prompt;

    let assessmentQuestionId: Id<"assessmentQuestions"> | null = null;

    if (args.decision !== "rejected") {
      const module = await ctx.db.get("modules", question.moduleId);
      if (module === null) {
        throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
      }

      const options = await ctx.db
        .query("aiQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
        .take(MAX_OPTIONS);

      // The same gate the builder uses. A generated question earns no exemption.
      const normalised = normaliseOrThrow(
        "multiple_choice",
        prompt,
        options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })),
      );

      assessmentQuestionId = await ctx.db.insert("assessmentQuestions", {
        moduleId: module._id,
        kind: "multiple_choice",
        prompt: normalised.prompt,
        order: await nextQuestionOrder(ctx, module._id),
        ...stamp(),
      });
      for (let i = 0; i < normalised.options.length; i++) {
        await ctx.db.insert("assessmentQuestionOptions", {
          questionId: assessmentQuestionId,
          text: normalised.options[i].text,
          isCorrect: normalised.options[i].isCorrect,
          order: i + 1,
        });
      }
      await ctx.db.patch("modules", module._id, stamp());
    }

    const wasPending = question.status === "pending";
    await ctx.db.patch("aiQuestions", question._id, {
      status: args.decision,
      reviewedBy: actor.userId,
      reviewedAt: now,
      ...(args.editedPrompt === undefined ? {} : { prompt: prompt.trim() }),
    });

    // Append-only: the review history survives a later change of mind.
    await ctx.db.insert("aiReviewDecisions", {
      questionId: question._id,
      decision: args.decision,
      reviewerId: actor.userId,
      decidedAt: now,
      ...(args.editedPrompt === undefined ? {} : { editedPrompt: prompt }),
      ...(args.note === undefined ? {} : { note: args.note }),
    });

    // The dashboard reads these. Moved in the same transaction as the write
    // they count, which is the only thing that keeps a counter honest.
    if (wasPending) await bumpCounter(ctx, COUNTER.aiQuestionsPending, -1);
    await bumpCounter(
      ctx,
      args.decision === "approved"
        ? COUNTER.aiQuestionsApproved
        : args.decision === "rejected"
          ? COUNTER.aiQuestionsRejected
          : COUNTER.aiQuestionsEdited,
      1,
    );

    await recordAudit(ctx, {
      actor,
      action: `aiQuestion.${args.decision}`,
      entityTable: "aiQuestions",
      entityId: question._id,
      summary: prompt.trim().slice(0, 80),
    });

    return { assessmentQuestionId };
  },
});
