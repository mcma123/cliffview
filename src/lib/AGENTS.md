# src/lib

## Purpose

Framework-adjacent utilities: class merging, server-only config, the SSR error-reporting mechanism, and the server-function reference pattern.

## Ownership

- Owns `utils.ts`, `config.server.ts`, `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`, and `api/example.functions.ts`
- Owns the server-function convention for the whole project
- Does not own `src/server.ts`, which consumes this layer but is owned by `src/AGENTS.md`

## Local Contracts

- There is no auth module here. Convex Auth needs none: the server config lives in `convex/auth.ts` and `convex/auth.config.ts`, its HTTP endpoints are served from the deployment's `.site` domain via `convex/http.ts`, and the client hooks (`useAuthActions`, `useConvexAuth`) come straight from `@convex-dev/auth/react`. Do not add an `/api/auth/*` route or an auth client wrapper — the browser talks to Convex directly

- `utils.ts` exports `cn()` (clsx + tailwind-merge) and stays dependency-light. Do not grow it into a grab-bag
- `config.server.ts` is server-only by virtue of the `.server.ts` suffix. Read `process.env` inside `getServerConfig()`, never at module scope — on Cloudflare Workers env binds at request time and module-scope reads are `undefined`. Secrets go here; anything named `VITE_*` is public and ships to the browser
- Never import the Next.js `server-only` package; ESLint's `no-restricted-imports` rule blocks it with the correct alternative
- The 500-page path is one mechanism across three files — change one and check the other two:
  - `error-capture.ts` records the last error out-of-band with a 5s TTL via global `error` / `unhandledrejection` listeners
  - `error-page.ts` exports `renderErrorPage()`, the static HTML body
  - `src/server.ts` detects h3-swallowed `{"unhandled":true,"message":"HTTPError"}` 500 responses and re-renders that page, logging the captured error
- `lovable-error-reporting.ts` calls `window.__lovableEvents.captureException` when present and must stay a silent no-op when absent. It is called from the root `errorComponent`
- `api/example.functions.ts` is the reference pattern for server logic: `createServerFn` + `.inputValidator(zod schema)` + `.handler`. Use this instead of introducing a separate API layer or edge functions. Module-level code in these files still ships to the client — server-only helpers belong in a `.server.ts` module

- `staff-import.ts` is the app's **only import path**, the mirror of `csv.ts`'s only-export-path rule. It reads a roster out of a `.csv` or `.xlsx` and decides nothing about whether those rows may become people — that judgement is `convex/lib/staffImport.ts`, server-side, so the preview an admin approves and the import that runs cannot disagree. The CSV reader is hand-rolled RFC 4180 rather than a dependency; it strips the `﻿` BOM that `downloadCsv` itself writes, or a round-tripped template comes back with a first header of `﻿Email` and matches nothing
- `.xlsx` needs `read-excel-file`, and two things about it differ from its own older documentation. It publishes **no `"."` export** — only `/browser`, `/node`, `/universal`, `/web-worker` — so the bare name fails to resolve at build time. And since v9 the **default export returns the list of sheets**; `readSheet` is what returns rows. It is imported dynamically so its unzipper and XML parser stay in a 63 KB lazy chunk instead of the bundle every admin loads to look at the staff list
- It replaces the more obvious `xlsx` (SheetJS), whose npm package has been frozen at `0.18.5` since **March 2022** — SheetJS stopped publishing there
- `readStaffFile` is the **first client-side file-content read in the codebase**; everything else hands an opaque `File` to R2 without looking inside it. Keep the impure edge there and the parsing pure, since `vitest.config.ts` runs `src/lib/**` under `edge-runtime` with no DOM

## Work Guidance

- Put real server functions alongside `api/example.functions.ts` following its shape; keep the example file as documentation
- Anything reusable and UI-specific belongs in `src/components` or `src/hooks`, not here

## Verification

From the repo root: `npx tsc --noEmit` and `npm run lint`. For the error path, confirm a thrown SSR error still renders the 500 page rather than raw JSON.

## Child DOX Index

No children.

- `csv.ts` is the app's **only** export path — the one way data leaves as a file. `toCsv` quotes per RFC 4180, and that quoting is the whole job: an unquoted comma in a module title does not error, it shifts every column after it and still opens cleanly in Excel, which is a corrupted report that looks correct. `null` is an empty field, never `0` — it means "not applicable", and a zero would assert a failing score nobody earned. `downloadCsv` prefixes a UTF-8 BOM so Excel does not mojibake accented names, and revokes the object URL, without which every export leaks its blob for the life of the tab. It is the first module in `src/` with tests; `vitest.config.ts` includes `src/lib/**` for pure helpers only
- `staff-identifier.ts` resolves what someone types in a sign-in box to an email. There is no username column and there deliberately isn't one: the `Password` provider keys accounts on email and `createOrUpdateUser` looks people up by `users.email`, so a real username field would mean a second lookup path and a second uniqueness invariant over the same table. Anything without an `@` gets `CLIFFVIEW_EMAIL_DOMAIN` appended, so `admin` signs in as `admin@cliffview.example`
- `CLIFFVIEW_EMAIL_DOMAIN` is a **bare-username convenience for the admin console and nothing else**. It has exactly one caller, and a full address on any domain — personal, school, anything — has always signed in untouched (`convex/invites.test.ts` pins this). It does not gate invitations, deliverability or sign-in; reading it as a production blocker is a mistake that has already been made once. What it does do: `CLIFFVIEW_EMAIL_DOMAIN` must match the domain on the seeded `users` rows. Change it and the seed together, or every bare username resolves to an address that is not provisioned and sign-in fails with `NOT_PROVISIONED`
