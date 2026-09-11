# Cliffview Academy frontend.
#
# This app is TanStack Start on Nitro (`NITRO_PRESET=node-server`), so a build
# produces `.output/server/index.mjs` — a Node SSR server — and NOT a folder of
# static files. Serving it with a static file server is the one way to get a
# 404 on every route while the build itself reports success: `npm run build`
# writes `dist/client` and `dist/server`, neither of which has an `index.html`
# at the root a static server would look in.
#
# That is exactly what Nixpacks auto-detection did here. This Dockerfile exists
# to take the choice away from a heuristic and state it outright.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# VITE_* values are INLINED INTO THE CLIENT BUNDLE at build time — they are not
# read from the environment when the server starts. Setting them only as
# runtime variables silently produces a bundle with no backend URL in it, which
# looks like a working deploy and fails in the browser. They must be build args.
ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL

# `vite.config.ts` falls back to the cloudflare preset unless told otherwise.
ENV NITRO_PRESET=node-server

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `convex/_generated` is committed, so the build needs no Convex network access
# and no deploy key — it is a pure client/server bundle step.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Nitro's node-server reads both. HOST must be 0.0.0.0, not the default
# loopback, or the container answers only itself and the proxy sees a
# connection refused.
ENV HOST=0.0.0.0
ENV PORT=3000

# Nitro bundles its own dependencies into .output, so there is no second
# `npm install` here and no node_modules to copy.
COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
