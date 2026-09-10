import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";

/**
 * Convex client wiring.
 *
 * One factory call per router instance, so nothing is shared across SSR
 * requests. `src/infrastructure/AGENTS.md` forbids per-request state on a
 * module-scope singleton, and an auth token is per-request state — which is
 * exactly why this is a factory rather than a module-level client.
 *
 * On the server each Convex query is a one-shot fetch at a single consistent
 * timestamp, dehydrated into the TanStack Query cache. On the client the same
 * query keys upgrade to live WebSocket subscriptions, so an admin edit repaints
 * open pages with no refetch code.
 *
 * `ConvexAuthProvider` in `src/routes/__root.tsx` owns the auth token and
 * pushes it into this client. See the note on `expectAuth` below before
 * touching the options object.
 */
export function createConvexClients(): {
  convexQueryClient: ConvexQueryClient;
  queryClient: QueryClient;
} {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      "VITE_CONVEX_URL is not set. Add it to .env.local (see convex/AGENTS.md for the deployment contract).",
    );
  }

  /**
   * No options, and in particular **never `expectAuth: true`**.
   *
   * It was set here from Phase 4 until it was found to make signing in
   * impossible. `expectAuth` holds back queries, mutations *and* actions until
   * the first auth token is sent, and the client starts paused. The only thing
   * that resumes it is `client.setAuth`, which `ConvexProviderWithAuth` calls
   * only once its `useAuth` already reports `isAuthenticated`. Signed out,
   * nothing ever calls it, so the socket stays paused — and `auth:signIn` is an
   * action, so the sign-in request is held back too.
   *
   * The result was a deadlock with no error anywhere: the sign-in button sat on
   * "Signing in…" forever and the Convex logs showed nothing, because no
   * request ever left the browser. Anything that makes a caller authenticate
   * through this client cannot also refuse to talk until it is authenticated.
   *
   * What the flag was for — stopping gated queries firing unauthenticated — is
   * already handled, and better, by the component gate in
   * `src/routes/academy.admin.tsx`: it renders a sign-in prompt instead of
   * `<Outlet />`, so no admin query mounts without an identity. Admin loaders
   * return only request-local values such as `now` and never prefetch. If one
   * ever did, it would now throw `UNAUTHENTICATED`, which is a visible failure
   * rather than a silent hang.
   */
  const convexQueryClient = new ConvexQueryClient(url);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Both are required for `convexQuery(...)` options to resolve: the hash
        // function makes a Convex function reference part of a stable query
        // key, and the query function routes the fetch through the Convex
        // client instead of TanStack's default.
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });

  convexQueryClient.connect(queryClient);

  return { convexQueryClient, queryClient };
}
