# src

## Purpose

All application source for the Cliffview Academy portal: the four Clean Architecture layers, the app entry points, and the design system tokens.

## Ownership

- Owns cross-layer source rules, the dependency rule, import conventions, and the app entry points listed below
- Layer children own their internal contracts
- Repo tooling, verification commands, and the known-failure baseline stay in the root AGENTS.md

## Local Contracts

- Dependency rule, outermost to innermost: `routes` and `components` -> `infrastructure/academy/container` -> `application` -> `domain`. Source dependencies point inward only
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
- `hooks/` — `use-mobile.tsx` only (768px breakpoint). No child doc; add one if this becomes a durable boundary

## Work Guidance

- Page data flow: route `loader` calls `academyQueries.*`, component reads `Route.useLoaderData()`. Keep label text, formatting, and href construction in `application`, not in components
- The repository port is synchronous. Making it async is a cross-layer change touching `domain`, `application`, `infrastructure`, and every route loader — do it in one pass, not piecemeal
- `QueryClientProvider` is mounted in `routes/__root.tsx`, but routes currently load through TanStack Router loaders rather than TanStack Query. Pick one per feature and say which in the route doc

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
