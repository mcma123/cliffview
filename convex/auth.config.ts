/**
 * JWT provider config for `ctx.auth.getUserIdentity()`.
 *
 * This file is the single most load-bearing line in the auth setup: if it is
 * missing or the domain is wrong, `getUserIdentity()` returns null forever and
 * the app is silently always-signed-out with no error anywhere. Convex Auth
 * issues its own tokens from this deployment, so the issuer is the deployment's
 * own site URL.
 *
 * `CONVEX_SITE_URL` is provided by the platform — never declare it in
 * `convex.config.ts`, and never hardcode it.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
