import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ProgressEventKind } from "../validators";
import {
  BADGES,
  XP_PER_LESSON,
  currentStreak,
  monthKeyOf,
  newlyEarnedBadges,
  xpForModule,
} from "./awards";
import { MAX_ACTIVITY, MAX_MODULES } from "./counts";
import { MAX_SIBLINGS } from "./ordering";

/**
 * What finishing a lesson does to a learner's record, in one place.
 *
 * This was the body of `learn.recordLessonProgress`. It moved here the moment a
 * second caller appeared — `learn.submitAssessment` — because the alternative
 * was two copies of the school's award arithmetic that could disagree about
 * what a completion is worth. That is the same failure `lib/awards.ts` exists
 * to prevent, one layer up.
 *
 * The two halves work differently, deliberately:
 *
 * - `progressPercent` and `compliancePercent` are **recomputed** from the rows,
 *   never incremented, so they cannot drift away from the lessons behind them.
 * - XP and CPTD points are **incremented**: they record what somebody was paid
 *   at the time, not a function of their current state. Recomputing them would
 *   un-pay a teacher whose module was later archived. The transition guards
 *   below are what keep that increment honest.
 */

/** Published lessons of one module, in order. Bounded: a module holds a handful. */
export async function publishedLessons(
  ctx: QueryCtx | MutationCtx,
  moduleId: Id<"modules">,
): Promise<Array<Doc<"lessons">>> {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(MAX_SIBLINGS);
  // Drafts are editorial work in progress. A learner seeing one would be asked
  // to complete something the school has not finished writing.
  return lessons.filter((lesson) => lesson.publishState === "published");
}

export type LessonCompletionResult = {
  progressPercent: number;
  moduleCompleted: boolean;
  /** What this call actually paid out. Zero when nothing new was finished. */
  xpAwarded: number;
  cptdAwarded: number;
  badgesAwarded: Array<string>;
};

/**
 * Apply one lesson completion and everything it pays for.
 *
 * **Contract:** `user`, `enrollment` and `existingProgress` must be the
 * documents as they were **before** this transaction wrote anything, and `now`
 * must be the caller's single timestamp. Nothing in here re-reads them, because
 * a re-read after a write in the same transaction would see the new value and
 * silently break both the sticky-completion rule and the pay-once guards.
 */
export async function applyLessonCompletion(
  ctx: MutationCtx,
  args: {
    user: Doc<"users">;
    userId: Id<"users">;
    module: Doc<"modules">;
    enrollment: Doc<"enrollments">;
    lesson: Doc<"lessons">;
    existingProgress: Doc<"lessonProgress"> | null;
    completed: boolean;
    now: number;
    /** Appended to the events this writes, e.g. `assessment_passed`. */
    extraEvents?: Array<ProgressEventKind>;
    /** Merged into the single enrollment patch, e.g. a new best `score`. */
    extraEnrollmentPatch?: Partial<Doc<"enrollments">>;
  },
): Promise<LessonCompletionResult> {
  const { user, userId, module, enrollment, lesson, existingProgress, now } = args;

  // Completion is sticky. Re-opening a finished lesson is a visit, not a
  // regression, and a tracker that quietly un-completed work would be worse
  // than one that never recorded it. It is also what stops a failed assessment
  // retake un-completing an assessment somebody has already passed.
  const status =
    args.completed || existingProgress?.status === "completed" ? "completed" : "in_progress";

  // The two transitions worth paying for, read from the pre-write snapshots the
  // caller handed in. Everything below keys off these rather than off the new
  // state, which is what stops a replayed lesson paying twice.
  const lessonNewlyCompleted = status === "completed" && existingProgress?.status !== "completed";
  const moduleWasCompleted = enrollment.status === "completed";
  const moduleFirstOpened = enrollment.startedAt === undefined;

  if (existingProgress === null) {
    await ctx.db.insert("lessonProgress", {
      userId,
      lessonId: lesson._id,
      moduleId: module._id,
      status,
      lastViewedAt: now,
      ...(status === "completed" ? { completedAt: now } : {}),
    });
  } else {
    await ctx.db.patch("lessonProgress", existingProgress._id, {
      status,
      lastViewedAt: now,
      ...(status === "completed" && existingProgress.completedAt === undefined
        ? { completedAt: now }
        : {}),
    });
  }

  // Recomputed from the rows, never incremented.
  const lessons = await publishedLessons(ctx, module._id);
  const progressRows = await ctx.db
    .query("lessonProgress")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId).eq("moduleId", module._id))
    .take(MAX_SIBLINGS);
  const publishedIds = new Set(lessons.map((row) => row._id));
  const done = progressRows.filter(
    (row) => row.status === "completed" && publishedIds.has(row.lessonId),
  ).length;
  const progressPercent = lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100);
  const moduleCompleted = lessons.length > 0 && done === lessons.length;

  // One patch, so anything the caller needs on the enrollment lands before the
  // badge facts below are read back. That is how a fresh assessment score
  // reaches `quiz_ace` in the same transaction rather than one attempt late.
  await ctx.db.patch("enrollments", enrollment._id, {
    progressPercent,
    status: moduleCompleted ? "completed" : "in_progress",
    lastAccessedAt: now,
    ...(enrollment.startedAt === undefined ? { startedAt: now } : {}),
    ...(moduleCompleted && enrollment.completedAt === undefined ? { completedAt: now } : {}),
    ...(args.extraEnrollmentPatch ?? {}),
  });

  // Same formula as `staff.recomputeCompliance` and the seed. If these three
  // ever disagreed, a profile would contradict its own rows.
  const allEnrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
    .take(MAX_MODULES);
  const compliancePercent =
    allEnrollments.length === 0
      ? 0
      : Math.round(
          allEnrollments.reduce((sum, row) => sum + row.progressPercent, 0) / allEnrollments.length,
        );

  // --- earning -----------------------------------------------------------
  //
  // Awards are the one thing here that is incremented rather than recomputed,
  // and that is deliberate: XP and CPTD points are a record of what somebody
  // was paid at the time, not a function of their current state. Recomputing
  // them would mean un-paying a teacher whose module was later archived. The
  // guards above are what keep the increment honest.
  const moduleNewlyCompleted = moduleCompleted && !moduleWasCompleted;

  const xpAwarded =
    (lessonNewlyCompleted ? XP_PER_LESSON : 0) + (moduleNewlyCompleted ? xpForModule(module) : 0);
  const cptdAwarded = moduleNewlyCompleted ? module.cptdPoints : 0;

  // The append-only history. Nothing else writes this table, so it is also the
  // only thing that makes a streak computable at all.
  const events: Array<ProgressEventKind> = [];
  if (moduleFirstOpened) events.push("module_started");
  if (lessonNewlyCompleted) events.push("lesson_completed");
  if (moduleNewlyCompleted) events.push("module_completed");
  for (const kind of args.extraEvents ?? []) events.push(kind);

  for (const kind of events) {
    await ctx.db.insert("progressEvents", {
      userId,
      moduleId: module._id,
      // The two lesson-scoped kinds. A module event names no lesson.
      ...(kind === "lesson_completed" || kind === "assessment_passed"
        ? { lessonId: lesson._id }
        : {}),
      kind,
      occurredAt: now,
      monthKey: monthKeyOf(now),
    });
  }

  await ctx.db.patch("users", userId, {
    compliancePercent,
    lastActiveAt: now,
    ...(xpAwarded === 0 ? {} : { xpTotal: user.xpTotal + xpAwarded }),
    ...(cptdAwarded === 0 ? {} : { cptdPoints: user.cptdPoints + cptdAwarded }),
  });

  // --- badges -------------------------------------------------------------
  // Newest first, because a streak is about the recent tail. Without the `desc`
  // this takes the OLDEST 500 events and a long-serving user's streak would be
  // computed from history that ended months ago.
  const activity = await ctx.db
    .query("progressEvents")
    .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_ACTIVITY);
  const held = await ctx.db
    .query("badgeAwards")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(BADGES.length * 2);

  const completedEnrollments = allEnrollments.filter((row) => row.status === "completed");
  const scores = allEnrollments
    .map((row) => row.score)
    .filter((score): score is number => score !== undefined);

  const badgesAwarded = newlyEarnedBadges(
    {
      modulesCompleted: completedEnrollments.length,
      modulesAssigned: allEnrollments.length,
      compliancePercent,
      streakDays: currentStreak(
        activity.map((row) => row.occurredAt),
        now,
      ),
      bestScorePercent: scores.length === 0 ? null : Math.max(...scores),
    },
    new Set(held.map((row) => row.badgeKey)),
  );
  for (const badgeKey of badgesAwarded) {
    await ctx.db.insert("badgeAwards", { userId, badgeKey, awardedAt: now });
  }

  return { progressPercent, moduleCompleted, xpAwarded, cptdAwarded, badgesAwarded };
}
