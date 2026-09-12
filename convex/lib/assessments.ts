import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The readiness rule shared by the two ways an assessment can go live.
 *
 * A published assessment lesson with no questions is a lesson a learner opens
 * and can never finish — and since passing it is what completes it, that is
 * also a module they can never complete and a permanent hole in their
 * compliance figure. So both doors are gated: `modules.publish` and
 * `lessons.setPublishState`. Gating only the first would be decorative, because
 * an admin can publish the module while the assessment lesson is still a draft
 * and publish the lesson afterwards.
 *
 * Deliberately not a minimum count. How many questions make a fair assessment
 * is the school's judgement, and a floor would be a number nobody could
 * reconcile against anything.
 */

export const NO_QUESTIONS_MESSAGE =
  "Add at least one assessment question, or unpublish the assessment lesson.";

/** Does this module have any questions at all? Bounded: one row settles it. */
export async function hasQuestions(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<boolean> {
  const first = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(1);
  return first.length > 0;
}

/**
 * Refuse when a module would be left with a published assessment lesson and an
 * empty question bank.
 */
export async function assertAssessmentReady(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<void> {
  const published = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_publishState", (q) =>
      q.eq("moduleId", moduleId).eq("publishState", "published"),
    )
    .take(50);
  if (!published.some((lesson) => lesson.kind === "assessment")) return;
  if (await hasQuestions(ctx, moduleId)) return;
  throw new ConvexError({ code: "NOT_READY", message: NO_QUESTIONS_MESSAGE });
}
