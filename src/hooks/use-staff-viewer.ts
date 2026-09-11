import { convexQuery } from "@convex-dev/react-query";
import { useConvexAuth } from "convex/react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../convex/_generated/api";

/**
 * Who is signed in, for the learner pages.
 *
 * The learner equivalent of the gate inside `academy.admin.tsx`, and it exists
 * for the same reason: every learner query is now `requireStaff`, so a page
 * that renders before the token is restored fires an `UNAUTHENTICATED` query
 * and shows an error screen to somebody who is in fact signed in.
 *
 * It lives in `src/hooks` rather than `src/components` because
 * `src/components` stays prop-driven and imports no Convex. This returns plain
 * data, no JSX, so the routes keep owning what a blocked page looks like.
 *
 * The check is a component-level one, not a `beforeLoad` redirect: Convex Auth
 * keeps its token in `localStorage`, so there is no identity on the server and
 * a server-side check would turn everybody away.
 *
 * Defence in depth, never the defence itself — every learner query calls
 * `requireStaff` on the server regardless of what this returns.
 */
export type StaffViewerState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error" }
  | {
      status: "ready";
      viewer: { name: string; initials: string; jobTitle: string; isAdmin: boolean };
    };

export function useStaffViewer(): StaffViewerState {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { data, isPending, isError } = useQuery({
    ...convexQuery(api.auth.viewer, {}),
    // Asking for the viewer before the token is restored is the
    // UNAUTHENTICATED error this hook exists to avoid.
    enabled: isAuthenticated,
  });

  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "signed-out" };
  if (isPending) return { status: "loading" };
  if (isError || data === null || data === undefined) return { status: "error" };
  return { status: "ready", viewer: data };
}
