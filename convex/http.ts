import { httpRouter } from "convex/server";

import { auth } from "./auth";

/**
 * HTTP routes for this deployment.
 *
 * Convex Auth serves its sign-in, token-refresh and callback endpoints from the
 * deployment's `.site` domain (`VITE_CONVEX_SITE_URL` in `.env.local`), not
 * from the app's own origin. That is why there is no `/api/auth/*` route in
 * `src/routes` — the browser talks to Convex directly.
 */
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
