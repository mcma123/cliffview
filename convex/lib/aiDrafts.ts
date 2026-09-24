import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { COUNTER, bumpCounter } from "./counts";
import { MAX_OPTIONS } from "./ordering";

/**
 * Removing generated question drafts.
 *
 * Lifted out of `aiReviewQueue.ts`, where it was module-private, because
 * deleting a module has to remove that module's drafts too — and there is
 * exactly one correct way to do it. Two copies of this walk would be two
 * chances to forget the counter.
 */

/** Bounded like the queue's own reads: a draft cannot have more than this. */
const MAX_DECISIONS = 200;

/**
 * Remove a draft, its options, and its decision history.
 *
 * The pending counter is a row count that the dashboard tile reads, so it has
 * to follow. The approved/rejected/edited counters are tallies of *decisions
 * made* — "1 edited so far" — and deleting the paperwork does not un-make the
 * judgement, so they are deliberately left alone.
 *
 * Does not touch `assessmentQuestions`. A draft that was approved has already
 * become a real question on its module; removing the draft is tidying, not
 * retracting. When the module itself is being deleted, its assessment
 * questions are removed by that cascade, on their own terms.
 */
export async function deleteDraft(ctx: MutationCtx, question: Doc<"aiQuestions">): Promise<void> {
  const options = await ctx.db
    .query("aiQuestionOptions")
    .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
    .take(MAX_OPTIONS);
  for (const option of options) await ctx.db.delete("aiQuestionOptions", option._id);

  const decisions = await ctx.db
    .query("aiReviewDecisions")
    .withIndex("by_questionId_and_decidedAt", (q) => q.eq("questionId", question._id))
    .take(MAX_DECISIONS);
  for (const decision of decisions) await ctx.db.delete("aiReviewDecisions", decision._id);

  await ctx.db.delete("aiQuestions", question._id);
  if (question.status === "pending") await bumpCounter(ctx, COUNTER.aiQuestionsPending, -1);
}
