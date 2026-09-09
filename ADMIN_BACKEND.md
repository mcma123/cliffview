# Admin Backend Implementation Phases

Convex backend for the SMT admin console. This file tracks execution; the reasoning behind each decision lives in the approved plan.

Each phase is independently shippable: at every phase boundary the app builds, every route renders, and nothing is half-migrated. Check a phase off only after its tasks, its verification, and its DOX pass are all complete.

## Progress

- [x] Phase 0: Toolchain and Safety Rails
- [x] Phase 1: Schema and Read Functions
- [x] Phase 2: Seed Content and People
- [ ] Phase 3: Client Wiring and Admin Content Reads
- [ ] Phase 4: Auth and the Admin Guard
- [ ] Phase 5: Content Mutations and Test Harness
- [ ] Phase 6: File Storage and Real Uploads
- [ ] Phase 7: Staff Directory, AI Review, Honest Analytics
- [ ] Phase 8: Retire the Port and Cut Over the Learner Side

## Locked Decisions

| Decision      | Choice                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data flow     | **Convex is the port.** No hand-written `AcademyRepository`; `convexQuery` in loaders, `useSuspenseQuery` in route components, `src/application` becomes pure presenters. |
| Auth timing   | **Before the first mutation.** Content reads may precede it; every mutation ships with `requireAdmin`. Staff and AI review land after auth (employee PII).                |
| Numbers       | **Derive everything, backfill the seed** so displayed numbers are true and still plausible. Add the missing 4th staff profile.                                            |
| AI scope      | **Persist decisions only.** Real queue plus audit trail; no LLM generation pipeline.                                                                                      |
| Auth provider | Better Auth (email + password) — assumed, confirm at Phase 4. Clerk only if Cliffview runs Google Workspace.                                                              |

## Standing Rules

- Prod `diligent-mink-756` is the only deployment. Announce the target and get a **fresh explicit yes in the current session** before every gated command; consent never carries between gates or sessions.
- From Phase 3 on, every schema-affecting push is rehearsed on a preview deployment first and preceded by `npx convex export`.
- A push that "changed nothing" means the wrong deployment was hit — re-check the target, do not re-run.
- `convex/_generated` is generated. Never hand-edit.
- Every mutation calls `requireAdmin(ctx)` first and stamps `updatedAt` / `updatedBy`.

---

## Phase 0: Toolchain and Safety Rails

Status:

- [x] Completed

Goal:

- Make every later phase verifiable. No prod contact, no consent gate.

Tasks:

- [x] Create `ADMIN_BACKEND.md` (this file)
- [x] Create `convex/tsconfig.json` so `convex/` can be typechecked without a production push. Confirm the shape against the installed version's generated template rather than writing it from memory. Do not simply widen the root `tsconfig.json` — `convex/` needs different `lib`/`module` settings and must exclude `_generated`
- [x] Add `convex/_generated` to `.prettierignore` and to `ignores` in `eslint.config.js`
- [x] Clear the CRLF baseline: add `"endOfLine": "auto"` to `.prettierrc` (or add a `.gitattributes` with `* text=auto eol=lf`), then run one `npm run format` sweep
- [x] Add `typecheck` and `typecheck:convex` npm scripts
- [x] DOX pass: `convex/AGENTS.md` Verification section (remove the "typecheck is not wired" paragraph), root `AGENTS.md` Verification baseline

Verification:

- [x] `npm run lint` passes clean for the first time
- [x] `npx tsc --noEmit` reports exactly the 4 known `<Link to>` errors
- [x] `npx tsc --noEmit -p convex` passes
- [x] `npm run build` succeeds

Definition of done:

- Lint is a usable signal, and `convex/` can be typechecked with zero production contact.

---

## Phase 1: Schema and Read Functions

Status:

- [x] Completed

Consent gate: **G1** — first schema push (`npx convex dev --prod`). Prod is empty, so this push carries no data risk. That window closes at Phase 2, which is why every schema decision belongs here.

Goal:

- Land all 18 tables and the admin read surface, separating content from per-learner progress.

Tasks:

- [x] `convex/validators.ts` — shared validators mirroring the `entities.ts` unions
- [x] `convex/schema.ts` — 18 tables with their indexes. Content: `modules`, `moduleObjectives`, `lessons`, `assets`, `lessonAssets`. People: `phases`, `users`, `enrollments`, `lessonProgress`, `assessmentAttempts`. AI review: `aiGenerations`, `aiQuestions`, `aiQuestionOptions`, `aiReviewDecisions`. Analytics: `progressEvents`, `monthlyRollups`, `counters`, `auditLog`
- [x] Audit fields (`updatedAt`, `createdBy`, `updatedBy`) optional, so the Phase 2 seed can run before auth exists
- [~] `convex/convex.config.ts` — **deferred to Phase 4.** Its two uses are registering components (`app.use()`) and declaring typed env vars via `defineApp({ env })`; we have neither until Better Auth lands, and an empty `defineApp()` switches codegen into component mode for no benefit
- [x] `convex/lib/authz.ts` — the single choke point (`getActor`, `requireStaff`, `requireAdmin`), shipping now and refusing everything until Phase 4, so no mutation can be written without it
- [x] `convex/lib/ordering.ts` (dense renumber in one transaction), `convex/lib/audit.ts`, `convex/lib/counts.ts`
- [x] `convex/modules.ts` — `listForAdmin`, `adminDetail` (module + lessons + assets + links in one transaction)
- [x] `convex/lessons.ts` — `adminDetail`
- [x] `convex/assets.ts` — `adminDetail` including the `by_asset` reverse lookup for "Where this asset appears"
- [x] `convex/dashboard.ts` — `adminOverview`, shipped as an **`internalQuery`**: it reads `users` and returns school-wide compliance aggregates, which is privileged, and with no auth provider yet it must not be publicly reachable. Phase 4 flips it to a public query behind `requireAdmin`, so **the overview screen is wired in Phase 4, not Phase 3**
- [x] DOX pass: `convex/AGENTS.md` — replace the "Current state" block with the table, index, and query surface; add the derived-not-stored rule so nobody re-adds `sectionCount`

Verification:

- [x] `npx tsc --noEmit -p convex` passes
- [x] `convex-reviewer` and `convex-authz` skills run clean
- [x] **G1** push, then `npx convex function-spec` shows the expected surface
- [x] Every route still renders from the in-memory container — the app is not wired yet

Definition of done:

- Schema and admin read queries live on prod. Nothing in the UI has changed.

---

## Phase 2: Seed Content and People

Status:

- [x] Completed

Consent gates: **G2** — `npx convex run seed:run` (first write to prod). **G3** — `npx convex export` baseline.

Goal:

- Populate prod with the nine modules, their lessons and assets, and four staff profiles, cleaning up the seed's contradictions on the way in.

Tasks:

- [x] `convex/seed/data.ts` — the content, copied in (it cannot import `@/domain`; the duplication dies at Phase 8)
- [x] `convex/seed.ts` — `internal.seed.run` as an idempotent `internalMutation`, not `npx convex import`, because the seed needs cleanup rather than transcription and slug-to-id resolution is natural in a mutation
- [x] Guards: `internalMutation` (not client-reachable), a required `confirm: v.literal("cliffview")` arg, and `mode: "insert-missing" | "reset"` where `reset` throws unless the tables are empty or `iAmSure: v.literal(true)` is passed
- [x] Cleanups the seed performs: split `honorific`/`firstName`/`lastName`; omit `sectionCount`; omit per-module `progressPercent`/`status`; convert `documentIds` arrays into `lessonAssets` rows; omit the contradictory staff counters; convert `lastUpdatedLabel` into `contentUpdatedAt`
- [x] Backfill so numbers are true and plausible: add the missing **Mr. Pillay** profile (currently only a leaderboard row), and add the enrollment/progress rows that make staff-01's 88% and staff-02's 6-of-6 accurate
- [x] Seed `phases`, `monthlyRollups` (6 trend points), and `counters`
- [ ] Ask the user to generate a preview `CONVEX_DEPLOY_KEY` in the dashboard, so Phases 3-7 can rehearse schema changes off prod
- [x] DOX pass: `convex/AGENTS.md` seed contract and idempotence; `src/infrastructure/AGENTS.md` note that the seeded-identifier list is now duplicated in `convex/seed/data.ts`

Verification:

- [x] **G2** run completes
- [x] `npx convex data modules|lessons|assets|users` shows the expected counts
- [x] Re-running with `insert-missing` leaves counts unchanged (idempotence)
- [x] **G3** baseline export taken

Definition of done:

- Prod holds real content and people. The app still reads from the container, so no screen can render empty.

---

## Phase 3: Client Wiring and Admin Content Reads

Status:

- [ ] Completed

Consent gate: **G4** — push read queries (low risk, additive).

Goal:

- Point the five admin read screens at Convex with SSR plus live updates, and move view-model building into presenters.

Tasks:

- [ ] Install `@convex-dev/react-query` and `@tanstack/react-router-ssr-query` (both older than 24h, so `bunfig.toml`'s release-age guard needs no exclusion entry — adding one requires the user's confirmation)
- [ ] `src/infrastructure/convex/client.ts` — `ConvexQueryClient` factory built in the shape auth needs (token-getter indirection returning `undefined`, `expectAuth: false`), so Phase 4 flips two lines instead of rewriting the router
- [ ] `src/router.tsx` and `src/routes/__root.tsx` — `connect(queryClient)`, `setupRouterSsrQueryIntegration`, `ConvexProvider` at or above the existing `QueryClientProvider`
- [ ] `src/application/academy/presenters.ts` — move the admin view-model builders out of `use-cases.ts`, dropping the `repo` argument and keeping `formatModuleMeta`, `formatSectionMeta`, `getLessonHref`, `getAssetHref`; add `formatRelativeTime`, `formatLessonDuration`, `formatAssetMeta`, `formatMonthShort`
- [ ] Rewire the 5 admin read routes: `academy.admin.index`, `academy.admin.modules.index`, `academy.admin.modules.$moduleSlug.index`, `...lessons.$lessonId`, `...assets.$assetId`
- [ ] Remove the 8 admin entries from `src/infrastructure/academy/container.ts`; the 5 learner entries stay
- [ ] Module status badges switch from `complete|in-progress|available|locked` to `draft|published|archived` in both places that branch on them
- [ ] Lesson badge shows the real `status` with genuine three-way styling (all three currently render identically)
- [ ] `key={objective}` becomes `key={objectiveId}` — duplicate objective text is a React key collision today
- [ ] Delete the synthesised `uploadZones` literals; render zones from real `assets` rows, display-only until Phase 6
- [ ] Fix 2 of the 4 `<Link to>` typecheck errors
- [ ] DOX pass: `src/routes/AGENTS.md` (two-path data rule with its Phase-8 end date), `src/AGENTS.md` (resolve the loader-vs-Query ambiguity, rewrite the dependency rule), `src/application/AGENTS.md` (presenters vs use-cases), `src/infrastructure/AGENTS.md` (strike the "forces the port to async" and "one line changed in container.ts" claims), root `AGENTS.md`

Verification:

- [ ] `npx tsc --noEmit` down to 2 errors; `npx tsc --noEmit -p convex` clean; `npm run build` succeeds
- [ ] **G4** push
- [ ] All five admin routes load, and view-source confirms SSR
- [ ] Editing a row through the Convex dashboard repaints an open page with no refresh
- [ ] Learner routes still render from the container

Definition of done:

- Admin content screens read from prod, server-render, and update live.

---

## Phase 4: Auth and the Admin Guard

Status:

- [ ] Completed

Consent gates: **G5** — `npx convex env set`. **G6** — auth component plus `accessRole` backfill (schema change on populated tables: export and rehearse first).

Goal:

- Real identity and a real admin guard, before any mutation exists.

Tasks:

- [ ] Confirm the auth provider with the user
- [ ] `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`
- [ ] `src/lib/auth-client.ts`, `src/lib/auth-server.ts`, `src/routes/api/auth/$.ts`
- [ ] `convex/lib/authz.ts` — `requireAdmin` becomes real, keyed on `users.accessRole`
- [ ] `src/routes/academy.admin.tsx` — the 2-line pass-through becomes the guard (`beforeLoad` → identity → `accessRole` → redirect). This is a documented exception to the layout-pass-through rule
- [ ] `src/routes/academy.sign-in.tsx` — real submit and error states; `src/routes/index.tsx`
- [ ] Add `requireStaff` to the four public content queries, flip `dashboard.adminOverview` to a public query behind `requireAdmin`, and wire the overview screen
- [ ] `convex/convex.config.ts` — deferred here from Phase 1, needed for the auth component
- [ ] `src/router.tsx` — `expectAuth: true` and the real token getter
- [ ] `convex/seed.ts` — link seeded profiles to auth users and set `accessRole`
- [ ] Set prod env vars (`BETTER_AUTH_SECRET`, `SITE_URL` — must match the deployed origin, not localhost)
- [ ] DOX pass: `src/routes/AGENTS.md` (remove "Sign-in is UI only", add the guard contract and the layout exception), `src/lib/AGENTS.md`, `convex/AGENTS.md` (required env vars, the `requireAdmin`-on-every-mutation rule), root `AGENTS.md`

Verification:

- [ ] `npx tsc --noEmit -p convex` clean; `convex-authz` skill clean
- [ ] **G5** env vars set; export → preview-rehearse the backfill → **G6** push
- [ ] Signed out, `/academy/admin` redirects to sign-in
- [ ] A `staff` account is refused; an `admin` account gets through
- [ ] Learner routes still work unauthenticated

Definition of done:

- No unauthenticated access to the admin console, and `requireAdmin` is enforceable.

---

## Phase 5: Content Mutations and Test Harness

Status:

- [ ] Completed

Consent gate: **G7** — first client-reachable writes. Do not open before G5 and G6 are closed.

Goal:

- Make the content studio actually persist, with authorization proven by tests before the push.

Tasks:

- [ ] Install `vitest`, `@edge-runtime/vm`, `convex-test`; add `vitest.config.ts` (`environment: "edge-runtime"`) and a `test` script. `convex-test` is the substitute for the dev sandbox this project does not have
- [ ] `convex/modules.ts` — `create`, `update`, `setPublishState`, `publish` (with the readiness gate), `remove`
- [ ] `convex/objectives.ts` — `add`, `update`, `remove`, `reorder`
- [ ] `convex/lessons.ts` — `create`, `update`, `move`, `reorder` (rejecting a mismatched id set), `remove`, `attachAsset`, `detachAsset`
- [ ] `convex/assets.ts` — `create`, `update`, `setStatus`, `remove`
- [ ] `academy.admin.modules.create.tsx` — real create then navigate to the returned slug; trim the category `<select>` to the 3 valid `ModuleCategory` values (two current options would fail arg validation)
- [ ] Module editor — add the missing save path and wire the 4 dead reorder buttons
- [ ] Lesson editor — replace the toast-only save; duration becomes numeric; lesson type becomes a real select instead of a read-only `<div>`
- [ ] Asset editor — publish state becomes a control instead of a read-only `<div>`
- [ ] Pass target ids into `AddLessonDialog`, `AddObjectiveDialog`, and `AttachContentDialog` as props; add the missing `case-study` lesson kind; make `AttachContentDialog`'s inputs controlled and its Attach button do something other than close. Dialogs still never import Convex
- [ ] Delete `getSupportingResources`' silent fallback and give both affected surfaces a real empty state — the "N assets" badge will start showing `0`
- [ ] Fix the last 2 `<Link to>` typecheck errors
- [ ] DOX pass: `convex/AGENTS.md` (`npm test`, the `requireAdmin`-first rule, the audit-field convention), `src/routes/AGENTS.md`, `src/components/AGENTS.md`, root `AGENTS.md`, and reconcile `MODULE_UI_PHASES.md` Phase 4

Verification:

- [ ] `npm test` passes **before** the push, including: admin succeeds; `t.withIdentity({ subject: "staff-user" })` is refused; no identity is refused; a caller cannot write into a module they do not own; `seed:run` refuses `reset` on populated tables
- [ ] `npx tsc --noEmit` reaches **0**
- [ ] `convex-reviewer` and `convex-authz` clean; `npm run build` succeeds
- [ ] **G7** push, then editing a module title in the UI updates the library page and dashboard counters with no refresh

Definition of done:

- Every content write in the admin UI persists and is authorization-tested.

---

## Phase 6: File Storage and Real Uploads

Status:

- [ ] Completed

Consent gate: **G8** — storage fields (schema change: export and rehearse first).

Goal:

- Replace six upload zones that transmit zero bytes with real Convex file storage.

Tasks:

- [ ] `assets.generateUploadUrl` — admin-gated; an open upload-URL mutation lets anyone fill the storage quota
- [ ] `assets.attachFile({ assetId, storageId, fileName, contentType, sizeBytes, ... })` — patches the asset and deletes the previous blob so replacing a file cannot leak storage
- [x] Schema: `storageId`, `fileName`, `contentType`, `sizeBytes`, `pageCount`, `durationSeconds` on `assets` — **already landed in Phase 1** while the tables were empty, so no schema change is needed against populated data here
- [ ] Read side resolves a signed URL per read via `ctx.storage.getUrl` — never persisted, since it is an expiring credential
- [ ] `src/hooks/use-asset-upload.ts` — owns the three-step round trip
- [ ] `src/components/drag-and-drop-zone.tsx` — gains `status`, `progress`, `errorMessage`, and a controlled `uploadedFileName`; `onUpload` becomes async. It currently reports "File ready" for a file that was never sent. The component still imports no Convex
- [ ] `presenters.ts` — asset `meta` derived from `contentType` and `sizeBytes`, falling back to the seeded note
- [ ] DOX pass: `src/components/AGENTS.md` (remove "visual-only. Nothing persists"), `src/AGENTS.md` (`hooks/` now holds a Convex-touching hook), `convex/AGENTS.md` (storage flow, the admin gate, the never-persist-a-URL rule)

Verification:

- [ ] `npm test` includes a case asserting a non-admin cannot obtain an upload URL
- [ ] Export → preview rehearse → **G8** push
- [ ] Uploading a real PDF through the admin UI works, and `npx convex data assets` shows the `storageId`
- [ ] Replacing the file deletes the old blob

Definition of done:

- Uploads move real bytes, and the UI tells the truth about upload state.

---

## Phase 7: Staff Directory, AI Review, Honest Analytics

Status:

- [ ] Completed

Consent gate: **G9** — staff and AI review (schema change on PII: export and rehearse first).

Goal:

- Back the remaining admin screens, and make the dashboard's numbers real.

Tasks:

- [ ] `convex/phases.ts`, `convex/staff.ts` (`directory`, `detail`, `leaderboard`), `convex/enrollments.ts`, `recomputeCompliance`
- [ ] `convex/aiReview.ts` — `queue`, real counts via `by_status`, and `setDecision` writing an append-only `aiReviewDecisions` row with reviewer identity and timestamp
- [ ] Delete the `setInterval` generation simulation and the `Date.now()`-keyed fake questions; question ids become `Id<"aiQuestions">` (so `AiReviewQuestion.id: number` changes type) and `moduleTitle` becomes a joined field off `moduleId`
- [ ] Delete `academyCommands` and `applyAiReviewDecision` — a local-state reducer replaced by a real mutation
- [ ] Rewire `academy.admin.staff.index`, `academy.admin.staff.$staffId`, `academy.admin.ai-review`
- [ ] Move the staff presenters over; delete the `.replace("Ms. ", "")` initials hack; fix the directory avatar to use `firstName[0]`
- [ ] Dashboard: derived counters, a `monthlyRollups` range scan for the trend, per-phase averages from `by_phase`. The four `+N` delta tiles stay gone until a monthly snapshot exists to compare against — add the cron that starts recording one
- [ ] Make the "Last 30 days" button real or remove it; honest labels are required
- [ ] Add `.withOptimisticUpdate(...)` to `setDecision` only — the one screen where an admin clicks through many items in a row
- [ ] DOX pass: `src/application/AGENTS.md` (remove the "no write-side port yet" and hardcoded-142 notes), `src/infrastructure/AGENTS.md`, `src/routes/AGENTS.md`, `convex/AGENTS.md` (the PII read gate)

Verification:

- [ ] `npm test` includes "a `staff` identity cannot read the directory"
- [ ] `npx tsc --noEmit` still 0
- [ ] Export → rehearse → **G9** push
- [ ] Approving a question drops the dashboard pending count with no refresh

Definition of done:

- Every admin screen reads and writes prod, and no displayed number is a literal.

---

## Phase 8: Retire the Port and Cut Over the Learner Side

Status:

- [ ] Completed

Consent gate: **G10** — `npx convex deploy` from CI (build-time push).

Goal:

- End the transitional state. Until this lands, an admin edits a module and learners keep seeing seed data.

Tasks:

- [ ] `convex/progress.ts` and wire `lessonProgress` / `enrollments` — the per-learner state taken off `modules` in Phase 1
- [ ] Rewire the 4 learner routes
- [ ] Delete `src/domain/academy/repositories.ts`, `src/infrastructure/academy/in-memory-academy-repository.ts`, `src/infrastructure/academy/container.ts`, `src/application/academy/use-cases.ts`
- [ ] Strip learner-state fields from `src/domain/academy/entities.ts`, keeping the string unions
- [ ] With the user's explicit go-ahead, delete the legacy overlapping `academy.modules.social-media-*` routes
- [ ] Vercel `CONVEX_DEPLOY_KEY` and build command so `npx convex deploy` runs at build time
- [ ] Revisit the `expectAuth` decision now that learner routes authenticate
- [ ] Final DOX pass across all 10 `AGENTS.md` files; close `MODULE_UI_PHASES.md` Phase 4

Verification:

- [ ] `npm test` passes; `npx tsc --noEmit` 0
- [ ] `npm run build` succeeds for both the `vercel` and `node-server` Nitro presets
- [ ] **G10** deploy
- [ ] End-to-end: an admin edits a module and uploads a document, and a learner in another browser sees the new copy and downloads the file

Definition of done:

- One backend, one source of truth, no in-memory repository left in the tree.

---

## Open Items

- [ ] Confirm the auth provider (Phase 4) — Better Auth unless Google Workspace sign-in is wanted
- [ ] User generates a preview `CONVEX_DEPLOY_KEY` in the Convex dashboard (Phase 2)
- [ ] Decide learner-facing document privacy: signed-but-public URL, or an identity-checked `httpAction` stream? Affects Phase 6
- [ ] Explicit go-ahead to delete the legacy `social-media-*` routes (Phase 8)

## Completion Rules

When a phase is finished:

1. Tick every task and every verification item in that phase.
2. Change its `Status` checkbox to completed.
3. Update the matching item in the top-level `Progress` list.
4. Complete the phase's DOX pass — update the nearest owning `AGENTS.md`, any affected parents or children, and every affected Child DOX Index.
5. Only move to the next phase after verifying the current one.
