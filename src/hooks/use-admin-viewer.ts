import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../convex/_generated/api";

/**
 * Who is signed in, for the admin chrome.
 *
 * The admin counterpart to `useStaffViewer`, and far smaller: the admin gate in
 * `academy.admin.tsx` has already resolved the identity and refused everyone
 * else by the time any `/academy/admin/*` page renders, so there is no loading,
 * signed-out or error state left for this to model. It returns `undefined`
 * until the query settles and `AdminShell` simply omits the avatar until then.
 *
 * It lives here rather than in `src/components` because `src/components` stays
 * prop-driven and imports no Convex.
 *
 * The gate already runs this exact query, so TanStack Query serves it from
 * cache — this is a second reader, not a second round trip.
 */
export function useAdminViewer(): { name: string; initials: string } | undefined {
  const { data } = useQuery(convexQuery(api.auth.viewer, {}));
  if (data === undefined || data === null) return undefined;
  return { name: data.name, initials: data.initials };
}
