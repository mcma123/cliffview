# Module UI Implementation Phases

This file breaks the next UI work into clear phases. Each phase should be checked off only after the implementation, verification, and any required integration updates for that phase are complete.

## Progress

- [x] Phase 1: Asset Editor Route
- [x] Phase 2: Lesson Ordering UI
- [x] Phase 3: Academy Docs Drawer/Modal
- [ ] Phase 4: Final Integration and Verification

---

## Phase 1: Asset Editor Route

Status:

- [x] Completed

Goal:

- Add a dedicated admin-side asset editor route for module documents, video placeholders, and audio placeholders.

Scope:

- Create a route for editing a single asset from the admin module editor.
- Support UI sections for:
  - asset title
  - asset type
  - asset description
  - placeholder upload state
  - publish/draft state
  - learner-side usage references
- Link asset cards from the admin module editor into the new asset editor route.

Deliverables:

- New asset editor page UI
- Route wiring
- Navigation from module editor to asset editor
- Shared mock data/view-model support if needed

Definition of done:

- Admin can open a dedicated page for an asset from the module editor UI.
- The page visually supports video, audio, and document placeholders.
- The route builds and lint checks pass.

---

## Phase 2: Lesson Ordering UI

Status:

- [x] Completed

Goal:

- Add a drag-and-drop-looking lesson ordering experience to the admin module editor.

Scope:

- Update the lesson builder area so lesson cards visibly look reorderable.
- Add visual affordances such as:
  - drag handles
  - ordering rails or grouped list styling
  - move up/down or reorder placeholder actions
- Keep it UI-only for now without backend persistence.

Deliverables:

- Reorder-focused lesson list styling
- Admin-facing reorder controls or placeholder drag interactions
- Clear visual hierarchy for lesson sequence

Definition of done:

- Lesson order feels intentionally designed for reordering.
- UI communicates reorderability even if persistence is not implemented yet.
- The module editor remains consistent with the portal theme.

---

## Phase 3: Academy Docs Drawer/Modal

Status:

- [x] Completed

Goal:

- Replace static lesson resource cards on the academy side with a real “More docs” drawer or modal pattern.

Scope:

- Add a learner-side trigger in the lesson view.
- Open a drawer or modal that displays related documents/resources for the lesson.
- Include UI blocks for:
  - document title
  - type
  - short description
  - placeholder actions such as open/download/view

Deliverables:

- Drawer or modal component usage in the academy lesson experience
- Lesson-level docs trigger
- Styled resource list inside overlay UI

Definition of done:

- Staff can open a focused docs experience from a lesson page.
- Static inline docs are replaced or reduced in favor of the overlay pattern.
- The interaction works cleanly on desktop and mobile layouts.

---

## Phase 4: Final Integration and Verification

Status:

- [ ] Not started

Goal:

- Finalize the three features as one coherent module-management and learner-consumption flow.

Scope:

- Check navigation between:
  - admin module editor
  - lesson editor
  - asset editor
  - academy lesson docs experience
- Confirm the new UI reads from the same mock/shared content structures.
- Run formatting, linting, and build verification.

Deliverables:

- Integrated route flow
- Updated route generation if needed
- Final verification pass

Definition of done:

- All related routes compile correctly.
- UI relationships between admin and academy sides remain coherent.
- Lint/build verification succeeds.

---

## Completion Rules

When a phase is finished:

1. Change its `Status` checkbox to completed.
2. Update the matching item in the top-level `Progress` list.
3. Only move to the next phase after verifying the current one.
