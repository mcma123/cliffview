import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { LoadingScreen } from "./components/loading-screen";
import { createConvexClients } from "./infrastructure/convex/client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One set of clients per router, never module-scope: an auth token is
  // per-request state and must not leak between SSR requests.
  const { convexQueryClient, queryClient } = createConvexClients();

  const router = createRouter({
    routeTree,
    context: { queryClient, convexQueryClient },
    scrollRestoration: true,
    // Convex subscriptions keep data fresh, so preloaded data never needs a
    // staleness window of its own.
    defaultPreloadStaleTime: 0,
    /**
     * The Suspense fallback for every route.
     *
     * Admin routes read with `useSuspenseQuery`, so their components suspend on
     * first render. Without a pending component the router gives React no
     * fallback at all, and a suspended tree renders nothing — which is why
     * moving between modules blanked the window to white until the query came
     * back. `LoadingScreen` holds its own short delay before showing the mark,
     * so quick navigations still show no spinner.
     */
    defaultPendingComponent: () => <LoadingScreen />,
    /**
     * How long a loader may run before the pending component replaces the
     * current page. Well under the 1s default: this app's loaders return only
     * `now`, so anything that takes longer than a moment is a real wait and
     * saying so beats a frozen screen.
     */
    defaultPendingMs: 200,
    /**
     * Once shown, stay shown this long. Without a floor a fallback that appears
     * at 210ms and vanishes at 260ms is a flash of a logo, which reads as a
     * glitch rather than as loading.
     */
    defaultPendingMinMs: 500,
  });

  // Dehydrates the query cache after SSR and rehydrates it on the client, so
  // loader-fetched Convex data is not re-fetched on hydration.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
