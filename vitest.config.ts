import { defineConfig } from "vitest/config";

/**
 * Test config for the Convex backend.
 *
 * `convex-test` runs functions against an in-memory Convex, which is this
 * project's substitute for a dev deployment: production is the only real
 * deployment, so authorization is the one thing that cannot be verified by
 * clicking around. Every mutation ships with the four authz negatives.
 *
 * The `edge-runtime` environment matches the Convex runtime that queries and
 * mutations actually execute in, so a test that passes here is not passing
 * under Node semantics the deployment does not have.
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: {
      deps: {
        // convex-test loads the function modules through Vite; inlining Convex
        // keeps a single copy of its runtime in play.
        inline: ["convex-test"],
      },
    },
  },
});
