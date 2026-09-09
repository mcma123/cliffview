# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## Project

Cliffview Academy Hub — staff training and compliance portal for Cliffview Primary (CPTD points, GDE/SASA/BELA-aligned). Two personas share one route tree: staff learners and SMT admins.

- Stack: TanStack Start (SSR, file-based routing), React 19, Tailwind v4, shadcn/ui on Radix, TanStack Query, Zod
- Build: Vite via `@lovable.dev/vite-tanstack-config`; Nitro output preset is `vercel` when `VERCEL` is set, otherwise `node-server`
- Backend: Convex (`convex@^1.45.0`), live on the **production** deployment `diligent-mink-756` with 18 tables seeded and the admin content reads wired into the React app. See `convex/AGENTS.md` for the deployment and consent contract, `ADMIN_BACKEND.md` for the build phases
- No auth yet (Phase 4) and no write path yet (Phase 5): sign-in and every admin write dialog are still UI-only. Admin content screens read from Convex; the admin overview, staff, AI review and all learner routes still read the in-memory seed in `src/infrastructure/academy/in-memory-academy-repository.ts`, which is deleted at Phase 8
- Architecture is Clean Architecture; the dependency rule is enforced by convention, documented in `src/AGENTS.md`. Reference material: `clean-architecture-expert/SKILL.md`

## Repo-Wide Rules

- Package manager is Bun (`bun.lock`, `bunfig.toml`); npm scripts work too. `bunfig.toml` sets a 24h `minimumReleaseAge` supply-chain guard — confirm with the user before adding a `minimumReleaseAgeExcludes` entry
- Never edit `src/routeTree.gen.ts` — generated by the router plugin, gitignored and prettier-ignored
- Never edit `dist/`, `.output/`, `.tanstack/`, or `node_modules/`
- `public/` holds only brand assets referenced from `src/routes/__root.tsx` (`favicon.jpg`, `logo.jpg`, `og-image.svg`). Keep filenames stable or update the head config
- Convex commands run against production. Announce the target before any deployment-affecting command and get a fresh explicit yes in the current session before anything that writes to prod. Full rules in `convex/AGENTS.md`
- Never write to `.env.local` without saying what changes; it is gitignored via `*.local`
- Do not commit unless the user asks
- `MODULE_UI_PHASES.md` tracks phased UI work and its own completion rules. Phases 1-3 are done; Phase 4 (final integration and verification) is open. Update its checkboxes when you finish a phase
- `ADMIN_BACKEND.md` tracks the phased Convex admin-backend build (Phases 0-8, one consent gate per prod-affecting step) and carries the locked architecture decisions. It is the execution contract for that work: tick tasks and verification items as you go, and complete each phase's DOX pass before checking the phase off

## Verification

Run from the repo root:

- `npm run format` — Prettier write; run it before lint
- `npm run lint` — ESLint with `prettier/prettier` as an error rule
- `npm run typecheck` — `tsc --noEmit` over `src/`
- `npm run typecheck:convex` — `tsc --noEmit -p convex` over the backend; the root config does not cover `convex/`, so run both
- `npm run build` — Vite/Nitro production build

Known baseline, pre-existing and not caused by new work:

- `npm run typecheck` reports **4** errors in `src/routes/academy.admin.modules.create.tsx` and `src/routes/academy.admin.modules.index.tsx`: hardcoded `<Link to="/academy/modules/parent-communication-protocol">` strings are not valid typed routes and need `to="/academy/modules/$moduleSlug"` with `params`. `ADMIN_BACKEND.md` drives this to 2 in Phase 3 and 0 in Phase 5 — any error beyond that count is new
- `npm run lint` is **clean** (0 errors). It reports 6 `react-refresh/only-export-components` warnings from files that export a constant alongside a component; these are warnings, not errors
- `.prettierrc` sets `"endOfLine": "auto"` so Prettier preserves this Windows checkout's CRLF endings instead of reporting every line as an error

When verification fails, report whether the failure is in this baseline or newly introduced.

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

- Analyse and understand the codebase before proposing or making changes
- Do file reads, searches, and edits through shell commands (`cat`, `sed -n`, `grep`, heredocs) rather than dedicated file tools while auto mode is active
- Work against the Convex production deployment `diligent-mink-756`, not a dev deployment. Requested 2026-09-09

## Child DOX Index

- `src/AGENTS.md` — all application source: layer boundaries, the Clean Architecture dependency rule, app entry points, design tokens, and the layer child docs
- `convex/AGENTS.md` — Convex backend: the production-target contract, prod consent rules, CLI workflow, and codegen boundaries

Owned by root, no child doc: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `bunfig.toml`, `components.json`, `MODULE_UI_PHASES.md`, `ADMIN_BACKEND.md`, `public/`, `clean-architecture-expert/`

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
