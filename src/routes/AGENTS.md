# src/routes

## Purpose

TanStack Start file-based routes for both surfaces: the staff learner portal at `/academy/*` and the SMT admin console at `/academy/admin/*`.

## Ownership

- Owns route definitions, page titles, loader wiring, and per-page composition
- Owns `__root.tsx`: head/meta and social cards, `QueryClientProvider`, `Toaster`, `NotFoundComponent`, `ErrorComponent`
- Does not own data shaping (`src/application`) or presentational markup that is reused (`src/components`)

## Local Contracts

- Flat dot-notation filenames map to URL segments; `$param` is a dynamic segment; `.index` is an index route. `routeTree.gen.ts` is generated — never hand-edit it
- Standard page shape: `createFileRoute` with `head` (title formatted `Page · Cliffview Academy`), `loader: () => academyQueries.…`, and `component`
- Two data paths, and which one a route uses depends on whether it has been migrated:
  - **Convex (admin routes).** The route component reads with `useSuspenseQuery(convexQuery(api.x.y, args))`, passes the result through a presenter from `@/application/academy/presenters`, and hands plain props to shared components. Queries run on the client only — see the admin-gate rule below — and hold a live subscription, so an edit repaints open pages with no refetch code
  - **Container (everything not yet migrated).** `loader: () => academyQueries.…` plus `Route.useLoaderData()`, exactly as before
- The container path ends at Phase 8, which deletes it. Until then do not add new routes on it
- Learner routes now read Convex too: `academy.dashboard`, `academy.modules.index`, `academy.modules.$moduleSlug.index` and `academy.modules.$moduleSlug.lesson.$lessonId` use `useQuery(convexQuery(api.learn.*))` behind `useStaffViewer()`. They use `useQuery` rather than `useSuspenseQuery` precisely so the query can be held with `enabled` until the token is restored — a `requireStaff` query fired before that throws UNAUTHENTICATED at somebody who is in fact signed in. `academy.profile` and `academy.leaderboard` now read `api.learn.profile` and `api.learn.leaderboard` the same way
- Migrated so far: the five admin content and overview routes (`admin.index`, `admin.modules.index`, `admin.modules.$moduleSlug.index`, `...lessons.$lessonId`, `...assets.$assetId`) plus both staff routes (`admin.staff.index`, `admin.staff.$staffId`). Still on the container: AI review (Phase 7) and every learner route (Phase 8)
- Components still never fetch. Only a route component may call `useSuspenseQuery`; `src/components` stays prop-driven and imports no Convex
- Each page mounts its own shell: `StaffShell` for learner pages, `AdminShell` for `/academy/admin/*`. The pathless layout files (`academy.admin.tsx`, `academy.admin.modules.tsx`, `academy.admin.staff.tsx`, `academy.modules.tsx`, `academy.modules.$moduleSlug.tsx`) are minimal `<Outlet />` pass-throughs — keep them that way unless you move shells into them, which is a cross-route change
- `index.tsx` redirects `/` to `/academy/sign-in` in `beforeLoad`. Sign-in is real: it submits to Convex Auth via `useAuthActions().signIn("password", formData)` with a `flow` of `signIn` or `signUp`, and surfaces the server's refusal messages
- **`academy.admin.tsx` is the admin gate, and is the one documented exception to the layout-pass-through rule.** One check there protects every current and future `/academy/admin/*` screen. It is a component gate, not a `beforeLoad` redirect, because Convex Auth keeps its token in `localStorage`: there is no identity on the server, so a server-side check would refuse everyone. Do not add a second gate per route, and do not reduce this file back to an `<Outlet />`
- Admin screens are therefore **client-rendered** and must not prefetch in their loaders: there is no identity on the server, so a prefetched gated query would throw `UNAUTHENTICATED`. Loaders may return only request-local values such as `now`. Admin pages sit behind a login and gain nothing from SSR. (This used to say such a query would be _held forever_ because `expectAuth` was on — that flag is gone; see `src/infrastructure/AGENTS.md` for why it must not come back)
- The gate is defence in depth, never the defence itself: every admin query and mutation calls `requireAdmin` server-side. It is also what keeps admin queries from firing without an identity, which is the job `expectAuth` was wrongly given
- `academy.admin_.sign-in.tsx` serves `/academy/admin/sign-in`, and the **trailing underscore on `admin` is load-bearing**. Named `academy.admin.sign-in.tsx` it would nest inside `academy.admin.tsx`, which is the gate, so an unauthenticated visitor would be shown the gate's "Sign in to continue" card instead of the form — and that card's button links to the sign-in page it is standing in front of. The underscore opts the route out of the layout while keeping the URL. Verified by `parentRoute: rootRouteImport` in `routeTree.gen.ts`
- That form's identifier input is `type="text"`, not `type="email"`, because it accepts a bare username. `type="email"` would make the browser reject `admin` before submit
- `<Link to=...>` is type-checked against the generated route tree. Dynamic targets must use `to="/academy/modules/$moduleSlug"` with `params`, not an interpolated string. Four pre-existing violations in `academy.admin.modules.create.tsx` and `academy.admin.modules.index.tsx` are in the root known-failure baseline — fix them if you touch those files
- Admin content edits persist. Route components call `useConvexMutation` wrapped in TanStack `useMutation`, and surface the server's message on failure rather than a generic toast — the refusals from `convex/` carry text meant for the admin
- `academy.admin.modules.$moduleSlug.assessment.tsx` is the question builder, its own route rather than a sixth section in the 618-line module editor, and its own Convex subscription so it does not repaint on a lesson reorder. It reads `api.questions.adminList`; the module editor links to it and shows `questionCount` from `modules.adminDetail`
- Drag-and-drop zones upload real files as of Phase 6. A route calls `useAssetUploads()` once and passes `stateFor(assetId)` into each zone
- Zones exist only where an asset row exists. The module create screen has none: a file attaches to an asset, and no asset exists until the module does, so the three zones that used to sit there were unfalsifiable by construction and were deleted rather than faked
- The lesson hero zone uploads into the lesson's hero asset, and says plainly that none is set when there is none. It used to `toast.success("Hero media updated successfully")` on drop and write nothing at all — the exact failure the rule below exists to prevent
- Never claim success before the mutation resolves. The old pages toasted "saved" and navigated away without writing anything
- The legacy `academy.modules.social-media-*` routes are **gone**, with the user's go-ahead. `social-media-awareness` was the worst of them: it served a real seeded slug, so TanStack preferred it over the generic route and that one module rendered in-memory seed data while every other slug read Convex. Their only shared component, `src/components/academy-module-detail-view.tsx`, went with them. Note what was lost: the assessment page was the only quiz UI in the app, and it wrote nothing. **Real assessments now exist.** A lesson of kind `assessment` renders `AssessmentRunner` instead of the scenario/assets/reflection body, reading `api.learn.assessment` through a second `useQuery` beside `api.learn.lesson` — a separate query because `learn.lesson` mints signed R2 URLs an assessment has no use for. The footer **Mark complete** button is suppressed for those lessons, because passing is what completes them; the server refuses the shortcut too (`learn.recordLessonProgress` throws `USE_ASSESSMENT`), since hiding a button is not a gate on a public mutation. The old page's stepper and A/B/C/D option buttons were lifted for the runner's styling

## Work Guidance

- New page: add the route file, run `npm run dev` once so the plugin regenerates `routeTree.gen.ts`, then add navigation via the `nav` array in the relevant shell
- Add the corresponding use case in `src/application` and register it in the container before writing the page
- Keep components presentational; if markup is used by more than one route, move it to `src/components`

## Verification

From the repo root: `npx tsc --noEmit` (catches invalid `Link to` targets and loader-data drift), `npm run lint`, `npm run build`.

## Child DOX Index

No children.
