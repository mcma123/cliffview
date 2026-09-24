import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { COUNTER, bumpCounter, readCounter } from "./lib/counts";
import { MAX_OPTIONS, MAX_SIBLINGS, nextQuestionOrder, renumberQuestions } from "./lib/ordering";
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

/** The statuses that mean a reviewer has already dealt with a draft. */
const DECIDED = ["approved", "rejected", "edited"] as const;

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
  /** Narrow to one generation run. Omitted means every pending draft. */
  args: { generationId: v.optional(v.id("aiGenerations")) },
  returns: v.object({
    questions: v.array(
      v.object({
        question: schema.doc("aiQuestions"),
        moduleTitle: v.string(),
        moduleSlug: v.string(),
        options: v.array(schema.doc("aiQuestionOptions")),
        /** The PDF this draft came from, so a card can say which upload it is. */
        sourceFileName: v.union(v.string(), v.null()),
      }),
    ),
    generations: v.array(
      v.object({
        run: schema.doc("aiGenerations"),
        /** Drafts from this run still awaiting review, for the filter's count. */
        pendingCount: v.number(),
      }),
    ),
    /** Every draft still awaiting review, counted whole even if the list is capped. */
    pendingCount: v.number(),
    /** Decided drafts still stored — exactly what "Clear reviewed" would remove. */
    reviewedCount: v.number(),
    /** Decisions made, all time. A tally of judgements, not of rows. */
    decisions: v.object({
      approved: v.number(),
      rejected: v.number(),
      edited: v.number(),
    }),
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
    /**
     * Modules an uploaded document can be attached to, so the generate screen
     * can offer its own uploader instead of sending an admin to the module
     * editor and back. Id and title only: this is a picker, not a module read.
     */
    modules: v.array(v.object({ id: v.id("modules"), title: v.string() })),
    configured: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const modules = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_SIBLINGS);
    const moduleById = new Map(modules.map((module) => [module._id, module]));

    // Pending only, and read through an index range rather than scanned.
    //
    // This used to be `withIndex("by_status")` with no `q.eq(...)` — a full
    // scan returning every question ever generated, in status-string order:
    // approved, edited, pending, rejected. So a reviewer saw everything they
    // had already dealt with, and the `.take` truncated *before* the sort
    // below could reorder anything. Past 200 decided rows, freshly generated
    // drafts would have stopped appearing at all.
    const pending = await ctx.db
      .query("aiQuestions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(MAX_QUEUE);

    const runs = await ctx.db
      .query("aiGenerations")
      .withIndex("by_status_and_startedAt")
      .take(MAX_QUEUE);
    runs.sort((a, b) => b.startedAt - a.startedAt);
    const runById = new Map(runs.map((run) => [run._id, run]));

    // `by_generationId` has existed since this table did and never had a
    // reader, which is why nothing could ask for "the run I just started".
    const selected =
      args.generationId === undefined
        ? pending
        : pending.filter((question) => question.generationId === args.generationId);

    const questions = [];
    for (const question of selected) {
      const module = moduleById.get(question.moduleId);
      const options = await ctx.db
        .query("aiQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
        .take(MAX_OPTIONS);
      const run =
        question.generationId === undefined ? undefined : runById.get(question.generationId);
      questions.push({
        question,
        moduleTitle: module?.title ?? "Unknown module",
        moduleSlug: module?.slug ?? "",
        options,
        sourceFileName: run?.sourceFileName ?? null,
      });
    }
    // Newest first. Everything here is pending, so there is no status to rank.
    questions.sort((a, b) => b.question._creationTime - a.question._creationTime);

    const pendingByRun = new Map<string, number>();
    for (const question of pending) {
      if (question.generationId === undefined) continue;
      pendingByRun.set(question.generationId, (pendingByRun.get(question.generationId) ?? 0) + 1);
    }

    // Two different numbers, deliberately kept apart.
    //
    // The decision tallies come from the counters: "14 approved so far" is a
    // record of judgements made, and deleting the paperwork afterwards does
    // not un-make one. The *reviewed* count is a row count, because it is the
    // label on a delete button — it has to mean "this many rows will go", and
    // `clearReviewed` removes exactly the window read here.
    const decisions = {
      approved: await readCounter(ctx, COUNTER.aiQuestionsApproved),
      rejected: await readCounter(ctx, COUNTER.aiQuestionsRejected),
      edited: await readCounter(ctx, COUNTER.aiQuestionsEdited),
    };

    let reviewedCount = 0;
    for (const status of DECIDED) {
      const rows = await ctx.db
        .query("aiQuestions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(MAX_QUEUE);
      reviewedCount += rows.length;
    }

    // The whole pending count, from the counter, so the chip stays honest when
    // there are more drafts than one page of the list can carry.
    const pendingCount = await readCounter(ctx, COUNTER.aiQuestionsPending);

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
      pendingCount,
      reviewedCount,
      decisions,
      generations: runs.slice(0, 10).map((run) => ({
        run,
        pendingCount: pendingByRun.get(run._id) ?? 0,
      })),
      sources,
      // Already loaded above for the source scan, so this costs no extra reads.
      modules: modules.map((module) => ({ id: module._id, title: module.title })),
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

    // One decision per draft, and this guard is the whole reason the module
    // assessment stopped filling with duplicates.
    //
    // Approving inserts a real `assessmentQuestions` row below. Nothing here
    // used to check whether that had already happened, and the queue kept
    // decided cards on screen so a reviewer could "undo a misclick by
    // re-deciding" — so a second click inserted the same question again. It
    // was not hypothetical: one prompt reached a live module five times.
    //
    // Server-side because this mutation is public: a hidden button is not a
    // gate. Undoing an approval belongs in the module's assessment builder,
    // which owns the question that was actually created.
    if (question.status !== "pending") {
      throw new ConvexError({
        code: "ALREADY_DECIDED",
        message: `That question was already ${question.status}. Edit or remove it from the module's assessment instead.`,
      });
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

    await ctx.db.patch("aiQuestions", question._id, {
      status: args.decision,
      reviewedBy: actor.userId,
      reviewedAt: now,
      // The question this approval produced. Without it there is no way to
      // find what a draft became, which is why the old code could strand an
      // assessment question nobody could locate.
      ...(assessmentQuestionId === null ? {} : { assessmentQuestionId }),
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
    // Always, now: the guard above refuses anything that was not pending.
    await bumpCounter(ctx, COUNTER.aiQuestionsPending, -1);
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

/**
 * Delete one draft and its options.
 *
 * Distinct from rejecting, which keeps the row as a record of a judgement. A
 * discard is for a draft nobody wants to judge — a run that came back as
 * nonsense — and it leaves nothing behind.
 *
 * Deliberately does **not** touch `assessmentQuestions`. A draft that was
 * approved has already become a real question on the module; deleting the
 * draft is tidying the queue, not retracting the question. Removing that is
 * the assessment builder's job.
 */
export const discardQuestion = mutation({
  args: { questionId: v.id("aiQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const question = await ctx.db.get("aiQuestions", args.questionId);
    if (question === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That question no longer exists." });
    }

    await deleteDraft(ctx, question);

    await recordAudit(ctx, {
      actor,
      action: "aiQuestion.discard",
      entityTable: "aiQuestions",
      entityId: question._id,
      summary: question.prompt.slice(0, 80),
    });
    return null;
  },
});

/**
 * Delete every draft that has already been decided.
 *
 * Until now nothing in the app could remove an `aiQuestions` row, so the table
 * only ever grew — and since the queue read it unfiltered, every decided draft
 * stayed on screen forever.
 *
 * Approved questions are untouched: they live on their module as
 * `assessmentQuestions` and are what a teacher is graded on. This clears the
 * paperwork, not the work.
 */
export const clearReviewed = mutation({
  args: {},
  returns: v.object({ removed: v.number() }),
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);

    let removed = 0;
    for (const status of DECIDED) {
      const rows = await ctx.db
        .query("aiQuestions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(MAX_QUEUE);
      for (const question of rows) {
        await deleteDraft(ctx, question);
        removed += 1;
      }
    }

    await recordAudit(ctx, {
      actor,
      action: "aiQuestion.clearReviewed",
      entityTable: "aiQuestions",
      entityId: "reviewed",
      summary: `${removed} reviewed draft${removed === 1 ? "" : "s"} removed`,
    });
    return { removed };
  },
});

/**
 * Remove a draft, its options, and its decision history.
 *
 * The pending counter is a row count that the dashboard tile reads, so it has
 * to follow. The approved/rejected/edited counters are tallies of *decisions
 * made* — "1 edited so far" — and deleting the paperwork does not un-make the
 * judgement, so they are deliberately left alone.
 */
async function deleteDraft(ctx: MutationCtx, question: Doc<"aiQuestions">): Promise<void> {
  const options = await ctx.db
    .query("aiQuestionOptions")
    .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
    .take(MAX_OPTIONS);
  for (const option of options) await ctx.db.delete("aiQuestionOptions", option._id);

  const decisions = await ctx.db
    .query("aiReviewDecisions")
    .withIndex("by_questionId_and_decidedAt", (q) => q.eq("questionId", question._id))
    .take(MAX_QUEUE);
  for (const decision of decisions) await ctx.db.delete("aiReviewDecisions", decision._id);

  await ctx.db.delete("aiQuestions", question._id);
  if (question.status === "pending") await bumpCounter(ctx, COUNTER.aiQuestionsPending, -1);
}

/**
 * Remove assessment questions that an un-guarded approval duplicated.
 *
 * `setDecision` now refuses a draft that was already decided, so no new
 * duplicates can appear. This is for the ones that already did: on production
 * one prompt reached a module's assessment five times, because the queue kept
 * decided cards on screen and every re-approval inserted again.
 *
 * `internalMutation`, so no client can reach it, and it takes `confirm` the
 * way `seed.run` does — it deletes live content a teacher is graded on. Run
 * it with `dryRun: true` first: that reports what it would remove and writes
 * nothing.
 *
 * Keeps the earliest copy of each prompt within a module, on the grounds that
 * it is the one whose position in the bank people may already have seen, then
 * renumbers so `order` stays dense.
 */
export const dedupeAssessmentQuestions = internalMutation({
  args: {
    confirm: v.string(),
    /** Report only. Defaults to true so a careless call cannot delete. */
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    duplicates: v.number(),
    removed: v.number(),
    details: v.array(v.object({ moduleTitle: v.string(), prompt: v.string(), copies: v.number() })),
  }),
  handler: async (ctx, args) => {
    if (args.confirm !== "cliffview") {
      throw new ConvexError({
        code: "CONFIRM_REQUIRED",
        message: 'Pass confirm: "cliffview" to run this. It deletes assessment questions.',
      });
    }
    const dryRun = args.dryRun ?? true;

    const modules = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_SIBLINGS);
    const details = [];
    let duplicates = 0;
    let removed = 0;

    for (const module of modules) {
      const rows = await ctx.db
        .query("assessmentQuestions")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
        .take(MAX_SIBLINGS);

      // Earliest first, so the survivor of each group is the original.
      rows.sort((a, b) => a._creationTime - b._creationTime);

      const seen = new Map<string, number>();
      const doomed = [];
      for (const row of rows) {
        const key = row.prompt.trim().toLowerCase();
        const count = seen.get(key) ?? 0;
        seen.set(key, count + 1);
        if (count > 0) doomed.push(row);
      }
      if (doomed.length === 0) continue;

      duplicates += doomed.length;
      for (const [key, count] of seen) {
        if (count <= 1) continue;
        const original = rows.find((row) => row.prompt.trim().toLowerCase() === key);
        details.push({
          moduleTitle: module.title,
          prompt: (original?.prompt ?? key).slice(0, 80),
          copies: count,
        });
      }

      if (dryRun) continue;

      for (const row of doomed) {
        const options = await ctx.db
          .query("assessmentQuestionOptions")
          .withIndex("by_questionId_and_order", (q) => q.eq("questionId", row._id))
          .take(MAX_OPTIONS);
        for (const option of options) {
          await ctx.db.delete("assessmentQuestionOptions", option._id);
        }
        await ctx.db.delete("assessmentQuestions", row._id);
        removed += 1;
      }
      await renumberQuestions(ctx, module._id);
      await ctx.db.patch("modules", module._id, stamp());
    }

    return { duplicates, removed, details };
  },
});
