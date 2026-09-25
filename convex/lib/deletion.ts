import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteDraft } from "./aiDrafts";
import { MAX_STAFF } from "./counts";
import { MAX_OPTIONS, MAX_SIBLINGS } from "./ordering";
import { deleteBlobIfPresent } from "./storage";

/**
 * Deleting a module and everything that hangs off it.
 *
 * One implementation, shared by the single delete and the bulk walk, for the
 * same reason `modules.publish` reuses `staff.assignAllStep`: two copies of a
 * cascade are two chances to forget a table, and a forgotten table leaves rows
 * no index can ever name again.
 *
 * ## What is deliberately NOT deleted
 *
 * **`progressEvents`.** Its `moduleId` is optional and nothing dereferences
 * it — every reader (`learn.me`, `learn.myProfile`, `lib/progress.ts`) goes
 * through `by_userId_and_occurredAt` and uses only `occurredAt`, to compute a
 * streak. Deleting these rows would reset a real teacher's streak in order to
 * tidy up content they never saw. Same category as `auditLog`, which already
 * keeps the ids of rows that are gone.
 *
 * **`badgeAwards`, `users.xpTotal`, `users.cptdPoints`.** An award records what
 * somebody was paid at the time and is never recomputed. Un-paying a teacher
 * because an admin deleted a module is precisely the failure that rule exists
 * to prevent.
 *
 * **The `aiGenerations` blob.** `aiGenerations.r2Key` is a copy of the
 * *asset's* key (`aiReview.generateFromAsset` passes `asset.r2Key` straight
 * into `openGeneration`), so the asset cascade already owns that object.
 * Deleting it here would be a second delete of the same blob.
 */

/**
 * Row deletions one step may perform.
 *
 * The unit of work is a budget of rows, not a module: one module's
 * `lessonProgress` is a lessons-by-staff cross product and `assessmentAttempts`
 * is unbounded, so a single module can exceed one transaction. A step that
 * meant "delete module i" would throw forever on that module and the whole
 * walk would stop dead at it.
 */
export const STEP_ROW_BUDGET = 500;

/**
 * Asset rows one step may drop.
 *
 * Lower than the row budget because each one costs more than a delete:
 * `deleteBlobIfPresent` calls into the R2 component, which writes its own
 * metadata row and enqueues a retrier action. It does not make a network call
 * inside this transaction — but it does spend write and scheduler budget.
 */
export const STEP_BLOB_BUDGET = 50;

/** Every status an `aiQuestions` row can hold, so the drafts can be found. */
const REVIEW_STATUSES = ["pending", "approved", "rejected", "edited"] as const;

type Budget = { rows: number; blobs: number };

export type ModuleRemoval = {
  /** False when a budget ran out: the module still has children. */
  done: boolean;
  /** Rows deleted this pass, for the audit trail. */
  deleted: number;
  /** People whose compliance the caller must recompute. */
  touchedUserIds: Set<Id<"users">>;
};

/** Take no more than the budget allows, so a cap can never overshoot it. */
function capped(budget: Budget, limit: number): number {
  return Math.max(0, Math.min(limit, budget.rows));
}

/**
 * A lesson's own children: its asset links and its progress rows.
 *
 * Shared with `lessons.remove`, which had these inline and capped the progress
 * read at `MAX_SIBLINGS` (200) — while the row count is bounded by `MAX_STAFF`
 * (500), one per person who opened the lesson. In a full school that silently
 * orphaned up to 300 rows whose `by_lessonId` key had just been deleted.
 */
export async function removeLessonChildren(
  ctx: MutationCtx,
  lessonId: Id<"lessons">,
  budget: Budget,
): Promise<void> {
  const links = await ctx.db
    .query("lessonAssets")
    .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lessonId))
    .take(capped(budget, MAX_SIBLINGS));
  for (const link of links) {
    await ctx.db.delete("lessonAssets", link._id);
    budget.rows -= 1;
  }

  const progress = await ctx.db
    .query("lessonProgress")
    .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
    .take(capped(budget, MAX_STAFF));
  for (const row of progress) {
    await ctx.db.delete("lessonProgress", row._id);
    budget.rows -= 1;
  }
}

/**
 * Delete a module's children, in an order where nothing is ever briefly
 * orphaned: join rows before the rows they join, children before parents, and
 * a blob before the row that names it.
 *
 * Does **not** delete the module row itself. The caller does that, and only
 * when this returns `done`, so a module can never disappear ahead of its
 * children.
 */
export async function removeModuleContent(
  ctx: MutationCtx,
  module: Doc<"modules">,
  opts: { deleteEnrollments: boolean },
): Promise<ModuleRemoval> {
  const budget: Budget = { rows: STEP_ROW_BUDGET, blobs: STEP_BLOB_BUDGET };
  const touchedUserIds = new Set<Id<"users">>();
  const before = budget.rows;

  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(capped(budget, MAX_SIBLINGS));
  for (const lesson of lessons) {
    if (budget.rows <= 0) break;
    await removeLessonChildren(ctx, lesson._id, budget);
    // Only once its own children are gone: a lesson row deleted first would
    // leave progress rows whose `by_lessonId` key names nothing.
    await ctx.db.delete("lessons", lesson._id);
    budget.rows -= 1;
  }

  const questions = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(capped(budget, MAX_SIBLINGS));
  for (const question of questions) {
    if (budget.rows <= 0) break;
    const options = await ctx.db
      .query("assessmentQuestionOptions")
      .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
      .take(MAX_OPTIONS);
    for (const option of options) {
      await ctx.db.delete("assessmentQuestionOptions", option._id);
      budget.rows -= 1;
    }
    await ctx.db.delete("assessmentQuestions", question._id);
    budget.rows -= 1;
  }

  const objectives = await ctx.db
    .query("moduleObjectives")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(capped(budget, MAX_SIBLINGS));
  for (const objective of objectives) {
    await ctx.db.delete("moduleObjectives", objective._id);
    budget.rows -= 1;
  }

  // Through `deleteDraft` rather than a local loop, so `ai_questions_pending`
  // follows the rows. `by_moduleId_and_status` needs the status, so all four
  // are walked.
  for (const status of REVIEW_STATUSES) {
    if (budget.rows <= 0) break;
    const drafts = await ctx.db
      .query("aiQuestions")
      .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id).eq("status", status))
      .take(capped(budget, MAX_SIBLINGS));
    for (const draft of drafts) {
      await deleteDraft(ctx, draft);
      budget.rows -= 1;
    }
  }

  // Video jobs for this module.
  //
  // Cancelled by deleting the row and its scheduled watchdog directly, never
  // by scheduling anything: `content.test.ts` and `staff.test.ts` drain the
  // scheduler with `vi.runAllTimers`, which fires regardless of delay, so a
  // cascade that scheduled work here would make real OpenRouter and R2 calls
  // on every `npm test`.
  //
  // A job caught mid-flight may hold a stored-but-unattached blob; that is the
  // one thing here that would otherwise leak.
  const videoJobs = await ctx.db
    .query("aiVideoJobs")
    .withIndex("by_moduleId_and_startedAt", (q) => q.eq("moduleId", module._id))
    .take(capped(budget, MAX_SIBLINGS));
  for (const job of videoJobs) {
    if (job.watchdogId !== undefined) await ctx.scheduler.cancel(job.watchdogId);
    await deleteBlobIfPresent(ctx, job.pendingR2Key);
    await ctx.db.delete("aiVideoJobs", job._id);
    budget.rows -= 1;
  }

  // Row only — the blob belongs to the asset this run read (see the header).
  const runs = await ctx.db
    .query("aiGenerations")
    .withIndex("by_moduleId_and_startedAt", (q) => q.eq("moduleId", module._id))
    .take(capped(budget, MAX_SIBLINGS));
  for (const run of runs) {
    await ctx.db.delete("aiGenerations", run._id);
    budget.rows -= 1;
  }

  const attempts = await ctx.db
    .query("assessmentAttempts")
    .withIndex("by_moduleId_and_attemptedAt", (q) => q.eq("moduleId", module._id))
    .take(capped(budget, MAX_STAFF));
  for (const attempt of attempts) {
    await ctx.db.delete("assessmentAttempts", attempt._id);
    budget.rows -= 1;
  }

  if (opts.deleteEnrollments) {
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id))
      .take(capped(budget, MAX_STAFF));
    for (const enrollment of enrollments) {
      touchedUserIds.add(enrollment.userId);
      await ctx.db.delete("enrollments", enrollment._id);
      budget.rows -= 1;
    }
  }

  // Cleared before the assets go, so no read can land on a module pointing at
  // a hero that has already been deleted.
  if (module.featuredAssetId !== undefined) {
    await ctx.db.patch("modules", module._id, { featuredAssetId: undefined });
  }

  const assets = await ctx.db
    .query("assets")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(Math.min(budget.blobs, capped(budget, MAX_SIBLINGS)));
  for (const asset of assets) {
    // Blob before row: an asset row deleted on its own leaves an object in the
    // R2 bucket that nothing can ever reach or name again.
    await deleteBlobIfPresent(ctx, asset.r2Key);
    await ctx.db.delete("assets", asset._id);
    budget.rows -= 1;
    budget.blobs -= 1;
  }

  return { done: await isEmpty(ctx, module, opts), deleted: before - budget.rows, touchedUserIds };
}

/**
 * Whether a module has any children left.
 *
 * Asked by re-reading rather than by trusting the loops above: a cap that was
 * hit is exactly the case this has to catch, and inferring "done" from a
 * budget that happened not to run out is how a parent row gets deleted over
 * the top of surviving children.
 */
async function isEmpty(
  ctx: MutationCtx,
  module: Doc<"modules">,
  opts: { deleteEnrollments: boolean },
): Promise<boolean> {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (lessons.length > 0) return false;

  const questions = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (questions.length > 0) return false;

  const objectives = await ctx.db
    .query("moduleObjectives")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (objectives.length > 0) return false;

  const assets = await ctx.db
    .query("assets")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (assets.length > 0) return false;

  const attempts = await ctx.db
    .query("assessmentAttempts")
    .withIndex("by_moduleId_and_attemptedAt", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (attempts.length > 0) return false;

  for (const status of REVIEW_STATUSES) {
    const drafts = await ctx.db
      .query("aiQuestions")
      .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id).eq("status", status))
      .take(1);
    if (drafts.length > 0) return false;
  }

  const runs = await ctx.db
    .query("aiGenerations")
    .withIndex("by_moduleId_and_startedAt", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (runs.length > 0) return false;

  const videoJobs = await ctx.db
    .query("aiVideoJobs")
    .withIndex("by_moduleId_and_startedAt", (q) => q.eq("moduleId", module._id))
    .take(1);
  if (videoJobs.length > 0) return false;

  if (opts.deleteEnrollments) {
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id))
      .take(1);
    if (enrollments.length > 0) return false;
  }

  return true;
}
