import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import { MAX_MODULES, MAX_PHASES, MAX_STAFF } from "./lib/counts";
import { accessRole, moduleCategory, publishState } from "./validators";

/**
 * Compliance reporting: the evidence behind the dashboard's four tiles.
 *
 * Deliberately not a second overview. `dashboard.adminOverview` answers "how is
 * the school doing"; this answers "show me, module by module and person by
 * person", because that is what a CPTD submission or an inspection asks for.
 *
 * Everything here is computed from `enrollments` at read time. Nothing is read
 * from `counters` or `monthlyRollups`: the first is written only by the seed
 * and has drifted, and the second holds a synthesised trend (`60 + i * 3`) that
 * no job maintains. A report an admin might forward must not carry either.
 *
 * What is deliberately absent: no history, no assessment analytics, no badge
 * distribution. `assessmentAttempts` and `badgeAwards` are all but empty, and a
 * lesson-level funnel would contradict the module figures outright, because
 * every seeded enrollment reports its progress with no `lessonProgress` rows
 * behind it. An empty chart is worse than no chart.
 */

/** A number that is only meaningful over a denominator. Null when there is none. */
function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

export const compliance = query({
  args: {
    now: v.number(),
    /** Narrows the whole report — tiles and both tables — to one phase. */
    phaseId: v.optional(v.id("phases")),
  },
  returns: v.object({
    scope: v.object({
      phaseName: v.union(v.string(), v.null()),
      /** Active, non-operator staff in scope. The denominator for everything. */
      staffCount: v.number(),
    }),
    phases: v.array(v.object({ id: v.id("phases"), name: v.string() })),
    summary: v.object({
      activeStaff: v.number(),
      assignments: v.number(),
      completed: v.number(),
      inProgress: v.number(),
      notStarted: v.number(),
      overdue: v.number(),
      averageCompliancePercent: v.number(),
    }),
    modules: v.array(
      v.object({
        moduleId: v.id("modules"),
        number: v.string(),
        title: v.string(),
        slug: v.string(),
        category: moduleCategory,
        publishState,
        assigned: v.number(),
        completed: v.number(),
        inProgress: v.number(),
        notStarted: v.number(),
        overdue: v.number(),
        /** Null when nobody is assigned — not 0%, which would read as failure. */
        completionPercent: v.union(v.number(), v.null()),
        /** Mean of the enrollments that HAVE a score. Null when none do. */
        averageScorePercent: v.union(v.number(), v.null()),
        /** The denominator above, so the screen can show what it averaged. */
        scoredCount: v.number(),
      }),
    ),
    staff: v.array(
      v.object({
        userId: v.id("users"),
        firstName: v.string(),
        lastName: v.string(),
        honorific: v.union(v.string(), v.null()),
        jobTitle: v.string(),
        accessRole,
        phaseName: v.string(),
        assigned: v.number(),
        completed: v.number(),
        overdue: v.number(),
        compliancePercent: v.number(),
        cptdPoints: v.number(),
        lastActiveAt: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const phaseRows = await ctx.db.query("phases").withIndex("by_order").take(MAX_PHASES);
    const phaseNames = new Map(phaseRows.map((phase) => [phase._id, phase.name]));

    if (args.phaseId !== undefined && !phaseNames.has(args.phaseId)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That phase does not exist." });
    }

    // The in-scope set. Operators are excluded for the same reason the staff
    // directory and the dashboard exclude them: an operator login belongs to
    // nobody, has no modules, and would drag every average towards zero while
    // adding a person who does not exist to the headcount. Inactive staff are
    // excluded too — a compliance figure covering people who have left is not
    // a compliance figure.
    const users = await ctx.db.query("users").take(MAX_STAFF);
    const inScope = new Map<Id<"users">, Doc<"users">>();
    for (const user of users) {
      if (user.accessRole === "super_admin") continue;
      if (user.employmentStatus !== "active") continue;
      if (args.phaseId !== undefined && user.phaseId !== args.phaseId) continue;
      inScope.set(user._id, user);
    }

    const moduleRows = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_MODULES);

    // Per-user tallies, accumulated in the same pass as the per-module ones so
    // both tables come out of one traversal rather than a second N+1 over staff.
    const perUser = new Map<
      Id<"users">,
      { assigned: number; completed: number; overdue: number }
    >();
    for (const userId of inScope.keys()) {
      perUser.set(userId, { assigned: 0, completed: 0, overdue: 0 });
    }

    const modules = [];
    let assignments = 0;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let overdueTotal = 0;

    for (const module of moduleRows) {
      const rows = await ctx.db
        .query("enrollments")
        .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id))
        .take(MAX_STAFF);

      let mAssigned = 0;
      let mCompleted = 0;
      let mInProgress = 0;
      let mNotStarted = 0;
      let mOverdue = 0;
      let scoreTotal = 0;
      let scoredCount = 0;

      for (const row of rows) {
        // Skipping out-of-scope rows here is what makes the phase filter exact
        // rather than approximate: a module's assigned count becomes the count
        // of in-phase staff assigned to it, and the tiles still add up.
        const user = inScope.get(row.userId);
        if (user === undefined) continue;

        mAssigned += 1;
        if (row.status === "completed") mCompleted += 1;
        else if (row.status === "in_progress") mInProgress += 1;
        else if (row.status === "not_started") mNotStarted += 1;

        // A due date that has passed on work already finished is not overdue.
        const isOverdue =
          row.dueAt !== undefined && row.dueAt < args.now && row.status !== "completed";
        if (isOverdue) mOverdue += 1;

        // `score` is undefined until somebody has attempted the assessment.
        // Counting those as zero would understate every module in the school.
        if (row.score !== undefined) {
          scoreTotal += row.score;
          scoredCount += 1;
        }

        const tally = perUser.get(row.userId);
        if (tally !== undefined) {
          tally.assigned += 1;
          if (row.status === "completed") tally.completed += 1;
          if (isOverdue) tally.overdue += 1;
        }
      }

      assignments += mAssigned;
      completed += mCompleted;
      inProgress += mInProgress;
      notStarted += mNotStarted;
      overdueTotal += mOverdue;

      modules.push({
        moduleId: module._id,
        number: module.number,
        title: module.title,
        slug: module.slug,
        category: module.category,
        publishState: module.publishState,
        assigned: mAssigned,
        completed: mCompleted,
        inProgress: mInProgress,
        notStarted: mNotStarted,
        overdue: mOverdue,
        completionPercent: percentOf(mCompleted, mAssigned),
        averageScorePercent: scoredCount === 0 ? null : Math.round(scoreTotal / scoredCount),
        scoredCount,
      });
    }

    const staff = [...inScope.values()].map((user) => {
      const tally = perUser.get(user._id) ?? { assigned: 0, completed: 0, overdue: 0 };
      return {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        honorific: user.honorific ?? null,
        jobTitle: user.jobTitle,
        accessRole: user.accessRole,
        phaseName: phaseNames.get(user.phaseId) ?? "Unassigned",
        assigned: tally.assigned,
        completed: tally.completed,
        overdue: tally.overdue,
        // The stored rollup, which three writers recompute from these same
        // enrollment rows. Reported rather than re-derived so the report and
        // the staff pages cannot disagree.
        compliancePercent: user.compliancePercent,
        cptdPoints: user.cptdPoints,
        lastActiveAt: user.lastActiveAt ?? null,
      };
    });

    // Surname order, like the directory: a list people can scan beats one
    // ordered by an id nobody can see.
    staff.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
    );

    const averageCompliancePercent =
      staff.length === 0
        ? 0
        : Math.round(staff.reduce((sum, row) => sum + row.compliancePercent, 0) / staff.length);

    return {
      scope: {
        phaseName: args.phaseId === undefined ? null : (phaseNames.get(args.phaseId) ?? null),
        staffCount: staff.length,
      },
      phases: phaseRows
        .filter((phase) => phase.isActive)
        .map((phase) => ({ id: phase._id, name: phase.name })),
      summary: {
        activeStaff: staff.length,
        assignments,
        completed,
        inProgress,
        notStarted,
        overdue: overdueTotal,
        averageCompliancePercent,
      },
      modules,
      staff,
    };
  },
});
