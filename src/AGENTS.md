# src

## Purpose

All application source for the Cliffview Academy portal: the four Clean Architecture layers, the app entry points, and the design system tokens.

## Ownership

- Owns cross-layer source rules, the dependency rule, import conventions, and the app entry points listed below
- Layer children own their internal contracts
- Repo tooling, verification commands, and the known-failure baseline stay in the root AGENTS.md

## Local Contracts

- Dependency rule for migrated code: `routes` -> `convex/_generated` (the typed backend API) and `application/academy/presenters` (pure view-model builders). Presenters take data, never a repository
- One deliberate exception: `hooks/use-asset-upload.ts` also imports `convex/_generated`. A hook is allowed to, a component is not. The line is that anything under `components/` must be renderable from props alone
- Dependency rule for code still on the container: `routes` -> `infrastructure/academy/container` -> `application/academy/use-cases` -> `domain`. Source dependencies point inward only
- `domain` imports nothing outside `@/domain`
- `application` imports domain types and the `AcademyRepository` port, nothing else
- `infrastructure` implements the port and wires the container
- UI never imports a repository implementation. The only entry into data is `academyQueries` / `academyCommands` from `@/infrastructure/academy/container`
- Use the `@/*` alias (`tsconfig.json` paths) for cross-folder imports
- Files named `*.server.ts` are stripped from the client bundle. Never import the Next.js `server-only` package — ESLint blocks it; use the `.server.ts` suffix or `@tanstack/react-start/server-only`

Entry points owned here:

- `router.tsx` — `getRouter()` factory; builds a `QueryClient` per router and passes it as route context. Root route context type is `{ queryClient: QueryClient }`
- `start.ts` — `createStart` request middleware; rethrows objects carrying `statusCode`, renders the 500 page for everything else
- `server.ts` — SSR entry override wired via `tanstackStart.server.entry` in `vite.config.ts`. Unwraps h3-swallowed 500s
- `styles.css` — Tailwind v4 `@theme inline` design system. Every color must be `oklch` and declared as a token in both `:root` and `.dark`; register new tokens as `--color-<name>: var(--<name>)`. Brand tokens: `gold`, `gold-soft`, `primary-deep`, `primary-soft`, `success`. The `.dark` block is still the generic slate/blue default and is not brand-aligned; there is no theme toggle
- `routeTree.gen.ts` — generated, never edit
- `hooks/` — `use-mobile.tsx` (768px breakpoint) and `use-asset-upload.ts`. The latter is the **only Convex-touching module outside `routes/`**: it owns the three-leg upload round trip, which would otherwise be copied into every screen with a drop zone. It is keyed by asset id rather than instantiated per zone, because a screen renders a zone per asset and a hook call inside that map would break the rules of hooks the moment the list changed

## Work Guidance

- Page data flow: route `loader` calls `academyQueries.*`, component reads `Route.useLoaderData()`. Keep label text, formatting, and href construction in `application`, not in components
- The repository port is synchronous and is being retired rather than made async. Convex is the port now; `AcademyRepository` survives only for the routes not yet migrated and is deleted at Phase 8
- TanStack Query is now the repo-wide data layer for Convex reads: `src/router.tsx` builds a `ConvexQueryClient`, sets its `hashFn`/`queryFn` as query defaults, and calls `setupRouterSsrQueryIntegration`. `routes/__root.tsx` mounts `ConvexProvider` above `QueryClientProvider`. Both clients are created per router by `src/infrastructure/convex/client.ts` — never module-scope, because an auth token is per-request state

## Verification

From the repo root: `npm run format`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. See the root AGENTS.md for the known-failure baseline.

## Child DOX Index

- `domain/AGENTS.md` — entity types and repository ports; framework-free
- `application/AGENTS.md` — use cases that build view-models from the repository port
- `infrastructure/AGENTS.md` — in-memory seeded repository and the DI container
- `routes/AGENTS.md` — TanStack Start file routes for the staff and admin surfaces
- `components/AGENTS.md` — app shells, feature components, dialogs, brand marks, and the shadcn primitives
- `lib/AGENTS.md` — utilities, server-only config, SSR error plumbing, server-function pattern

Owned by src, no child doc: `router.tsx`, `start.ts`, `server.ts`, `styles.css`, `routeTree.gen.ts`, `hooks/`
