import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

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
  });

  // Dehydrates the query cache after SSR and rehydrates it on the client, so
  // loader-fetched Convex data is not re-fetched on hydration.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
