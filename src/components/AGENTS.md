# src/components

## Purpose

Shared React components: the two app shells, feature views, admin form dialogs, brand marks, and the generated shadcn primitive set.

## Ownership

- Owns navigation structure through the shells, feature-component props, and dialog behavior
- Owns `ui/` as a child boundary
- Does not own data access; components receive already-built view-models

## Local Contracts

- Components never import `@/infrastructure`, `@/application`, or `@/domain` values. They take view-model props built by a route loader — `AcademyModuleDetailView({ data })` is the pattern
- `staff-shell.tsx` and `admin-shell.tsx` own navigation. The `nav` / `adminNav` arrays at the top of each file are the only place to register a route in navigation
  - `StaffShell` renders a desktop sidebar, a mobile drawer, a sticky top bar, and a mobile bottom nav; it accepts an optional `title`. Active state is `pathname.startsWith(item.to)`
  - `AdminShell` nav items carry `exact` and `ready`. Non-ready items render as an inert `<a>` with a "soon" badge — `Reports` is currently the only one. Add `ready: true` when a route lands
  - `StaffShell` no longer invents an identity. It takes optional `viewer`, `streakDays`, `showAdminLink` and `onSignOut` props, which the routes fill from `useStaffViewer()` — the component itself stays Convex-free. Absent props render nothing rather than a placeholder, so the chrome is blank while the gate resolves instead of showing somebody else's initials. The notification bell was removed: it was a button with no handler and no count. `showAdminLink` matters beyond cosmetics — the 'Switch to SMT' link used to be shown to every teacher in the school, with the admin gate doing the refusing
- Dialogs (`add-lesson-dialog`, `add-objective-dialog`, `attach-content-dialog`) wrap their own trigger via `children` and take a callback the route supplies. They still import no Convex: the route owns the mutation and passes ids in, which is what keeps them reusable
- `add-lesson-dialog` offers all five `ModuleLessonKind` values and emits a typed `kind`. `case-study` was missing before, so the kind the seeded scenario lessons use could not be created through the UI
- `add-staff-dialog` creates a staff profile and takes its phase list as a prop. Its `onCreate` is awaited and rethrows on failure, so the dialog stays open with the values intact when the server refuses a duplicate email — losing a whole form to one typo is worse than the typo
- It has no inputs for compliance, CPTD points or XP. Those are earned from enrollment rows, and a form that could type them in is a form that can make the dashboard lie
- `attach-content-dialog` is a picker over the module's existing assets, not an uploader — uploading is the drop zone's job, and the two are deliberately separate: attaching links an existing asset to a lesson, uploading puts bytes behind an asset. It previously had no callback at all, and its Cancel and Attach buttons did the same thing
- `drag-and-drop-zone.tsx` uploads real files as of Phase 6, and is **fully controlled**: `status`, `progress`, `errorMessage` and `uploadedFileName` come from the caller, and `onUpload` is awaited. It decides nothing about success on its own. It used to keep its own `uploadedFile` state and print "File ready" the moment a file was picked, before the sync `onUpload` callback had even run — a success message for a file that was never sent
- It still imports no Convex. The route calls `useAssetUploads` and hands the zone its slice of the state, which is the same split the dialogs use
- A zone with no `onUpload` is a read-only status card, and renders as one. That is deliberate, not an oversight
- Its file input is hidden and ref-driven, not an `opacity-0` overlay stretched across the card. The overlay swallowed every click inside the zone, which is why the old "Replace file" button could never be reached
- `assessment-question-editor.tsx` edits one question in place and **cannot express a shape the server would reject**: the correct answer is a radio rather than a checkbox, so "exactly one correct" holds by construction, and choosing "True or false" collapses the list to the two fixed rows `questions.save` normalises to. Its `onSave` is awaited and the card keeps its values when the server refuses, for the reason `add-staff-dialog` already records. `QuestionDraft` and `emptyDraft()` live in `assessment-question-draft.ts` rather than beside the component, per the non-component-export rule below
- `assessment-runner.tsx` is the learner's quiz: a stepper, then a results screen that marks each question right or wrong. It is **never told which answer was correct** — `learn.assessment` does not return `isCorrect`, so the component has no answer key to leak even by accident, and a retake stays a real question rather than a memory test
- Brand marks live only in `cliffview-logo.tsx` (`CliffviewShield`, `CliffviewWordmark`). Do not inline logo SVG anywhere else
- Style with Tailwind utilities composed through `cn()` from `@/lib/utils`. Use semantic tokens only — `bg-card`, `text-muted-foreground`, `text-gold`, `bg-primary-deep`, `text-success`. No hex, rgb, or arbitrary color values; add a token in `src/styles.css` instead
- A component that exports non-component values alongside components trips the `react-refresh/only-export-components` warning. Move shared constants to their own module

## Work Guidance

- Keep feature components presentational and prop-driven so the same view can serve a learner route and an admin preview
- Prefer composing an existing `ui/` primitive over hand-rolling markup

## Verification

From the repo root: `npx tsc --noEmit`, `npm run lint`. Check both desktop and mobile layouts for shell or nav changes, since navigation is duplicated across sidebar, drawer, and bottom nav.

## Child DOX Index

- `ui/AGENTS.md` — shadcn/ui primitives generated by the CLI

Owned by components, no child doc: `add-staff-dialog.tsx`, `staff-shell.tsx`, `admin-shell.tsx`, `academy-module-detail-view.tsx`, `add-lesson-dialog.tsx`, `add-objective-dialog.tsx`, `attach-content-dialog.tsx`, `drag-and-drop-zone.tsx`, `cliffview-logo.tsx`
