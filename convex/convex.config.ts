import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config";

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
 */
const app = defineApp();
app.use(r2);

export default app;
