# src/lib

## Purpose

Framework-adjacent utilities: class merging, server-only config, the SSR error-reporting mechanism, and the server-function reference pattern.

## Ownership

- Owns `utils.ts`, `config.server.ts`, `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`, and `api/example.functions.ts`
- Owns the server-function convention for the whole project
- Does not own `src/server.ts`, which consumes this layer but is owned by `src/AGENTS.md`

## Local Contracts

- `utils.ts` exports `cn()` (clsx + tailwind-merge) and stays dependency-light. Do not grow it into a grab-bag
- `config.server.ts` is server-only by virtue of the `.server.ts` suffix. Read `process.env` inside `getServerConfig()`, never at module scope — on Cloudflare Workers env binds at request time and module-scope reads are `undefined`. Secrets go here; anything named `VITE_*` is public and ships to the browser
- Never import the Next.js `server-only` package; ESLint's `no-restricted-imports` rule blocks it with the correct alternative
- The 500-page path is one mechanism across three files — change one and check the other two:
  - `error-capture.ts` records the last error out-of-band with a 5s TTL via global `error` / `unhandledrejection` listeners
  - `error-page.ts` exports `renderErrorPage()`, the static HTML body
  - `src/server.ts` detects h3-swallowed `{"unhandled":true,"message":"HTTPError"}` 500 responses and re-renders that page, logging the captured error
- `lovable-error-reporting.ts` calls `window.__lovableEvents.captureException` when present and must stay a silent no-op when absent. It is called from the root `errorComponent`
- `api/example.functions.ts` is the reference pattern for server logic: `createServerFn` + `.inputValidator(zod schema)` + `.handler`. Use this instead of introducing a separate API layer or edge functions. Module-level code in these files still ships to the client — server-only helpers belong in a `.server.ts` module

## Work Guidance

- Put real server functions alongside `api/example.functions.ts` following its shape; keep the example file as documentation
- Anything reusable and UI-specific belongs in `src/components` or `src/hooks`, not here

## Verification

From the repo root: `npx tsc --noEmit` and `npm run lint`. For the error path, confirm a thrown SSR error still renders the 500 page rather than raw JSON.

## Child DOX Index

No children.
