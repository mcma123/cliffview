# src/infrastructure

## Purpose

Adapters and composition. One file: the Convex client factory the router builds its query client from.

## Ownership

- Owns `convex/client.ts` — the `ConvexQueryClient` + `QueryClient` factory. One set per router instance, never module-scope: an auth token is per-request state and must not leak between SSR requests
- **Never set `expectAuth: true` on that client.** It holds back queries, mutations _and_ actions until the first token is sent, and the client starts paused; only `client.setAuth` resumes it, and `ConvexProviderWithAuth` calls that only once it already believes you are authenticated. Signed out, the socket never resumes and `auth:signIn` — an action — is held back with it, so signing in becomes impossible. It shipped in Phase 4 and froze the sign-in button on "Signing in…" with no error and no server log, because no request left the browser
- Owns nothing about view-model shape; that is `src/application`

## Local Contracts

- **Convex is the port. There is no repository in front of it.** The generated `api` plus `Doc<>`/`Id<>` are the interface, and route loaders and route components call it directly. See `ADMIN_BACKEND.md` for the decision and `src/routes/AGENTS.md` for the pattern
- Convex client construction belongs in this layer. Route components then talk to the typed API directly; shared components in `src/components` still never import Convex

## History

This layer used to hold two more files, deleted once the last caller went:

- `academy/container.ts` — a dependency-injection container exposing `academyQueries` / `academyCommands`
- `academy/in-memory-academy-repository.ts` — 664 lines of seeded module, staff and dashboard data that the app served before the backend existed

They survived the migration because the AI review screen still read `getAiReviewQueue()` from them. That screen now reads `api.aiReviewQueue.queue`, which left both files with zero callers, so they went. The seed data they carried lives on in `convex/seed/data.ts`, which was always a deliberate copy and is now simply the only one — the duplication warning that used to sit here is resolved.

## Work Guidance

- Anything that needs data goes through Convex. Do not reintroduce a repository abstraction in front of it

## Verification

From the repo root: `npx tsc --noEmit`, `npm run lint`.

## Child DOX Index

No children.
