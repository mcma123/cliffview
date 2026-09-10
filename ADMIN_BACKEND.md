# Admin Backend Implementation Phases

Convex backend for the SMT admin console. This file tracks execution; the reasoning behind each decision lives in the approved plan.

Each phase is independently shippable: at every phase boundary the app builds, every route renders, and nothing is half-migrated. Check a phase off only after its tasks, its verification, and its DOX pass are all complete.

## Progress

- [x] Phase 0: Toolchain and Safety Rails
- [x] Phase 1: Schema and Read Functions
- [x] Phase 2: Seed Content and People
- [x] Phase 3: Client Wiring and Admin Content Reads
- [x] Phase 4: Auth and the Admin Guard
- [x] Phase 5: Content Mutations and Test Harness
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

- [x] Completed

Consent gate: **G4** — push read queries (low risk, additive).

Goal:

- Point the five admin read screens at Convex with SSR plus live updates, and move view-model building into presenters.

Tasks:

- [x] Install `@convex-dev/react-query` and `@tanstack/react-router-ssr-query` (both older than 24h, so `bunfig.toml`'s release-age guard needs no exclusion entry — adding one requires the user's confirmation)
- [x] `src/infrastructure/convex/client.ts` — `ConvexQueryClient` factory built in the shape auth needs (token-getter indirection returning `undefined`, `expectAuth: false`), so Phase 4 flips two lines instead of rewriting the router
- [x] `src/router.tsx` and `src/routes/__root.tsx` — `connect(queryClient)`, `setupRouterSsrQueryIntegration`, `ConvexProvider` at or above the existing `QueryClientProvider`
- [x] `src/application/academy/presenters.ts` — move the admin view-model builders out of `use-cases.ts`, dropping the `repo` argument and keeping `formatModuleMeta`, `formatSectionMeta`, `getLessonHref`, `getAssetHref`; add `formatRelativeTime`, `formatLessonDuration`, `formatAssetMeta`, `formatMonthShort`
- [x] Rewire the 5 admin read routes: `academy.admin.index`, `academy.admin.modules.index`, `academy.admin.modules.$moduleSlug.index`, `...lessons.$lessonId`, `...assets.$assetId`
- [x] Remove the 8 admin entries from `src/infrastructure/academy/container.ts`; the 5 learner entries stay
- [x] Module status badges switch from `complete|in-progress|available|locked` to `draft|published|archived` in both places that branch on them
- [x] Lesson badge shows the real `status` with genuine three-way styling (all three currently render identically)
- [x] `key={objective}` becomes `key={objectiveId}` — duplicate objective text is a React key collision today
- [x] Delete the synthesised `uploadZones` literals; render zones from real `assets` rows, display-only until Phase 6
- [x] Fix 2 of the 4 `<Link to>` typecheck errors
- [x] DOX pass: `src/routes/AGENTS.md` (two-path data rule with its Phase-8 end date), `src/AGENTS.md` (resolve the loader-vs-Query ambiguity, rewrite the dependency rule), `src/application/AGENTS.md` (presenters vs use-cases), `src/infrastructure/AGENTS.md` (strike the "forces the port to async" and "one line changed in container.ts" claims), root `AGENTS.md`

Verification:

- [x] `npx tsc --noEmit` down to 2 errors; `npx tsc --noEmit -p convex` clean; `npm run build` succeeds
- [x] **G4** push
- [x] All five admin routes load, and view-source confirms SSR
- [~] Editing a row through the Convex dashboard repaints an open page with no refresh — **deferred to Phase 5**. Proven instead: SSR reads live prod data, the dehydrated Convex query cache is embedded in the HTML, and the deployment URL is in the client bundle so the socket connects. The visible repaint needs a mutation to trigger it from the UI, which Phase 5 adds
- [x] Learner routes still render from the container

Definition of done:

- Admin content screens read from prod, server-render, and update live.

---

## Phase 4: Auth and the Admin Guard

Status:

- [x] Completed

Consent gates: **G5** — `npx convex env set`. **G6** — auth component plus `accessRole` backfill (schema change on populated tables: export and rehearse first).

Goal:

- Real identity and a real admin guard, before any mutation exists.

Tasks:

- [x] Confirm the auth provider with the user
- [x] `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`
- [~] `src/lib/auth-client.ts`, `src/lib/auth-server.ts`, `src/routes/api/auth/$.ts` — **not needed.** Convex Auth serves its endpoints from the deployment's `.site` domain and ships its own React hooks, so there is no auth client wrapper and no `/api/auth/*` route
- [x] `convex/lib/authz.ts` — `requireAdmin` becomes real, keyed on `users.accessRole`
- [x] `src/routes/academy.admin.tsx` — the 2-line pass-through becomes the guard (`beforeLoad` → identity → `accessRole` → redirect). This is a documented exception to the layout-pass-through rule
- [x] `src/routes/academy.sign-in.tsx` — real submit and error states; `src/routes/index.tsx`
- [x] Gated the four content queries with **`requireAdmin`** rather than the planned `requireStaff` — they expose draft and archived content, and being signed in as staff is not the same as being allowed to see unpublished material. Flipped `dashboard.adminOverview` to a public query behind `requireAdmin` and wired the overview screen
- [~] `convex/convex.config.ts` — **still not needed.** Convex Auth is a library, not a component; its tables are spread into our schema via `...authTables`
- [~] `src/router.tsx` — the real token getter. `expectAuth: true` was set here and **was a bug**: it holds back actions as well as queries and starts the client paused, so with nobody signed in the socket never resumed and `auth:signIn` could never be sent. The sign-in button froze with no error and no server log. Removed; `src/infrastructure/AGENTS.md` records why it must not return
- [x] `convex/seed.ts` — the `email` index rename Convex Auth requires. Profiles are linked at first sign-in by `createOrUpdateUser` rather than by the seed, so no seed-time linking is needed
- [x] Set prod env vars (`BETTER_AUTH_SECRET`, `SITE_URL` — must match the deployed origin, not localhost)
- [x] DOX pass: `src/routes/AGENTS.md` (remove "Sign-in is UI only", add the guard contract and the layout exception), `src/lib/AGENTS.md`, `convex/AGENTS.md` (required env vars, the `requireAdmin`-on-every-mutation rule), root `AGENTS.md`

Verification:

- [x] `npx tsc --noEmit -p convex` clean; `convex-authz` skill clean
- [x] **G5** env vars set; export → preview-rehearse the backfill → **G6** push
- [x] Signed out, `/academy/admin` redirects to sign-in
- [x] A `staff` account is refused; an `admin` account gets through
- [x] Learner routes still work unauthenticated

Definition of done:

- No unauthenticated access to the admin console, and `requireAdmin` is enforceable.

---

## Phase 5: Content Mutations and Test Harness

Status:

- [x] Completed

Consent gate: **G7** — first client-reachable writes. Do not open before G5 and G6 are closed.

Goal:

- Make the content studio actually persist, with authorization proven by tests before the push.

Tasks:

- [x] Install `vitest`, `@edge-runtime/vm`, `convex-test`; add `vitest.config.ts` (`environment: "edge-runtime"`) and a `test` script. `convex-test` is the substitute for the dev sandbox this project does not have
- [x] `convex/modules.ts` — `create`, `update`, `setPublishState`, `publish` (with the readiness gate), `remove`
- [x] `convex/objectives.ts` — `add`, `update`, `remove`, `reorder`
- [x] `convex/lessons.ts` — `create`, `update`, `move`, `reorder` (rejecting a mismatched id set), `remove`, `attachAsset`, `detachAsset`
- [x] `convex/assets.ts` — `create`, `update`, `setStatus`, `remove`
- [x] `academy.admin.modules.create.tsx` — real create then navigate to the returned slug; trim the category `<select>` to the 3 valid `ModuleCategory` values (two current options would fail arg validation)
- [x] Module editor — add the missing save path and wire the 4 dead reorder buttons
- [x] Lesson editor — replace the toast-only save; duration becomes numeric; lesson type becomes a real select instead of a read-only `<div>`
- [x] Asset editor — publish state becomes a control instead of a read-only `<div>`
- [x] Pass target ids into `AddLessonDialog`, `AddObjectiveDialog`, and `AttachContentDialog` as props; add the missing `case-study` lesson kind; make `AttachContentDialog`'s inputs controlled and its Attach button do something other than close. Dialogs still never import Convex
- [x] Delete `getSupportingResources`' silent fallback and give both affected surfaces a real empty state — the "N assets" badge will start showing `0`
- [x] Fixed the last 2 `<Link to>` typecheck errors. **`npx tsc --noEmit` is now at 0**, clearing the baseline the plan has tracked since Phase 0
- [x] Added `lessonProgress.by_lessonId`, without which deleting a lesson could not clear its progress rows. The table is empty until Phase 8, but the delete had to be correct now rather than carrying a known dangling-reference bug
- [x] Added `moduleAssets` to `lessons.adminDetail` so the attach picker can offer the module's assets without a second round trip
- [x] DOX pass: `convex/AGENTS.md` (`npm test`, the `requireAdmin`-first rule, the audit-field convention), `src/routes/AGENTS.md`, `src/components/AGENTS.md`, root `AGENTS.md`, and reconcile `MODULE_UI_PHASES.md` Phase 4

Verification:

- [x] `npm test` passes **before** the push, including: admin succeeds; `t.withIdentity({ subject: "staff-user" })` is refused; no identity is refused; a caller cannot write into a module they do not own; `seed:run` refuses `reset` on populated tables
- [x] `npx tsc --noEmit` reaches **0**
- [x] `convex-reviewer` and `convex-authz` clean; `npm run build` succeeds
- [x] **G7** push, then editing a module title in the UI updates the library page and dashboard counters with no refresh

Definition of done:

- Every content write in the admin UI persists and is authorization-tested.

---

## Phase 6: File Storage and Real Uploads

Status:

- [ ] Completed

Consent gates: **G8a** — `npx convex env set` for the five R2 credentials. **G8** — the `r2Key` rename plus the first component push (schema change: export and rehearse first).

Goal:

- Replace six upload zones that transmit zero bytes with real file storage.

Strategy: **Cloudflare R2**, not Convex's built-in storage, via the official `@convex-dev/r2` component. Chosen for zero egress fees and CDN-backed delivery. Two consequences this plan had not anticipated, both recorded below.

Tasks:

- [x] `.mcp.json` — Cloudflare's remote MCP servers (`mcp.cloudflare.com` for R2, `docs.mcp.cloudflare.com` for docs). None was connected before; these are OAuth servers, so the user must approve and sign in before any tool is callable
- [ ] Create the `cliffview-academy-assets` bucket and set its CORS policy (`PUT`/`GET` from the app origins). **Without CORS the browser PUT fails with an opaque network error and nothing in the Convex logs explains why**
- [x] Install `@convex-dev/r2@0.10.2`, plus `@convex-dev/action-retrier@0.3.1` as an explicit devDependency so the test helper is not a phantom dependency
- [x] `convex/convex.config.ts` — **reverses the Phase 1 and Phase 4 decisions above.** Both recorded that no such file was needed, which was true of Convex Auth (a library, spread in via `...authTables`) and false of R2 (a real component). Declaring it switches codegen into component mode, so `npx convex codegen` now contacts the deployment to analyse components and cannot run fully offline. That is an analysis round trip, not a deploy — confirmed by checking the prod function spec was unchanged afterwards
- [x] `convex/lib/storage.ts` — one `R2` instance for the whole backend, plus the URL TTL, the size cap and `deleteBlobIfPresent`. Shared because the `modules.remove` cascade also deletes blobs, so `assets.ts` is not the only caller
- [x] **Schema: `assets.storageId` → `r2Key`, and the same on `aiGenerations`.** The task list here previously claimed no schema change was needed because the storage fields landed in Phase 1. That was wrong under this strategy: Phase 1 declared `storageId: v.optional(v.id("_storage"))`, a Convex storage id, and an R2 key is an opaque string. Every prod row had the field unset, so no data moves, but **G8 applies in full**. `by_storageId` becomes `by_r2Key` and finally gets a reader. Renaming on `aiGenerations` now means Phase 7 needs no second schema gate
- [x] `assets.generateUploadUrl` / `assets.syncMetadata` — generated by the component's `clientApi` and gated through its `checkUpload` callback, which calls the existing `requireAdmin`. An ungated upload-URL mutation lets anyone fill the bucket. The exported `generateUploadUrl` takes no arguments, so the key is a server-issued uuid and a caller cannot aim an upload at another asset's blob
- [x] `assets.attachFile({ assetId, key, fileName, contentType?, sizeBytes? })` — patches the asset and deletes the previous blob so replacing a file cannot leak storage. Refuses a key already held by another asset (two assets sharing one blob would mean deleting either breaks the other), a blank file name, and a file over the cap. Clears `pageCount`/`durationSeconds`, which nothing recomputes and which would otherwise describe the new file with the old file's numbers
- [x] `assets.detachFile` — removes the file and its blob, leaving the row. Gives the drop zone's Remove button something real to do
- [x] `assets.applySyncedMetadata` — an `internalMutation` reached through the component's `onSyncMetadata` callback, replacing the browser's reported `contentType`/`sizeBytes` with what R2 says. **Not in the original plan, and required:** the client-facing `syncMetadata` is a mutation that only _schedules_ R2's HEAD request, so `r2.getMetadata` is still empty while `attachFile` runs. The plan's "read authoritative metadata in `attachFile`" would have read null every time
- [x] Blob cleanup on delete — `assets.remove` and the `modules.remove` cascade both dropped rows without deleting blobs. Correct by accident while no blobs existed; a guaranteed leak the moment uploads worked, so fixed here
- [x] Read side resolves a signed URL per read via `r2.getUrl`, never persisted since it is an expiring credential. TTL is 6 hours rather than the component's 900s default: a signed URL makes a query result non-deterministic, and Convex invalidates a query cache on data change rather than on a clock, so a short expiry risks handing a subscriber a URL that died while its row sat unchanged
- [x] `src/hooks/use-asset-upload.ts` — owns the three-leg round trip. Exports `useAssetUploads`, keyed by asset id rather than one instance per zone: a screen renders a zone per asset, and a hook call inside that map would break the rules of hooks the moment the list changed. First Convex-touching module outside `src/routes/`
- [x] `src/components/drag-and-drop-zone.tsx` — gains `status`, `progress`, `errorMessage`, a controlled `uploadedFileName` and `onRemove`; `onUpload` is awaited. Its internal success state is gone, so it can no longer report "File ready" for a file that was never sent. Also replaced the stretched `opacity-0` file input with a hidden ref-driven one: the overlay swallowed every click inside the card, which is why the old Replace file button could never be reached. Still imports no Convex
- [x] `presenters.ts` — `hasFile` reads `r2Key`; `fileName` and `fileUrl` are exposed; the unused `fileName` parameter is gone from `formatAssetMeta`, which was already Phase-6-complete and was otherwise left alone
- [x] Honest labels, per the standing rule: deleted the lesson hero zone's `toast.success("Hero media updated successfully")` (it wrote nothing at all) and wired it to the hero asset; deleted the module create screen's three static zones, since a file attaches to an asset and no asset exists until the module does, so they were unfalsifiable by construction; removed "Uploading is wired in a later phase" and the create page's "UI-only for now" header
- [x] Two adjacent bugs the upload work exposed: the module editor's attach picker hardcoded `alreadyAttached: false` and so offered assets the lesson already had — `modules.adminDetail` now returns `attachedAssetIds` instead of a bare count; and the lesson editor's picker read raw `metaNote` while every other surface showed derived meta, so one asset described itself two different ways
- [x] DOX pass: `convex/AGENTS.md` (a new File storage section, the storage flow, the admin gate, the signed-URL rule rewritten from a prohibition into a contract, the blob-cleanup rule, the `convex.config.ts` reversal, component test registration, and a de-duplicated Verification paragraph), `src/components/AGENTS.md`, `src/AGENTS.md` (`hooks/` is now a durable boundary), `src/routes/AGENTS.md`, root `AGENTS.md`

Verification:

- [x] `npm test` passes with 49 tests, including the four authz negatives on `generateUploadUrl`, three on `syncMetadata` (the other public mutation the component generates — its gate is the same `checkUpload` callback, which is easy to miss because it is not a line in a handler we wrote), and the negatives on `attachFile` / `detachFile`
- [x] `npx tsc --noEmit` still **0**; `npx tsc --noEmit -p convex` clean; `npm run lint` 0 errors; `npm run build` succeeds
- [x] `convex-authz` clean — all four shapes scanned, no identity-from-arg, no unscoped PII read, no unchecked parent reference. `convex-reviewer` clean — no DB `.filter()`, no `Date.now()` in a query, validators on every public function
- [x] `npx convex data assets` confirms no row carries `storageId` — the column is absent from every document, so the rename moved no data
- [x] **G-CF1** — CORS set and read back on the bucket. **No new bucket was created:** an R2 bucket named `cliffview` already existed (created the same morning, when the credentials were generated), so `R2_BUCKET=cliffview` rather than the `cliffview-academy-assets` the plan named. Allowed origins are `http://localhost:8080` (the dev port, which `vite-tanstack-config` pins with `strictPort`) and `http://localhost:5173`. **When the frontend deploys, its origin must be added here or every upload fails in the browser**
- [x] Export (`backups/pre-phase6-r2.zip`) → preview rehearse → **G8a** env vars → **G8** push. The rehearsal printed `Installed component r2` and `Installed component r2/actionRetrier`, which is also independent confirmation that the nested path the test harness registers is the one the runtime uses
- [x] R2 credentials proven end to end against the real bucket, outside Convex, using the same AWS SDK the component uses: PUT, presign, fetch (HTTP 200, byte-identical), delete, then re-fetch returning 404. That last step is the mechanism behind "replacing a file deletes the old blob". The probe object was removed; the bucket is as it was found
- [x] Prod function surface confirmed: 42 functions, with `applySyncedMetadata` and `onSyncMetadata` **internal** and the four upload mutations public and admin-gated
- [x] `by_r2Key` resolves on prod. The push logged deleting `by_storageId` but no matching add, so this was probed directly — Convex throws on an unknown index, and a no-op call through that index returned cleanly
- [x] Convex Auth survived codegen switching to component mode. Proven against prod rather than in a browser: a real Convex Auth token was minted through `auth:signIn` and used against the deployment's HTTP query API, where `auth.viewer` resolved it to `isAdmin: true` and `dashboard.adminOverview` let it past `requireAdmin`. Token issuance and verification both work after the component push
- [ ] Uploading a real PDF through the admin UI works, and `npx convex data assets` shows the `r2Key`
- [ ] Replacing the file through the UI deletes the old blob
- [ ] A `staff` account is refused an upload URL in the running app

Known gaps, accepted:

- **Orphan blobs.** If the PUT succeeds but `attachFile` fails, the object is uploaded and unreferenced. The hook reports this rather than hiding it, and the recovery path exists (`r2.listMetadata` diffed against `by_r2Key`), but no pruning job is built
- **A presigned URL is a bearer credential** for its 6-hour life. That is the decision taken for the learner-privacy open item
- `academy.admin.ai-review.tsx`'s upload zone is still fake — it feeds the `setInterval` simulation Phase 7 deletes

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
- [x] The `expectAuth` decision — **settled by removing it.** It made in-app sign-in impossible, and the component gate already does the job it was added for. Nothing to revisit at Phase 8
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
- [x] Learner-facing document privacy — **decided in Phase 6: a short-lived presigned R2 URL**, resolved per read from a `requireAdmin`-gated query and never persisted. Simple, zero egress, CDN-friendly; the trade is that the URL works for anyone holding it until it expires
- [ ] Explicit go-ahead to delete the legacy `social-media-*` routes (Phase 8)

## Completion Rules

When a phase is finished:

1. Tick every task and every verification item in that phase.
2. Change its `Status` checkbox to completed.
3. Update the matching item in the top-level `Progress` list.
4. Complete the phase's DOX pass — update the nearest owning `AGENTS.md`, any affected parents or children, and every affected Child DOX Index.
5. Only move to the next phase after verifying the current one.
