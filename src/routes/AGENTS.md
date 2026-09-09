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
- Migrated so far: all five admin content and overview routes (`admin.index`, `admin.modules.index`, `admin.modules.$moduleSlug.index`, `...lessons.$lessonId`, `...assets.$assetId`). Still on the container: staff and AI review (Phase 7), and every learner route (Phase 8)
- Components still never fetch. Only a route component may call `useSuspenseQuery`; `src/components` stays prop-driven and imports no Convex
- Each page mounts its own shell: `StaffShell` for learner pages, `AdminShell` for `/academy/admin/*`. The pathless layout files (`academy.admin.tsx`, `academy.admin.modules.tsx`, `academy.admin.staff.tsx`, `academy.modules.tsx`, `academy.modules.$moduleSlug.tsx`) are minimal `<Outlet />` pass-throughs — keep them that way unless you move shells into them, which is a cross-route change
- `index.tsx` redirects `/` to `/academy/sign-in` in `beforeLoad`. Sign-in is real: it submits to Convex Auth via `useAuthActions().signIn("password", formData)` with a `flow` of `signIn` or `signUp`, and surfaces the server's refusal messages
- **`academy.admin.tsx` is the admin gate, and is the one documented exception to the layout-pass-through rule.** One check there protects every current and future `/academy/admin/*` screen. It is a component gate, not a `beforeLoad` redirect, because Convex Auth keeps its token in `localStorage`: there is no identity on the server, so a server-side check would refuse everyone. Do not add a second gate per route, and do not reduce this file back to an `<Outlet />`
- Admin screens are therefore **client-rendered** and must not prefetch in their loaders. A gated query prefetched on the server is held forever, because `expectAuth` is on and no token exists there. Loaders may return only request-local values such as `now`. Admin pages sit behind a login and gain nothing from SSR
- The gate is defence in depth, never the defence itself: every admin query and mutation calls `requireAdmin` server-side
- `<Link to=...>` is type-checked against the generated route tree. Dynamic targets must use `to="/academy/modules/$moduleSlug"` with `params`, not an interpolated string. Four pre-existing violations in `academy.admin.modules.create.tsx` and `academy.admin.modules.index.tsx` are in the root known-failure baseline — fix them if you touch those files
- Admin content edits persist. Route components call `useConvexMutation` wrapped in TanStack `useMutation`, and surface the server's message on failure rather than a generic toast — the refusals from `convex/` carry text meant for the admin
- Drag-and-drop zones are still placeholders until file storage lands; the move controls next to them are real. Keep labels honest about which is which
- Never claim success before the mutation resolves. The old pages toasted "saved" and navigated away without writing anything
- Known duplication: `academy.modules.social-media-awareness.tsx` and `academy.modules.social-media.{assessment,section-3,complete}.tsx` predate the generic `$moduleSlug` routes and overlap them. Build new work on the generic routes; remove the legacy files only with the user's go-ahead

## Work Guidance

- New page: add the route file, run `npm run dev` once so the plugin regenerates `routeTree.gen.ts`, then add navigation via the `nav` array in the relevant shell
- Add the corresponding use case in `src/application` and register it in the container before writing the page
- Keep components presentational; if markup is used by more than one route, move it to `src/components`

## Verification

From the repo root: `npx tsc --noEmit` (catches invalid `Link to` targets and loader-data drift), `npm run lint`, `npm run build`.

## Child DOX Index

No children.
