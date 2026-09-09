# src/components/ui

## Purpose

The shadcn/ui primitive set (style `new-york`) that every feature component and route builds on.

## Ownership

- Owns the primitives and their variant APIs
- Does not own any academy-specific behavior, copy, or data

## Local Contracts

- Generated code. Add or update primitives with the shadcn CLI rather than hand-authoring; `components.json` at the repo root defines style, base color `slate`, CSS variables, the `lucide` icon library, and the `@/components/ui` alias
- Hand edits are allowed but a later CLI regeneration can overwrite them. Record any intentional divergence in this doc so it survives
- Primitives stay app-agnostic: no imports from `@/domain`, `@/application`, `@/infrastructure`, or feature components. Dependencies point outward from here only to `@/lib/utils` and hooks
- Variants are defined with `class-variance-authority`. Extend an existing variant set rather than adding a one-off wrapper component
- Colors come exclusively from the tokens in `src/styles.css`
- A new primitive that needs a new `@radix-ui/*` package requires an install; the 24h `minimumReleaseAge` guard in `bunfig.toml` applies
- `sonner.tsx` is mounted once in `src/routes/__root.tsx` as `<Toaster position="bottom-right" />`. Do not mount a second toaster
- `sidebar.tsx` ships with the set but is unused — the app uses the custom shells in `src/components`. Do not wire it up without the user's go-ahead

## Work Guidance

- Treat these as a stable dependency surface: when a screen needs different behavior, compose in a feature component instead of forking a primitive

## Verification

From the repo root: `npx tsc --noEmit`, `npm run lint`.

## Child DOX Index

No children.
