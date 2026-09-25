import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { MAX_MODULES, MAX_STAFF } from "./lib/counts";
import { createLessonMaterial } from "./lib/lessonMaterial";
import {
  DEADLINE_MS,
  FIRST_POLL_DELAY_MS,
  MAX_CONSECUTIVE_POLL_ERRORS,
  MAX_POLL_ATTEMPTS,
  WATCHDOG_GRACE_MS,
  clampPrompt,
  errorDelayMs,
  nextPollDelayMs,
} from "./lib/openrouterVideo";
import { MAX_SIBLINGS } from "./lib/ordering";
import { deleteBlobIfPresent } from "./lib/storage";
import schema from "./schema";

/**
 * The AI video queue: every read and write for a video job.
 *
 * Separate from `aiVideo.ts` because that file is `"use node"`, and a Convex
 * module cannot mix `"use node"` with queries and mutations. The same split as
 * `aiReview.ts` / `aiReviewQueue.ts`, for the same reason.
 *
 * ## The rule this file exists to enforce
 *
 * **Authorization happens exactly once, in `claimForGeneration`.** After that
 * the job row is the only source of truth: the poller takes `{ jobId, attempt }`
 * and reads the lesson, the prompt and the settings off the row. Nothing
 * downstream accepts a lesson id or a prompt from a caller, which is what stops
 * "poll this URL and attach the result to lesson X" from being a way into the
 * content library.
 *
 * ## And the rule about scheduling
 *
 * **The poller never schedules its own next poll.** Every outcome comes back
 * here to `recordPoll`, which patches the row *and* schedules the next attempt
 * in the same transaction. `ctx.scheduler.runAfter` is transactional, so "the
 * row says attempt 7" and "a poll is actually scheduled" cannot disagree — an
 * action that dies after patching cannot leave a job with no successor.
 */

/** How stale a due poll must be before the sweep calls the job dead. */
const STALE_AFTER_MS = 5 * 60_000;

/** A bounded sweep: tidying is never allowed to become the expensive part. */
const SWEEP_LIMIT = 20;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The document to draft a prompt from.
 *
 * This is the gate for `aiVideo.draftPrompt`, which has no `ctx.db` of its own
 * — the same arrangement as `aiReviewQueue.sourceAsset`. If this ever stopped
 * calling `requireAdmin`, drafting would be open to any signed-in teacher.
 */
export const sourceForDraft = internalQuery({
  args: { assetId: v.id("assets") },
  returns: v.object({
    moduleId: v.id("modules"),
    r2Key: v.string(),
    fileName: v.string(),
    contentType: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const asset = await ctx.db.get("assets", args.assetId);
    if (asset === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That document no longer exists." });
    }
    if (asset.r2Key === undefined) {
      throw new ConvexError({
        code: "NO_FILE",
        message: "That document has no file attached yet, so there is nothing to read.",
      });
    }
    return {
      moduleId: asset.moduleId,
      r2Key: asset.r2Key,
      fileName: asset.fileName ?? `${asset.title}.pdf`,
      contentType: asset.contentType ?? "application/pdf",
    };
  },
});

/** One job, for the poller. Null once the job is finished, which stops a re-run. */
export const jobForPoll = internalQuery({
  args: { jobId: v.id("aiVideoJobs") },
  returns: v.union(
    v.object({
      pollingUrl: v.string(),
      attempts: v.number(),
      consecutiveErrors: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null || job.status !== "generating") return null;
    if (job.pollingUrl === undefined) return null;
    return {
      pollingUrl: job.pollingUrl,
      attempts: job.attempts,
      consecutiveErrors: job.consecutiveErrors,
    };
  },
});

/**
 * The AI videos screen.
 *
 * `now` is an argument rather than `Date.now()` because a query that reads the
 * clock is not a pure function of the database and its subscription would never
 * settle. The same rule `dashboard.adminOverview` follows.
 */
export const jobs = query({
  args: { now: v.number() },
  returns: v.object({
    jobs: v.array(
      v.object({
        job: schema.doc("aiVideoJobs"),
        moduleTitle: v.string(),
        lessonTitle: v.string(),
        /** True when a poll is long overdue — the screen can say so honestly. */
        stalled: v.boolean(),
      }),
    ),
    modules: v.array(
      v.object({
        id: v.id("modules"),
        title: v.string(),
        lessons: v.array(v.object({ id: v.id("lessons"), title: v.string() })),
        documents: v.array(
          v.object({ id: v.id("assets"), title: v.string(), fileName: v.string() }),
        ),
      }),
    ),
    configured: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const modules = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_MODULES);
    const moduleById = new Map(modules.map((module) => [module._id, module]));

    const rows = await ctx.db
      .query("aiVideoJobs")
      .withIndex("by_requestedBy_and_startedAt")
      .take(MAX_STAFF);
    rows.sort((a, b) => b.startedAt - a.startedAt);

    const jobRows = [];
    for (const job of rows.slice(0, 25)) {
      const lesson = await ctx.db.get("lessons", job.lessonId);
      jobRows.push({
        job,
        moduleTitle: moduleById.get(job.moduleId)?.title ?? "Deleted module",
        lessonTitle: lesson?.title ?? "Deleted lesson",
        stalled:
          job.status === "generating" &&
          job.nextPollAt !== undefined &&
          args.now - job.nextPollAt > STALE_AFTER_MS,
      });
    }

    const pickers = [];
    for (const module of modules) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
        .take(MAX_SIBLINGS);
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
        .take(MAX_SIBLINGS);
      pickers.push({
        id: module._id,
        title: module.title,
        lessons: lessons.map((lesson) => ({ id: lesson._id, title: lesson.title })),
        documents: assets
          // Only what can actually be read: a document with bytes behind it.
          .filter(
            (asset) =>
              asset.r2Key !== undefined &&
              (asset.kind === "document" || asset.kind === "worksheet"),
          )
          .map((asset) => ({
            id: asset._id,
            title: asset.title,
            fileName: asset.fileName ?? asset.title,
          })),
      });
    }

    return {
      jobs: jobRows,
      modules: pickers,
      configured: (process.env.OPENROUTER_API_KEY ?? "").length > 0,
    };
  },
});

// ---------------------------------------------------------------------------
// Writes: opening a job and drafting its prompt
// ---------------------------------------------------------------------------

/**
 * Open a job, before any model call.
 *
 * The row exists first so a failure has somewhere to be recorded — the rule
 * `aiReview.generateFromAsset` already follows. An admin who pressed a button
 * and saw nothing is the failure mode this whole table exists to prevent.
 */
export const openJob = mutation({
  args: {
    lessonId: v.id("lessons"),
    sourceAssetId: v.id("assets"),
    title: v.string(),
  },
  returns: v.id("aiVideoJobs"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const lesson = await ctx.db.get("lessons", args.lessonId);
    if (lesson === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That lesson no longer exists." });
    }
    const asset = await ctx.db.get("assets", args.sourceAssetId);
    if (asset === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That document no longer exists." });
    }
    if (asset.moduleId !== lesson.moduleId) {
      throw new ConvexError({
        code: "CROSS_MODULE",
        message: "That document belongs to a different module than that lesson.",
      });
    }
    const title = args.title.trim();
    if (title.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "The video needs a title." });
    }

    // Opportunistic tidying. There are no crons here, so a wedged job would
    // otherwise sit on "generating" until somebody noticed; starting a new one
    // is the moment we are certainly executing.
    await sweepStaleJobs(ctx, Date.now());

    return await ctx.db.insert("aiVideoJobs", {
      lessonId: lesson._id,
      moduleId: lesson.moduleId,
      sourceAssetId: asset._id,
      ...(asset.fileName === undefined ? {} : { sourceFileName: asset.fileName }),
      title,
      status: "drafting",
      requestedBy: actor.userId,
      attempts: 0,
      consecutiveErrors: 0,
      startedAt: Date.now(),
    });
  },
});

/** Store the model's proposed prompt and stop, so a person can read it. */
export const recordDraft = internalMutation({
  args: {
    jobId: v.id("aiVideoJobs"),
    draftPrompt: v.string(),
    suggestedTitle: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null || job.status !== "drafting") return null;

    await ctx.db.patch("aiVideoJobs", job._id, {
      status: "draft_ready",
      draftPrompt: clampPrompt(args.draftPrompt),
      ...(args.suggestedTitle === undefined || args.suggestedTitle.trim().length === 0
        ? {}
        : { title: args.suggestedTitle.trim().slice(0, 120) }),
    });
    return null;
  },
});

/** Mark a job failed. The one way any code path records a terminal error. */
export const failJob = internalMutation({
  args: { jobId: v.id("aiVideoJobs"), errorMessage: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null || isFinished(job)) return null;
    await finish(ctx, job, { status: "failed", errorMessage: args.errorMessage.slice(0, 500) });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Writes: generating
// ---------------------------------------------------------------------------

/**
 * The gate for the whole generation pipeline.
 *
 * Everything after this point runs without an identity, so this is where the
 * admin check, the lesson check and the prompt freeze all happen — in one
 * transaction, which is also what makes the status flip a claim. A second click
 * reads `generating` and is refused rather than submitting the job twice.
 *
 * The same guard, for the same reason, as `setDecision`'s status check: an
 * unguarded re-run there put one question in front of a teacher five times.
 *
 * `internalMutation` rather than public: identity propagates through
 * `runMutation` from the action, so `requireAdmin` still sees the real caller,
 * and nothing can claim a job without also submitting it. The same arrangement
 * as `aiReviewQueue.sourceAsset`.
 */
export const claimForGeneration = internalMutation({
  args: {
    jobId: v.id("aiVideoJobs"),
    prompt: v.string(),
    durationSeconds: v.number(),
    resolution: v.string(),
    aspectRatio: v.string(),
  },
  returns: v.object({ lessonTitle: v.string() }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That video job no longer exists." });
    }
    if (job.status === "generating") {
      throw new ConvexError({
        code: "ALREADY_RUNNING",
        message: "That video is already being generated.",
      });
    }
    if (isFinished(job)) {
      throw new ConvexError({
        code: "ALREADY_DECIDED",
        message: `That job already ${job.status === "complete" ? "finished" : "ended"}. Start a new one.`,
      });
    }

    const lesson = await ctx.db.get("lessons", job.lessonId);
    if (lesson === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That lesson no longer exists." });
    }

    const prompt = clampPrompt(args.prompt);
    if (prompt.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "A video needs a prompt to work from." });
    }

    const now = Date.now();
    const deadlineAt = now + DEADLINE_MS;

    // Scheduled from a mutation, so it exists independently of the action. If
    // the poll action is killed mid-flight — a deploy, a platform error, a
    // throw before its own catch — this is what still resolves the row.
    const watchdogId = await ctx.scheduler.runAfter(
      DEADLINE_MS + WATCHDOG_GRACE_MS,
      internal.aiVideoQueue.watchdog,
      { jobId: job._id },
    );

    await ctx.db.patch("aiVideoJobs", job._id, {
      status: "generating",
      submittedPrompt: prompt,
      durationSeconds: args.durationSeconds,
      resolution: args.resolution,
      aspectRatio: args.aspectRatio,
      requestedBy: actor.userId,
      attempts: 0,
      consecutiveErrors: 0,
      submittedAt: now,
      deadlineAt,
      watchdogId,
    });

    await recordAudit(ctx, {
      actor,
      action: "aiVideo.generate",
      entityTable: "aiVideoJobs",
      entityId: job._id,
      summary: job.title.slice(0, 80),
    });

    return { lessonTitle: lesson.title };
  },
});

/** Record the provider's job id, and schedule the first poll. */
export const recordSubmission = internalMutation({
  args: {
    jobId: v.id("aiVideoJobs"),
    providerJobId: v.string(),
    pollingUrl: v.string(),
    model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null || job.status !== "generating") return null;

    const nextPollAt = Date.now() + FIRST_POLL_DELAY_MS;
    await ctx.db.patch("aiVideoJobs", job._id, {
      providerJobId: args.providerJobId,
      pollingUrl: args.pollingUrl,
      model: args.model,
      nextPollAt,
    });
    await ctx.scheduler.runAfter(FIRST_POLL_DELAY_MS, internal.aiVideo.poll, {
      jobId: job._id,
      attempt: 1,
    });
    return null;
  },
});

/**
 * Every poll outcome lands here, and the next poll is scheduled from here.
 *
 * Keeping the reschedule in the mutation rather than the action is the whole
 * reliability story: the patch and the schedule share a transaction, so the
 * row's idea of what happens next is always the thing that will actually
 * happen.
 */
export const recordPoll = internalMutation({
  args: {
    jobId: v.id("aiVideoJobs"),
    attempt: v.number(),
    outcome: v.union(v.literal("pending"), v.literal("transient"), v.literal("terminal")),
    message: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null || job.status !== "generating") return null;

    const now = Date.now();

    if (args.outcome === "terminal") {
      await finish(ctx, job, {
        status: "failed",
        errorMessage: (args.message ?? "The provider could not generate this video.").slice(0, 500),
      });
      return null;
    }

    const consecutiveErrors = args.outcome === "transient" ? job.consecutiveErrors + 1 : 0;

    if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
      await finish(ctx, job, {
        status: "failed",
        errorMessage: (args.message ?? "The provider stopped responding.").slice(0, 500),
      });
      return null;
    }

    // Both caps checked, and the clock is allowed to win: scheduler delays are
    // a floor, not a promise, so the attempt count alone could stretch for an
    // hour under load.
    if (
      args.attempt >= MAX_POLL_ATTEMPTS ||
      (job.deadlineAt !== undefined && now >= job.deadlineAt)
    ) {
      await finish(ctx, job, {
        status: "failed",
        errorMessage: "Timed out waiting for the provider to finish this video.",
      });
      return null;
    }

    const delay =
      args.outcome === "transient"
        ? errorDelayMs(consecutiveErrors)
        : nextPollDelayMs(args.attempt);

    await ctx.db.patch("aiVideoJobs", job._id, {
      attempts: args.attempt,
      consecutiveErrors,
      lastPolledAt: now,
      nextPollAt: now + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.aiVideo.poll, {
      jobId: job._id,
      attempt: args.attempt + 1,
    });
    return null;
  },
});

/**
 * Record a stored blob before anything tries to use it.
 *
 * The one-line mutation between `r2.store` returning and the attach being
 * attempted. If the attach never happens, this is what makes the orphan
 * findable — the watchdog and the sweep both delete a `pendingR2Key` left on a
 * finished job.
 */
export const markStored = internalMutation({
  args: { jobId: v.id("aiVideoJobs"), r2Key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null) return null;
    await ctx.db.patch("aiVideoJobs", job._id, { pendingR2Key: args.r2Key });
    return null;
  },
});

/**
 * Attach the finished video to its lesson.
 *
 * Returns `{ attached: false }` rather than throwing when the job is no longer
 * claimable, because the caller has a blob in hand and needs to know to delete
 * it. Throwing would leave the object in the bucket with nothing pointing at
 * it. The re-read inside this transaction is what makes two simultaneous polls
 * safe: Convex serialises them, and the second one loses.
 */
export const attachResult = internalMutation({
  args: { jobId: v.id("aiVideoJobs"), r2Key: v.string(), sizeBytes: v.number() },
  returns: v.object({ attached: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null) return { attached: false };
    if (job.status !== "generating" || job.assetId !== undefined) return { attached: false };

    const lesson = await ctx.db.get("lessons", job.lessonId);
    if (lesson === null) {
      // Never fall back to another lesson: the admin chose this one.
      await finish(ctx, job, {
        status: "failed",
        errorMessage: "That lesson was deleted while the video was being generated.",
      });
      return { attached: false };
    }

    const assetId = await createLessonMaterial(ctx, {
      lesson,
      key: args.r2Key,
      fileName: `${slugForFile(job.title)}.mp4`,
      title: job.title,
      kind: "video",
      // The only writer. `r2.store` syncs metadata without an `onComplete`
      // handle, so `assets.applySyncedMetadata` never fires for a
      // server-stored file — get this wrong and a teacher is offered a
      // download link for a video.
      contentType: "video/mp4",
      sizeBytes: args.sizeBytes,
    });

    await finish(ctx, job, {
      status: "complete",
      assetId,
      r2Key: args.r2Key,
    });

    await recordAudit(ctx, {
      actor: { userId: job.requestedBy },
      action: "aiVideo.attach",
      entityTable: "lessons",
      entityId: lesson._id,
      summary: job.title.slice(0, 80),
    });

    return { attached: true };
  },
});

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * The backstop for a job whose action never came back.
 *
 * Scheduled at claim time from a mutation, so it survives the action dying in
 * any way at all. Idempotent: a job that finished normally cancels it, and a
 * late fire on a finished row does nothing.
 */
export const watchdog = internalMutation({
  args: { jobId: v.id("aiVideoJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null || isFinished(job)) return null;
    await finish(ctx, job, {
      status: "failed",
      errorMessage: "Timed out waiting for the provider to finish this video.",
    });
    return null;
  },
});

/**
 * Fail jobs whose next poll is long overdue.
 *
 * The watchdog should mean this never finds anything. It exists because "never"
 * needs to be recoverable rather than permanent, and there is no cron here to
 * do the recovering. Also exposed for `npx convex run`.
 */
export const sweepStale = internalMutation({
  args: {},
  returns: v.object({ swept: v.number() }),
  handler: async (ctx) => ({ swept: await sweepStaleJobs(ctx, Date.now()) }),
});

/** Stop a job an admin no longer wants. */
export const cancel = mutation({
  args: { jobId: v.id("aiVideoJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const job = await ctx.db.get("aiVideoJobs", args.jobId);
    if (job === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That video job no longer exists." });
    }
    if (isFinished(job)) return null;

    await finish(ctx, job, { status: "cancelled" });
    await recordAudit(ctx, {
      actor,
      action: "aiVideo.cancel",
      entityTable: "aiVideoJobs",
      entityId: job._id,
      summary: job.title.slice(0, 80),
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isFinished(job: Doc<"aiVideoJobs">): boolean {
  return job.status === "complete" || job.status === "failed" || job.status === "cancelled";
}

/**
 * End a job, once, tidily.
 *
 * Cancels the watchdog so the scheduled table does not accumulate, clears the
 * poll cursor so no sweep ever picks the row up again, and deletes a blob the
 * job stored but never attached.
 */
async function finish(
  ctx: MutationCtx,
  job: Doc<"aiVideoJobs">,
  outcome: {
    status: "complete" | "failed" | "cancelled";
    errorMessage?: string;
    assetId?: Id<"assets">;
    r2Key?: string;
  },
): Promise<void> {
  if (job.watchdogId !== undefined) {
    await ctx.scheduler.cancel(job.watchdogId);
  }

  // An orphan: stored, never attached. Only when this job is not the one that
  // just attached it.
  if (job.pendingR2Key !== undefined && outcome.assetId === undefined) {
    await deleteBlobIfPresent(ctx, job.pendingR2Key);
  }

  await ctx.db.patch("aiVideoJobs", job._id, {
    status: outcome.status,
    completedAt: Date.now(),
    nextPollAt: undefined,
    watchdogId: undefined,
    pendingR2Key: undefined,
    ...(outcome.errorMessage === undefined ? {} : { errorMessage: outcome.errorMessage }),
    ...(outcome.assetId === undefined ? {} : { assetId: outcome.assetId }),
    ...(outcome.r2Key === undefined ? {} : { r2Key: outcome.r2Key }),
  });
}

/** Shared by `sweepStale` and by opening a new job. */
async function sweepStaleJobs(ctx: MutationCtx, now: number): Promise<number> {
  const due = await ctx.db
    .query("aiVideoJobs")
    .withIndex("by_status_and_nextPollAt", (q) =>
      q.eq("status", "generating").lte("nextPollAt", now - STALE_AFTER_MS),
    )
    .take(SWEEP_LIMIT);

  let swept = 0;
  for (const job of due) {
    await finish(ctx, job, {
      status: "failed",
      errorMessage: "Stopped responding while the video was being generated.",
    });
    swept += 1;
  }
  return swept;
}

/** A filename from a title. Cosmetic: the key is a uuid either way. */
function slugForFile(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length === 0 ? "ai-video" : slug;
}
