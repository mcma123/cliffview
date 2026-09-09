# src/domain

## Purpose

Innermost layer: the academy's entity types and the repository ports the rest of the app depends on.

## Ownership

- Owns `academy/entities.ts` (types) and `academy/repositories.ts` (the `AcademyRepository` port)
- Owns the domain vocabulary: module, section, asset, staff member, snapshot, review question
- Owns no formatting, no hrefs, no framework code

## Local Contracts

- Zero imports from outside `@/domain`. No React, TanStack, Zod, Tailwind, or Node built-ins
- Currently type-only — no classes, no behavior. If an invariant appears, encode it here rather than in a use case
- `AcademyRepository` methods are synchronous and return domain types or `undefined`. Absence is signalled with `undefined`; the port never throws
- Adding or renaming a port method requires updating every implementation in `src/infrastructure` in the same change
- The string unions are the source of truth for downstream switch and label logic — widening one means auditing every consumer in `application`, `routes`, and `components`:
  - `ModuleStatus`: `complete` | `in-progress` | `available` | `locked`
  - `ModuleCategory`: `Core Policies` | `SMT Pathway` | `Staff Development`
  - `ModuleLessonKind`: `video` | `audio` | `reading` | `case-study` | `assessment`
  - `ModuleAssetKind`: `video` | `audio` | `document` | `worksheet`
  - `ReviewDecision`: `pending` | `approved` | `rejected` | `edited`
  - `ModuleAsset.status`: `published` | `draft`
- Entity shapes: `TrainingModule` owns its `sections: ModuleSection[]` and `resources: ModuleAsset[]`; a section links assets by id through `documentIds`; `featuredAssetId` points at one entry in `resources`
- `AdminStaffProfile extends StaffMember` and carries `AdminStaffModuleProgress[]`. Learner-side and admin-side staff types are deliberately separate — do not merge them into one shape

## Work Guidance

- Keep names in domain language, not UI language. A field is `durationMinutes`, not `durationLabel`, unless the label itself is the durable fact
- Fields that exist only to render a specific screen belong in an `application` view-model, not on an entity

## Verification

From the repo root: `npx tsc --noEmit` catches port and consumer drift. See the root AGENTS.md for the known-failure baseline.

## Child DOX Index

No children.
