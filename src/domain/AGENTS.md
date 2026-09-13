# src/domain

## Purpose

Innermost layer: the app's vocabulary. The closed sets a module, lesson, asset or question can belong to.

## Ownership

- Owns `academy/entities.ts` — string unions and the one list (`MODULE_CATEGORIES`) that pickers iterate
- Owns no formatting, no hrefs, no framework code, no document shapes

## Local Contracts

- Zero imports from outside `@/domain`. No React, TanStack, Zod, Tailwind, or Node built-ins
- Type-only, apart from `MODULE_CATEGORIES`. That const lives here rather than in a route because two screens need it and a route exporting a non-component value trips `react-refresh/only-export-components`
- **These unions are the source of truth `convex/validators.ts` mirrors.** Widening one means widening the other and auditing every consumer in `application`, `routes` and `components`:
  - `ModuleCategory`: `Core Policies` | `SMT Pathway` | `Staff Development`
  - `ModuleLessonKind`: `video` | `audio` | `reading` | `case-study` | `assessment`
  - `ModuleAssetKind`: `video` | `audio` | `document` | `worksheet`
  - `AssessmentQuestionKind`: `multiple_choice` | `true_false`
- **Document shapes do not belong here.** They come from Convex, derived with `FunctionReturnType<typeof api.x.y>` in `src/application/academy/presenters.ts`, so a schema change surfaces as a type error rather than as a hand-written duplicate that quietly disagrees

## History

This file used to carry the full entity shapes an in-memory repository served — `TrainingModule` with its `sections` and `resources`, `StaffDashboardSnapshot`, `AdminDashboardSnapshot`, `AiReviewQuestion`, `ReviewOption`, `StaffMember` — plus `AcademyRepository`, a synchronous port in `academy/repositories.ts`. All of it went with the repository once the last screen stopped reading it.

Two of the deleted unions are worth knowing about, because comments elsewhere still refer to them as history: `ModuleStatus` (`complete | in-progress | available | locked`) conflated a learner's progress with content state and is why `publishState` exists; `ReviewDecision` was a duplicate of the union `convex/validators.ts` already defines.

## Work Guidance

- Keep names in domain language, not UI language. A field is `durationMinutes`, not `durationLabel`, unless the label itself is the durable fact
- If a value is needed by exactly one screen, it belongs in a presenter view-model, not here

## Verification

From the repo root: `npx tsc --noEmit` catches consumer drift.

## Child DOX Index

No children.
