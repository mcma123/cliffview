import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config";
import resend from "@convex-dev/resend/convex.config.js";

/**
 * Component registration.
 *
 * Phases 1 and 4 deliberately went without this file: its only uses are
 * `app.use()` and `defineApp({ env })`, and Convex Auth needs neither — it is a
 * library whose tables are spread into our own schema via `...authTables`.
 *
 * Cloudflare R2 is a real component, so the file has to exist now. Declaring it
 * switches codegen into component mode, which is why the Phase 6 verification
 * re-proves sign-in after the push rather than assuming auth was untouched.
 *
 * R2 depends on `@convex-dev/action-retrier` and registers it itself, so it
 * must not be listed here as well.
 *
 * Resend does the same, three times over: it registers a `rateLimiter` and two
 * `workpool` instances (`emailWorkpool`, `callbackWorkpool`) of its own. None
 * of them belongs here either — but every one has to be registered by hand in
 * the test harness, because at runtime each is addressed by its nested path
 * and `@convex-dev/resend/test` registers only the parent. That is the
 * `r2/actionRetrier` lesson again, and it is why `newTest()` lists four
 * registrations for what looks like one component.
 */
const app = defineApp();
app.use(r2);
app.use(resend);

export default app;
