# src/application

## Purpose

Use cases: orchestrate the `AcademyRepository` port into ready-to-render view-models, one function per screen.

## Ownership

- Owns `academy/presenters.ts` — pure functions from Convex query results to view-models. No repository argument, no data access, no wall-clock reads (`now` is passed in). This is where the admin view-model builders moved
- Owns `academy/use-cases.ts` — the read use cases still backed by the in-memory repository, plus `applyAiReviewDecision`. Shrinking as routes migrate; deleted at Phase 8
- Owns all user-facing string formatting, label composition, and route href construction
- Owns nothing about how data is stored or how it is rendered

## Local Contracts

- Imports limited to domain types and the `AcademyRepository` port. No React, no route imports, no `@/infrastructure`
- Exported read functions take the repository first: `(repo: AcademyRepository, ...params)`. The container applies the repository, so never capture it at module scope
- Return plain serializable objects — loader results cross the SSR boundary
- Hrefs are built only in this layer. Migrated paths live in `presenters.ts` as exported helpers (`getAdminModuleHref`, `getAdminLessonHref`, `getAdminAssetHref`, `getModulePreviewHref`, `getLessonPreviewHref`); the rest remain private helpers in `use-cases.ts`. Change paths here, not in components
- Meta strings come from `formatModuleMeta` and `formatSectionMeta`. Reuse them instead of re-composing the same text
- Missing entities throw `Error` with the slug or id in the message (`getModuleOverview`, `getModuleExperience`, `getModuleLessonExperience`, `getAdminModuleDetail`, `getAdminLessonDetail`, `getAdminAssetDetail`, `getAdminStaffDetail`). These surface through the root `errorComponent`, not `notFoundComponent` — a known gap; change it deliberately across all of them at once, not one function at a time
- `getSupportingResources` no longer falls back. A lesson with no matching `documentIds` returns an empty list, so callers must render an empty state. The old fallback returned every non-video asset, which is why a lesson with nothing attached reported three resources
- `getFeaturedAsset` falls back to `resources[0]` when `featuredAssetId` is unset
- Commands are pure state transforms over caller-held state: `applyAiReviewDecision(current, questionId, decision)` returns a new record. There is no write-side port yet, so nothing persists
- Hardcoded values still living in use cases: `getAiReviewQueue` returns fixed `approvedCount: 142` / `editedCount: 12`, and `getModuleLibrary` hardcodes `parent-communication-protocol` as the featured module and `3 pathways` in its summary. Move these to the repository when the backend lands

## Work Guidance

- When a route needs a new field, extend the use case; never reach into entities from a component
- Every new use case must be registered in `src/infrastructure/academy/container.ts` to be reachable
- Keep one function per screen. If two screens diverge, split the function rather than adding conditional flags

## Verification

From the repo root: `npx tsc --noEmit` and `npm run lint`. Note that `use-cases.ts` is part of the pre-existing Prettier failure baseline — run `npm run format` before judging lint output.

## Child DOX Index

No children.

- Staff presenters live here now; `getAdminStaffDirectory` and `getAdminStaffDetail` are gone from `use-cases.ts`, along with the 125-line in-memory staff list that fed them. Two staff lists in one repo, one of them stale, is worse than none
- `formatStaffInitials` takes both letters from `firstName` and `lastName`. The old version ran `lastName.replace("Ms. ", "").replace("Mr. ", "").replace("Mrs. ", "")[0]` because the seed had baked the honorific into the surname; the schema splits them, and that chain returned the wrong letter for any honorific it did not list — "Dr." among them
- `formatStaffName` treats a null honorific like an absent one. A cleared optional field can read back as `null`, and an `=== undefined` check renders the string "null" in front of somebody's name
