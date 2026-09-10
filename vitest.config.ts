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
    /**
     * The R2 component reads its credentials from `process.env` in its
     * constructor, which runs when `convex/lib/storage.ts` is first imported.
     * Set here rather than in a test file so the values exist before any module
     * loads.
     *
     * Deliberately fake. Presigning a URL is local HMAC work with no network
     * call, so `generateUploadUrl` and `getUrl` are fully testable offline; only
     * an actual transfer would need real credentials, and no test performs one.
     */
    env: {
      R2_BUCKET: "cliffview-test-bucket",
      R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "test-access-key-id",
      R2_SECRET_ACCESS_KEY: "test-secret-access-key",
    },
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
