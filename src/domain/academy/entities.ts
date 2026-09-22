/**
 * The app's vocabulary: the closed sets a module, lesson, asset or question can
 * belong to.
 *
 * This file is the source of truth that `convex/validators.ts` mirrors. Widening
 * a union here means widening it there, and auditing every consumer of both.
 *
 * It used to carry a second job — the full document shapes an in-memory
 * repository served before the backend existed (`TrainingModule`,
 * `StaffDashboardSnapshot`, `AiReviewQuestion` and the rest). Those went with
 * the repository. Document shapes now come from Convex, derived with
 * `FunctionReturnType` in `src/application/academy/presenters.ts`, so a change
 * to the schema surfaces as a type error rather than as a hand-written
 * duplicate that quietly disagrees.
 */

export type ModuleCategory = "Core Policies" | "SMT Pathway" | "Staff Development";

/**
 * The categories, as a list, for the pickers that offer them.
 *
 * Here rather than in a route because two screens need it, and because a route
 * that exports a non-component value trips `react-refresh/only-export-components`.
 * Mirrors `moduleCategory` in `convex/validators.ts`; widening one means
 * widening the other.
 */
export const MODULE_CATEGORIES: ModuleCategory[] = [
  "Core Policies",
  "SMT Pathway",
  "Staff Development",
];

export type ModuleLessonKind = "video" | "audio" | "reading" | "case-study" | "assessment";

export type ModuleAssetKind = "video" | "audio" | "document" | "worksheet" | "image";

/** How an assessment question is answered. Mirrored by `convex/validators.ts`. */
export type AssessmentQuestionKind = "multiple_choice" | "true_false";
