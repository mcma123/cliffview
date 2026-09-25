import { type Infer, v } from "convex/values";

/**
 * Shared validators. These mirror the string unions in
 * `src/domain/academy/entities.ts`, which stays the source of truth for the
 * app's vocabulary. Widening one here means auditing every consumer there.
 */

/** Editorial lifecycle for modules, lessons, and assets. */
export const publishState = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);
export type PublishState = Infer<typeof publishState>;

/** Mirrors `ModuleCategory`. Stable list, so a union rather than a table. */
export const moduleCategory = v.union(
  v.literal("Core Policies"),
  v.literal("SMT Pathway"),
  v.literal("Staff Development"),
);
export type ModuleCategory = Infer<typeof moduleCategory>;

/** Mirrors `ModuleLessonKind`. */
export const lessonKind = v.union(
  v.literal("video"),
  v.literal("audio"),
  v.literal("reading"),
  v.literal("case-study"),
  v.literal("assessment"),
);
export type LessonKind = Infer<typeof lessonKind>;

/** Mirrors `ModuleAssetKind`. */
export const assetKind = v.union(
  v.literal("video"),
  v.literal("audio"),
  v.literal("document"),
  v.literal("worksheet"),
  v.literal("image"),
);
export type AssetKind = Infer<typeof assetKind>;

/**
 * Authorization fact, deliberately separate from `users.jobTitle` ("Teacher",
 * "Head of Department"). Conflating a job title with a permission is how authz
 * bugs ship.
 */
export const accessRole = v.union(
  v.literal("staff"),
  v.literal("smt_admin"),
  v.literal("super_admin"),
);
export type AccessRole = Infer<typeof accessRole>;

export const employmentStatus = v.union(v.literal("active"), v.literal("inactive"));
export type EmploymentStatus = Infer<typeof employmentStatus>;

/**
 * Per-learner enrollment state. This is NOT the old `ModuleStatus` — that
 * `complete | in-progress | available | locked` union conflated progress with
 * entitlement and lived on the shared content row. `locked` is never stored: it
 * is derived at read time from `modules.sequence` plus the user's enrollments.
 */
export const enrollmentStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("waived"),
);
export type EnrollmentStatus = Infer<typeof enrollmentStatus>;

export const lessonProgressStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
);
export type LessonProgressStatus = Infer<typeof lessonProgressStatus>;

/**
 * How an assessment question is answered.
 *
 * `true_false` is not a separate shape — it is a multiple choice with exactly
 * two options whose text `questions.save` normalises to "True" and "False". One
 * stored shape means one grading path, and the kind survives only so the admin
 * editor knows which form to draw.
 *
 * Mirrors `AssessmentQuestionKind` in `src/domain/academy/entities.ts`.
 */
export const assessmentQuestionKind = v.union(
  v.literal("multiple_choice"),
  v.literal("true_false"),
);
export type AssessmentQuestionKind = Infer<typeof assessmentQuestionKind>;

/** Difficulty a generated question reports about itself. */
export const questionDifficulty = v.union(
  v.literal("Easy"),
  v.literal("Medium"),
  v.literal("Hard"),
);
export type QuestionDifficulty = Infer<typeof questionDifficulty>;

/** Where a generated question stands. `pending` is the un-reviewed state. */
export const reviewStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("edited"),
);
export type ReviewStatus = Infer<typeof reviewStatus>;

/** A decision an admin can actually record — `pending` is not a decision. */
export const reviewDecision = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("edited"),
);
export type ReviewDecision = Infer<typeof reviewDecision>;

export const generationStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
);
export type GenerationStatus = Infer<typeof generationStatus>;

/**
 * The life of one AI video job.
 *
 * Separate from `generationStatus` because a video has a step a question run
 * does not: the prompt is drafted, read by a person, and only then submitted.
 * `draft_ready` is that pause, and it is the whole reason the feature is two
 * actions rather than one.
 */
export const videoJobStatus = v.union(
  v.literal("drafting"),
  v.literal("draft_ready"),
  v.literal("generating"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("cancelled"),
);
export type VideoJobStatus = Infer<typeof videoJobStatus>;

/** Append-only event kinds that feed the analytics rollups. */
export const progressEventKind = v.union(
  v.literal("module_started"),
  v.literal("module_completed"),
  v.literal("lesson_completed"),
  v.literal("assessment_passed"),
);
export type ProgressEventKind = Infer<typeof progressEventKind>;

/**
 * Audit fields carried by every content table.
 *
 * Deliberately just a timestamp. "Who changed this" lives in `auditLog`, which
 * already records actor, action, entity and time — duplicating an actor id onto
 * the content row would both denormalize it and mean every public read of a
 * module returned an admin identity string.
 *
 * A real number, not the prose the seed carried ("Updated 2 days ago"), so
 * lists can sort by it and the presenter renders the relative label.
 */
export const auditFields = {
  contentUpdatedAt: v.number(),
};
