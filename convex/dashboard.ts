import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import {
  COUNTER,
  MAX_MODULES,
  MAX_PHASES,
  MAX_STAFF,
  TREND_MONTHS,
  readCounter,
} from "./lib/counts";
import { monthKeyFromMs, monthKeysBack } from "./lib/time";

/**
 * The SMT compliance overview.
 *
 * AUTHORIZATION: `requireAdmin`. It reads the `users` table and returns
 * school-wide compliance aggregates, so it is admin-only. It was an
 * `internalQuery` until an auth provider existed to gate it against, which is
 * why the overview screen is wired in Phase 4 rather than Phase 3.
 *
 * Every number here is derived from rows, or read from a counter maintained in
 * the same transaction as the write it counts. The old snapshot was a literal:
 * it claimed 42 staff, 73% average compliance and 8 pending questions while the
 * real data held 3 staff, 76% and 2 — three tiles that disagreed with the very
 * screens they linked to.
 *
 * Completions — the tile and the six-month trend — are counted from
 * `enrollments` in the same traversal, over the same scope, that
 * `reports.compliance` performs, so the overview and the report cannot
 * disagree. They used to come from two sources that nothing maintained:
 * `COUNTER.completedModules`, which only the seed ever wrote, so the tile froze
 * at its seeded value and drifted further with every real completion; and
 * `monthlyRollups`, which held a seeded ramp anchored to the day the seed ran,
 * so the chart walked off its own data one month at a time. Neither is read
 * here any more.
 *
 * There is no month-over-month delta. A delta needs a past value, the only
 * stored one was the seed's `60 + i * 3`, and subtracting a literal from a live
 * figure produced a confident regression that never happened.
 *
 * `now` is an argument, not `Date.now()`. A query is not rerun because time
 * advanced, so a wall-clock read here would go stale and would also defeat
 * query-cache reuse.
 */
export const adminOverview = query({
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
    /**
     * Exactly TREND_MONTHS points, oldest first, zero-filled. Bucketed by the
     * month of each completed enrollment's `completedAt`.
     */
    completionTrend: v.array(
      v.object({
        monthKey: v.string(),
        completedModules: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // One bounded scan over active staff answers headcount, the school-wide
    // average, and the per-phase breakdown. Staff per school is small by
    // design, so this stays cheaper than a scan per phase.
    const activeUsers = await ctx.db
      .query("users")
      .withIndex("by_employmentStatus_and_xpTotal", (q) => q.eq("employmentStatus", "active"))
      .take(MAX_STAFF);

    // `super_admin` marks an operator login, not a member of teaching staff.
    // Counting one would add a person who does not exist to headcount and drag
    // school-wide compliance towards zero, since an operator has no modules and
    // no CPTD points to earn — three tiles reporting a number nobody could
    // reconcile against the staff list. `smt_admin` is a real person with a job
    // title and does still count.
    const activeStaff = activeUsers.filter((user) => user.accessRole !== "super_admin");

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

    // Completions come from the enrollment rows themselves: the all-time tile
    // and the six-month trend in one pass, so they cannot disagree with each
    // other, and over the same scope as `reports.compliance` so they cannot
    // disagree with the report either. `activeStaff` is the scope — an
    // operator login and anyone who has left are both excluded, exactly as
    // they are from the headcount above.
    const inScope = new Set(activeStaff.map((staff) => staff._id));
    const windowKeys = monthKeysBack(args.now, TREND_MONTHS);
    // Seeded with every key so a month with no completions renders as an empty
    // bar rather than being dropped.
    const windowed = new Map(windowKeys.map((monthKey) => [monthKey, 0]));

    const moduleRows = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_MODULES);
    let completedModules = 0;
    for (const module of moduleRows) {
      const rows = await ctx.db
        .query("enrollments")
        .withIndex("by_moduleId_and_status", (q) =>
          q.eq("moduleId", module._id).eq("status", "completed"),
        )
        .take(MAX_STAFF);
      for (const row of rows) {
        if (!inScope.has(row.userId)) continue;
        completedModules += 1;
        // A completed row with no timestamp still counts all-time; it just
        // cannot be placed in a month. Dropping it from the tile instead would
        // make the tile disagree with the report.
        if (row.completedAt === undefined) continue;
        const monthKey = monthKeyFromMs(row.completedAt);
        const bucket = windowed.get(monthKey);
        // Absent means the completion predates the window, not that it is new.
        if (bucket !== undefined) windowed.set(monthKey, bucket + 1);
      }
    }

    const completionTrend = windowKeys.map((monthKey) => ({
      monthKey,
      completedModules: windowed.get(monthKey) ?? 0,
    }));

    return {
      totalStaff,
      averageCompliancePercent,
      completedModules,
      pendingAiReviewCount: await readCounter(ctx, COUNTER.aiQuestionsPending),
      editedAiReviewCount: await readCounter(ctx, COUNTER.aiQuestionsEdited),
      phases,
      completionTrend,
    };
  },
});
