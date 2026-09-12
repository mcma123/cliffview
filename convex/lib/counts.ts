import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Denormalized counters.
 *
 * Convex has no COUNT operator, and `.collect().length` is forbidden on tables
 * that grow without bound. Anything that must be counted over a growable table
 * lives here and is updated in the same transaction as the write that changes
 * it, so it cannot drift. `progressEvents` remains the append-only record that
 * can rebuild a counter if one ever does.
 *
 * Bounded collections do not need a counter: lessons and assets per module, and
 * staff per school, are small by design and are counted with a capped `.take()`.
 */

export const COUNTER = {
  /** Modules completed school-wide, all time. Feeds the overview tile. */
  completedModules: "completed_modules",
  aiQuestionsPending: "ai_questions_pending",
  aiQuestionsApproved: "ai_questions_approved",
  aiQuestionsRejected: "ai_questions_rejected",
  aiQuestionsEdited: "ai_questions_edited",
} as const;

export type CounterName = (typeof COUNTER)[keyof typeof COUNTER];

/**
 * Caps for deliberately bounded reads. Exceeding one is a data problem, not a
 * scaling problem — the read stays bounded and the number shown is capped
 * rather than wrong in an unbounded way.
 */
export const MAX_MODULES = 200;
export const MAX_PHASES = 50;
export const MAX_STAFF = 500;
export const TREND_MONTHS = 6;

/**
 * Activity rows read when computing one person's streak.
 *
 * `progressEvents` genuinely grows without bound, so this read is capped like
 * every other. A streak only ever needs the recent tail, and 500 events is far
 * more than the longest streak anyone could be working on.
 */
export const MAX_ACTIVITY = 500;

/** Attempts read when showing a learner their own history. Growable, so capped. */
export const MAX_ATTEMPTS = 100;

/** Read a counter, treating a missing row as zero. */
export async function readCounter(ctx: QueryCtx, name: CounterName): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  return row?.value ?? 0;
}

/**
 * Move a counter by `delta`, creating the row if absent. Call this in the same
 * mutation as the write it counts.
 */
export async function bumpCounter(
  ctx: MutationCtx,
  name: CounterName,
  delta: number,
): Promise<void> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (row === null) {
    await ctx.db.insert("counters", { name, value: delta });
    return;
  }
  await ctx.db.patch("counters", row._id, { value: row.value + delta });
}

/** Set a counter outright. Used by the seed and by recompute jobs. */
export async function setCounter(
  ctx: MutationCtx,
  name: CounterName,
  value: number,
): Promise<void> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (row === null) {
    await ctx.db.insert("counters", { name, value });
    return;
  }
  await ctx.db.patch("counters", row._id, { value });
}
