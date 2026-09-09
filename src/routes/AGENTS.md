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
- Loaders call `academyQueries` from `@/infrastructure/academy/container` only. No fetching or data assembly inside components; read with `Route.useLoaderData()`
- Each page mounts its own shell: `StaffShell` for learner pages, `AdminShell` for `/academy/admin/*`. The pathless layout files (`academy.admin.tsx`, `academy.admin.modules.tsx`, `academy.admin.staff.tsx`, `academy.modules.tsx`, `academy.modules.$moduleSlug.tsx`) are minimal `<Outlet />` pass-throughs — keep them that way unless you move shells into them, which is a cross-route change
- `index.tsx` redirects `/` to `/academy/sign-in` in `beforeLoad`. Sign-in is UI only: there is no auth and no route is protected. Do not write copy implying a session exists
- `<Link to=...>` is type-checked against the generated route tree. Dynamic targets must use `to="/academy/modules/$moduleSlug"` with `params`, not an interpolated string. Four pre-existing violations in `academy.admin.modules.create.tsx` and `academy.admin.modules.index.tsx` are in the root known-failure baseline — fix them if you touch those files
- Admin dialogs and drag-and-drop zones are local-state placeholders; nothing persists. Keep their labels honest about that
- Known duplication: `academy.modules.social-media-awareness.tsx` and `academy.modules.social-media.{assessment,section-3,complete}.tsx` predate the generic `$moduleSlug` routes and overlap them. Build new work on the generic routes; remove the legacy files only with the user's go-ahead

## Work Guidance

- New page: add the route file, run `npm run dev` once so the plugin regenerates `routeTree.gen.ts`, then add navigation via the `nav` array in the relevant shell
- Add the corresponding use case in `src/application` and register it in the container before writing the page
- Keep components presentational; if markup is used by more than one route, move it to `src/components`

## Verification

From the repo root: `npx tsc --noEmit` (catches invalid `Link to` targets and loader-data drift), `npm run lint`, `npm run build`.

## Child DOX Index

No children.
