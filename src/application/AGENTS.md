# src/application

## Purpose

Use cases: orchestrate the `AcademyRepository` port into ready-to-render view-models, one function per screen.

## Ownership

- Owns `academy/use-cases.ts` — every read use case (`getX`) and the write-side transforms (`applyAiReviewDecision`)
- Owns all user-facing string formatting, label composition, and route href construction
- Owns nothing about how data is stored or how it is rendered

## Local Contracts

- Imports limited to domain types and the `AcademyRepository` port. No React, no route imports, no `@/infrastructure`
- Exported read functions take the repository first: `(repo: AcademyRepository, ...params)`. The container applies the repository, so never capture it at module scope
- Return plain serializable objects — loader results cross the SSR boundary
- Hrefs are built only by the private helpers at the top of the file: `getLessonHref`, `getAssetHref`, plus the inline `/academy/modules/${slug}` and `/academy/admin/...` templates. Change paths here, not in components
- Meta strings come from `formatModuleMeta` and `formatSectionMeta`. Reuse them instead of re-composing the same text
- Missing entities throw `Error` with the slug or id in the message (`getModuleOverview`, `getModuleExperience`, `getModuleLessonExperience`, `getAdminModuleDetail`, `getAdminLessonDetail`, `getAdminAssetDetail`, `getAdminStaffDetail`). These surface through the root `errorComponent`, not `notFoundComponent` — a known gap; change it deliberately across all of them at once, not one function at a time
- `getSupportingResources` falls back to all non-video resources when a section has no matching `documentIds`. Callers may receive more resources than the section declares
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
