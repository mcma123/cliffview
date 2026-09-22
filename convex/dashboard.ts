import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import {
  COUNTER,
  MAX_MODULES,
  MAX_PHASES,
  MAX_STAFF,
  TREND_MONTHS,
  percentOf,
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
    /**
     * Every active member of staff with their module completion, ordered
     * lowest first: a "who needs chasing" list.
     *
     * The measure is modules completed over modules assigned, counted from
     * `enrollments` in the traversal below — deliberately NOT
     * `users.compliancePercent`, which is the mean of `progressPercent` and so
     * reads high for somebody nine-tenths through every module having finished
     * none. This panel puts a percentage beside a person's name, so it shows
     * the arithmetic it is claiming and the caption that proves it ("3 / 8").
     *
     * Ordered here rather than in the browser because the ordering is a claim
     * about the data, not a styling choice: it gets one definition and one
     * test, beside the figures it is derived from.
     */
    teachers: v.array(
      v.object({
        userId: v.id("users"),
        firstName: v.string(),
        lastName: v.string(),
        honorific: v.union(v.string(), v.null()),
        jobTitle: v.string(),
        phaseName: v.string(),
        assigned: v.number(),
        completed: v.number(),
        /** Null when nobody is assigned — not 0%, which would read as failure. */
        completionPercent: v.union(v.number(), v.null()),
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
    // `perTeacher`'s key set IS the scope — an operator login and anyone who
    // has left are absent from it, exactly as they are from the headcount
    // above, so one lookup both places a row and rejects an out-of-scope one.
    // It is seeded for every active member of staff before the traversal so
    // that somebody with no enrollments at all is still reported, at
    // `assigned: 0`: "nobody has given them anything" is the finding, and a
    // row discovered from enrollments would hide exactly that person.
    const perTeacher = new Map<Id<"users">, { assigned: number; completed: number }>();
    for (const staff of activeStaff) perTeacher.set(staff._id, { assigned: 0, completed: 0 });

    const windowKeys = monthKeysBack(args.now, TREND_MONTHS);
    // Seeded with every key so a month with no completions renders as an empty
    // bar rather than being dropped.
    const windowed = new Map(windowKeys.map((monthKey) => [monthKey, 0]));

    const moduleRows = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_MODULES);
    let completedModules = 0;
    for (const module of moduleRows) {
      // Every status, not just `completed`: a teacher's denominator is the work
      // they were given, and a not-started row is precisely the assignment the
      // completed-only scan could not see. The same widened read
      // `reports.compliance` performs, so the two agree on `assigned` as well
      // as on `completed` — `waived` counts as assigned in both.
      //
      // The bound is unchanged and still exact: one enrollment row per user and
      // module, so a module holds at most one row per person. And because the
      // index is ["moduleId", "status"] and "completed" sorts first of the four
      // status literals, a truncating `.take` sheds waived and not-started rows
      // before it could shed a completed one — the tile and the trend are
      // unchanged by this widening even at the cap.
      const rows = await ctx.db
        .query("enrollments")
        .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id))
        .take(MAX_STAFF);
      for (const row of rows) {
        const tally = perTeacher.get(row.userId);
        // Absent means out of scope: an operator, or somebody who has left.
        if (tally === undefined) continue;
        tally.assigned += 1;

        // Everything below is the completed-only body this loop always had.
        // This guard reproduces exactly the set the index equality used to
        // select, which is what leaves the tile and the trend untouched.
        if (row.status !== "completed") continue;
        tally.completed += 1;
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

    // Phase names come from `phaseRows`, already read above for the per-phase
    // panel — no read per teacher. Built from every row rather than the active
    // ones `phases` filters to: somebody sitting in a retired phase still has
    // a phase, and "Unassigned" would be a lie about their record.
    const phaseNames = new Map(phaseRows.map((phase) => [phase._id, phase.name]));

    const teachers = activeStaff.map((staff) => {
      const tally = perTeacher.get(staff._id) ?? { assigned: 0, completed: 0 };
      return {
        userId: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        honorific: staff.honorific ?? null,
        jobTitle: staff.jobTitle,
        phaseName: phaseNames.get(staff.phaseId) ?? "Unassigned",
        assigned: tally.assigned,
        completed: tally.completed,
        completionPercent: percentOf(tally.completed, tally.assigned),
      };
    });

    // Lowest completion first: this panel answers "who needs chasing", and the
    // people furthest behind belong where they are read first.
    //
    // Teachers with NOTHING ASSIGNED sort to the end despite having no
    // percentage at all. Theirs is a different problem — nobody has given them
    // any work — and ranking a null as 0% would let them fill the top of a list
    // whose whole job is to surface low completion among people who do have
    // modules. They are still shown, last, saying so in words.
    const unassignedLast = (percent: number | null) => (percent === null ? 1 : 0);
    teachers.sort((a, b) => {
      const bucket = unassignedLast(a.completionPercent) - unassignedLast(b.completionPercent);
      if (bucket !== 0) return bucket;
      // `?? 0` is unreachable within a bucket: null implies `assigned === 0`,
      // which the line above already separated out. It keeps the arithmetic
      // typed rather than asserted. Not `Infinity` as the sentinel either —
      // `Infinity - Infinity` is NaN, a comparator result that would silently
      // skip the surname tie-break for two unassigned teachers.
      const delta = (a.completionPercent ?? 0) - (b.completionPercent ?? 0);
      if (delta !== 0) return delta;
      // Surname order as the tie-break, matching the report's staff table: a
      // stable list people can scan beats one ordered by an id nobody can see.
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });

    return {
      totalStaff,
      averageCompliancePercent,
      completedModules,
      pendingAiReviewCount: await readCounter(ctx, COUNTER.aiQuestionsPending),
      editedAiReviewCount: await readCounter(ctx, COUNTER.aiQuestionsEdited),
      phases,
      completionTrend,
      teachers,
    };
  },
});
