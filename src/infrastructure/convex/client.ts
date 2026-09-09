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
 * Built deliberately in the shape Phase 4 needs: when auth lands, `expectAuth`
 * flips to true and a real token getter replaces the placeholder. Two lines,
 * not a rewrite.
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

  const convexQueryClient = new ConvexQueryClient(url, {
    // Hold queries until a token is attached rather than firing them
    // unauthenticated and having every gated query throw. `ConvexAuthProvider`
    // in `src/routes/__root.tsx` supplies the token.
    //
    // This is also why admin routes no longer prefetch in their loaders:
    // Convex Auth keeps its token in localStorage, so there is no identity on
    // the server and a server-side query would be held forever. Admin screens
    // are client-rendered behind the gate in `src/routes/academy.admin.tsx`.
    expectAuth: true,
  });

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
