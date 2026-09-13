import { defineConfig } from "vitest/config";

/**
 * Test config for the Convex backend, plus the pure helpers in `src/lib`.
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
     * Every test builds a fresh in-memory Convex and registers two components
     * (`r2` and the `r2/actionRetrier` nested inside it), which costs real time
     * before a single assertion runs. Vitest's 5s default was enough for two
     * test files and started timing out at five, in whichever file lost the
     * race for a worker — which looked like flaky authz tests and was really
     * just setup exceeding the clock. Raised rather than worked around: the
     * suite is deliberately parallel and takes ~5s in total.
     */
    testTimeout: 60000,
    hookTimeout: 60000,
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

      /**
       * Resend reads these in its constructor too, when `convex/lib/email.ts`
       * is first imported. All fake: nothing in the suite reaches the network.
       *
       * `RESEND_TEST_MODE=false` looks backwards and is not. The component's
       * test mode refuses any recipient that is not an `@resend.dev` address,
       * and every fixture here is a school address, so leaving it on would
       * make the suite throw rather than keep it safe. What actually keeps it
       * offline is that `sendEmail` only *enqueues* — delivery is a workpool
       * action, and no test drains the scheduler.
       */
      RESEND_API_KEY: "re_test_fake_key_never_used",
      RESEND_TEST_MODE: "false",
      /** A distinctive host so an assertion on an invite link is unambiguous. */
      SITE_URL: "https://cliffview.test",

      /**
       * A throwaway RSA pair, generated once for this file and used nowhere
       * else. Convex Auth mints a session JWT on any real `signIn`, so without
       * a key the admin claim-window test fails on missing config rather than
       * on the behaviour it is checking.
       *
       * Safe to commit precisely because it is worthless: it signs tokens for
       * an in-memory database that exists for the length of one test. The real
       * keys live only in deployment env and were generated separately.
       *
       * Note what this does NOT affect: `invites.accept` needs no key at all,
       * because `createAccount` creates a credential without minting a
       * session. That asymmetry is the feature, not an accident.
       */
      /** The JWT issuer. Platform-provided in a real deployment. */
      CONVEX_SITE_URL: "https://cliffview-test.convex.site",
      JWT_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDeSzFlfSD7sL1M
nOsxGQ04+xluyCadiPWif/SdNi7SDFLbWkyy3xa5tMVozygjSP+etsizwsI1PMeS
pbkRBgWmmFARo7X/oBsmLBkTdJ3SsUnAWn4SrD9y//UNquF/PHUgCUHFlpfqDOGn
+MsTAUAO+u/WhtvSFaPCuEVYXbPuBZ9HT7iZw+PXAKpusO6DYSrJfJio9ErsZeUP
g9/fom5oD1bL9qXIg3qd8/4n1CHA3uyHpxiHPO6GYO53QqlJrjmXq1YedJQ9CEa9
U+BXsDQEliRXP+e3y9br3Fx7pgTBLqBJgbFcSCmze44okqarmZScSIDOKGWwG3Yo
kg4XbvNPAgMBAAECggEAEs0bTXEq4/7L0/oFrm5m/uXF/eex1GssE2VtJArcJOnj
7CeUCyDxRB21AKtcwrc+34aoLQQQ9v3AB3g60eTHf5KsWwGUuB0rjqv2Jv4bByH1
ke5VcXDeIPTjHhfQ4LkVUvNVe8fD64jRYSqaym21pE63EFbxqrAn3KVHQDUUrdHl
jzJ+nWfVMGbTvV7gBweyDArpzqqFGsnTbidA6Tj1l6Nc1aLQ2KXBtokIw9BuH7la
Jyya3Ee/6hAeYkRFEwxJngK/EP/B4O24oa5mLcS6uKqIkO2YTvfQvG0mRhtM7fwp
YwFxkQo6T1UOcJQjTWNTP0b/WRdmf2sQz/JCHPAiIQKBgQDwJHjA8z4Y2YZBrvZc
aj+MjkbkJcWsLAB15Y2Gqk/Z201Rghx+cDhwNvdQ/bEMdisHZbZbZ8tEFd2p3j1a
4Wa4V9vw0+dFhMOrff47HO9uSBJa0EtT91ygPuyjDx5WTuCaNq4l7EEiRWIMvJiV
fyu69LdSDwDUGh+uL0kkGsMT3wKBgQDs+P6CiBEC6JohnamaRvWCKczTzHYrmYMe
5XxHuoY5E8HElZCDdhmy9jdoufI5E9wgl/+zbe3kjFBxy2CwfP/XmasLhUKt38Ys
hl1dW98Xyapi+f5D06QzYqGMSjwTcES5Nwrwg0u8N07b6fDtlljaaXAV8QuZlYq2
Db3B+3WOkQKBgCz/KIE/EsulNrroBdGbNv0nS7FEQp3YQN3WfYZWM1Am/33eW2h1
rp2YLw9F+f7TxYxFSr4l3LiNQFOsCOMWiSDRlayyiAtGrUNdAF4jNdn8NzQ9A2Bg
YULFh6GmG5EghoVe6ZLBihLZ3V11mUGp6o/FevQtS4Jywqzov1O8kAERAoGAVajk
Bzc8PvrpzED7r+L6mCSX/++mv7fsJ9z4gc0w+6zinDccWAj23TQXb2nX3z4Iklef
fLK+DaGS6q+DsghdSwgnRjDTm5qKPkoLsdWl3Slux/xqJwZ4EoMStm2XLcelb/Yv
pCUx2UV84g28o4V3dOwsMiJB+TCPRaPN9jL5maECgYB/yyh3Oz1f2CPGWNTyP0fV
bDj7F8yOFojfSFF+Ene2jyszIftz9osONTmGyTpK/Rply17Rd3dlW0ZbEPkW0gEM
yGwIrQQc1pdVL3tJw4eC1YkeROERtRIfjBtjtxW59HpNOGCgmO/U7MNbWsJ96IRR
KDwqS8NgykXWPs7mj20Ivg==
-----END PRIVATE KEY-----`,
      JWKS: `{"keys":[{"kty":"RSA","n":"3ksxZX0g-7C9TJzrMRkNOPsZbsgmnYj1on_0nTYu0gxS21pMst8WubTFaM8oI0j_nrbIs8LCNTzHkqW5EQYFpphQEaO1_6AbJiwZE3Sd0rFJwFp-Eqw_cv_1Darhfzx1IAlBxZaX6gzhp_jLEwFADvrv1obb0hWjwrhFWF2z7gWfR0-4mcPj1wCqbrDug2EqyXyYqPRK7GXlD4Pf36JuaA9Wy_alyIN6nfP-J9QhwN7sh6cYhzzuhmDud0KpSa45l6tWHnSUPQhGvVPgV7A0BJYkVz_nt8vW69xce6YEwS6gSYGxXEgps3uOKJKmq5mUnEiAzihlsBt2KJIOF27zTw","e":"AQAB","use":"sig","alg":"RS256"}]}`,
    },
    /**
     * `convex/` is the bulk of it. `src/lib/` is included for pure modules
     * only — `csv.ts` is the first, and it earns a test because a CSV that
     * fails to quote a comma does not error: it shifts every column after it
     * and still opens cleanly, so a wrong report looks exactly like a right
     * one. Anything in `src/` that touches the DOM or React does not belong
     * here; this config runs `edge-runtime`, not jsdom.
     */
    include: ["convex/**/*.test.ts", "src/lib/**/*.test.ts"],
    server: {
      deps: {
        // convex-test loads the function modules through Vite; inlining Convex
        // keeps a single copy of its runtime in play.
        inline: ["convex-test"],
      },
    },
  },
});
