import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Ordering helpers.
 *
 * Every ordered list is read through a `by_<parent>_and_order` index, so the
 * database returns sorted rows and no consumer sorts in JavaScript. That is
 * what fixes the old split where the module editor rendered array position
 * while the lesson editor rendered a stored `order`.
 *
 * Reordering is a dense renumber to 1..N inside one transaction rather than
 * fractional midpoints. A Convex mutation is a single ACID transaction, so
 * renumbering every sibling is atomic by construction: there is no window where
 * two rows share an order or the UI sees a half-applied move. Dense 1..N is
 * also exactly what the UI renders ("Lesson 3 of 7"), so no separate display
 * index is needed. Fractional gaps only pay off at hundreds of siblings and add
 * a normalization job.
 */

/**
 * Sibling cap. A module realistically holds well under 50 lessons or assets;
 * these caps keep every read bounded, and a module that exceeds one is a data
 * problem worth failing loudly on rather than silently truncating.
 */
export const MAX_SIBLINGS = 200;

/**
 * Options on one question.
 *
 * Two is the minimum that asks anything; past six a question is a reading
 * comprehension test of its own option list. `questions.save` writes the whole
 * set 1..N in one go, so options need no `nextOptionOrder` counterpart.
 */
export const MAX_OPTIONS = 6;

/** Next append position for a module child list. */
export async function nextLessonOrder(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<number> {
  const last = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

export async function nextAssetOrder(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<number> {
  const last = await ctx.db
    .query("assets")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

export async function nextObjectiveOrder(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<number> {
  const last = await ctx.db
    .query("moduleObjectives")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

export async function nextQuestionOrder(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<number> {
  const last = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

export async function nextLessonAssetOrder(
  ctx: QueryCtx | MutationCtx,
  lessonId: Id<"lessons">,
): Promise<number> {
  const last = await ctx.db
    .query("lessonAssets")
    .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lessonId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

/** Close gaps after a delete, and normalise after a swap. */
export async function renumberLessons(ctx: MutationCtx, moduleId: Id<"modules">): Promise<void> {
  const siblings = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(MAX_SIBLINGS);
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].order !== i + 1) {
      await ctx.db.patch("lessons", siblings[i]._id, { order: i + 1 });
    }
  }
}

export async function renumberAssets(ctx: MutationCtx, moduleId: Id<"modules">): Promise<void> {
  const siblings = await ctx.db
    .query("assets")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(MAX_SIBLINGS);
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].order !== i + 1) {
      await ctx.db.patch("assets", siblings[i]._id, { order: i + 1 });
    }
  }
}

export async function renumberObjectives(ctx: MutationCtx, moduleId: Id<"modules">): Promise<void> {
  const siblings = await ctx.db
    .query("moduleObjectives")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(MAX_SIBLINGS);
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].order !== i + 1) {
      await ctx.db.patch("moduleObjectives", siblings[i]._id, { order: i + 1 });
    }
  }
}

export async function renumberQuestions(ctx: MutationCtx, moduleId: Id<"modules">): Promise<void> {
  const siblings = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(MAX_SIBLINGS);
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].order !== i + 1) {
      await ctx.db.patch("assessmentQuestions", siblings[i]._id, { order: i + 1 });
    }
  }
}

/**
 * Validate a client-supplied reorder against the authoritative sibling set.
 *
 * Rejecting on mismatch is the important half: a stale client that reorders
 * while someone else adds a row would otherwise drop the new row out of the
 * ordering entirely. Failing loudly beats corrupting the list.
 */
export function assertSameMembers<T extends string>(
  orderedIds: readonly T[],
  actualIds: readonly T[],
): void {
  if (orderedIds.length !== actualIds.length) {
    throw new ConvexError({
      code: "STALE_ORDER",
      message: "The list changed since it was loaded. Reload and try again.",
    });
  }
  const actual = new Set<string>(actualIds);
  for (const id of orderedIds) {
    if (!actual.delete(id)) {
      throw new ConvexError({
        code: "STALE_ORDER",
        message: "The list changed since it was loaded. Reload and try again.",
      });
    }
  }
}
