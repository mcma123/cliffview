import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { COUNTER, MAX_PHASES, MAX_STAFF, TREND_MONTHS, readCounter } from "./lib/counts";
import { earliestMonthKey, monthKeyFromMs, monthKeysBack } from "./lib/time";

/**
 * The SMT compliance overview.
 *
 * AUTHORIZATION: this is an `internalQuery`, so it is NOT reachable from the
 * client. That is deliberate. It reads the `users` table and returns
 * school-wide compliance aggregates, which is privileged, and there is no auth
 * provider until Phase 4 — so `requireAdmin` here would throw for every caller
 * and gating it now is not an option. Rather than publish a privileged read
 * unauthenticated, it stays internal (runnable via `npx convex run` for
 * verification) until Phase 4 turns it into a public `query` behind
 * `requireAdmin`. The overview screen is therefore wired in Phase 4, not
 * Phase 3.
 *
 * Every number here is derived from rows or read from a counter maintained in
 * the same transaction as the write it counts. The old snapshot was a literal:
 * it claimed 42 staff, 73% average compliance and 8 pending questions while the
 * real data held 3 staff, 76% and 2 — three tiles that disagreed with the very
 * screens they linked to.
 *
 * `now` is an argument, not `Date.now()`. A query is not rerun because time
 * advanced, so a wall-clock read here would go stale and would also defeat
 * query-cache reuse.
 */
export const adminOverview = internalQuery({
  args: { now: v.number() },
  returns: v.object({
    totalStaff: v.number(),
    averageCompliancePercent: v.number(),
    completedModules: v.number(),
    pendingAiReviewCount: v.number(),
    editedAiReviewCount: v.number(),
    /** Per-phase average compliance across active staff. */
    phases: v.array(
      v.object({
        name: v.string(),
        completionPercent: v.number(),
        staffCount: v.number(),
      }),
    ),
    /** Exactly TREND_MONTHS points, oldest first, zero-filled. */
    completionTrend: v.array(
      v.object({
        monthKey: v.string(),
        completedModules: v.number(),
      }),
    ),
    /**
     * Last month's compliance snapshot, or null when no snapshot exists yet.
     * A delta needs a past value; nothing recorded one before, which is why the
     * old "+5% across all staff" was a hardcoded string. The presenter shows a
     * delta only when this is present.
     */
    previousAverageCompliancePercent: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    // One bounded scan over active staff answers headcount, the school-wide
    // average, and the per-phase breakdown. Staff per school is small by
    // design, so this stays cheaper than a scan per phase.
    const activeStaff = await ctx.db
      .query("users")
      .withIndex("by_employmentStatus_and_xpTotal", (q) => q.eq("employmentStatus", "active"))
      .take(MAX_STAFF);

    const totalStaff = activeStaff.length;
    const averageCompliancePercent =
      totalStaff === 0
        ? 0
        : Math.round(
            activeStaff.reduce((sum, staff) => sum + staff.compliancePercent, 0) / totalStaff,
          );

    const byPhase = new Map<string, { total: number; count: number }>();
    for (const staff of activeStaff) {
      const bucket = byPhase.get(staff.phaseId) ?? { total: 0, count: 0 };
      bucket.total += staff.compliancePercent;
      bucket.count += 1;
      byPhase.set(staff.phaseId, bucket);
    }

    const phaseRows = await ctx.db.query("phases").withIndex("by_order").take(MAX_PHASES);
    const phases = phaseRows
      .filter((phase) => phase.isActive)
      .map((phase) => {
        const bucket = byPhase.get(phase._id);
        return {
          name: phase.name,
          completionPercent:
            bucket === undefined || bucket.count === 0
              ? 0
              : Math.round(bucket.total / bucket.count),
          staffCount: bucket?.count ?? 0,
        };
      });

    // Six-month trend as one index range scan, then zero-filled so a month with
    // no completions renders as an empty bar rather than being dropped.
    const windowKeys = monthKeysBack(args.now, TREND_MONTHS);
    const from = earliestMonthKey(args.now, TREND_MONTHS);
    const rollups = await ctx.db
      .query("monthlyRollups")
      .withIndex("by_monthKey", (q) => q.gte("monthKey", from))
      .take(TREND_MONTHS * 2);
    const byMonth = new Map(rollups.map((row) => [row.monthKey, row]));
    const completionTrend = windowKeys.map((monthKey) => ({
      monthKey,
      completedModules: byMonth.get(monthKey)?.completedModules ?? 0,
    }));

    const previousMonthKey = monthKeysBack(args.now, 2)[0];
    const previousRollup = byMonth.get(previousMonthKey);
    const currentMonthKey = monthKeyFromMs(args.now);
    const previousAverageCompliancePercent =
      previousMonthKey === currentMonthKey
        ? null
        : (previousRollup?.averageCompliancePercent ?? null);

    return {
      totalStaff,
      averageCompliancePercent,
      completedModules: await readCounter(ctx, COUNTER.completedModules),
      pendingAiReviewCount: await readCounter(ctx, COUNTER.aiQuestionsPending),
      editedAiReviewCount: await readCounter(ctx, COUNTER.aiQuestionsEdited),
      phases,
      completionTrend,
      previousAverageCompliancePercent,
    };
  },
});
