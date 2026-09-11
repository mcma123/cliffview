import { convexQuery } from "@convex-dev/react-query";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { api } from "../../convex/_generated/api";

/**
 * Who is signed in, for the learner pages, plus the props the shell needs.
 *
 * The learner equivalent of the gate inside `academy.admin.tsx`, and it exists
 * for the same reason: every learner query is `requireStaff`, so a page that
 * renders before the token is restored fires an `UNAUTHENTICATED` query and
 * shows an error screen to somebody who is in fact signed in.
 *
 * It lives in `src/hooks` rather than `src/components` because
 * `src/components` stays prop-driven and imports no Convex. It returns plain
 * data and one callback, so the routes keep owning what a blocked page looks
 * like and the shell keeps owning what the chrome looks like.
 *
 * Defence in depth, never the defence itself — every learner query calls
 * `requireStaff` on the server regardless of what this returns.
 */

export type StaffShellProps = {
  viewer: { name: string; initials: string };
  streakDays: number;
  showAdminLink: boolean;
  onSignOut: () => void;
};

export type StaffViewerState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error" }
  | {
      status: "ready";
      viewer: { name: string; initials: string; jobTitle: string; isAdmin: boolean };
      streakDays: number;
      shellProps: StaffShellProps;
    };

/**
 * The start of the current day, in UTC.
 *
 * The query takes `now`, and passing `Date.now()` would change the query key
 * on every render and refetch forever. A streak only changes once a day, so
 * the day boundary is both a stable key and the correct precision.
 */
function startOfDayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function useStaffViewer(): StaffViewerState {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const { data, isPending, isError } = useQuery({
    ...convexQuery(api.learn.me, { now: startOfDayUtc() }),
    // Asking before the token is restored is the UNAUTHENTICATED error this
    // hook exists to avoid.
    enabled: isAuthenticated,
    retry: false,
  });

  const onSignOut = useCallback(() => {
    void signOut().then(() => navigate({ to: "/academy/sign-in" }));
  }, [signOut, navigate]);

  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "signed-out" };
  if (isPending) return { status: "loading" };
  if (isError || data === undefined) return { status: "error" };

  const viewer = { name: data.name, initials: data.initials };
  return {
    status: "ready",
    viewer: { ...viewer, jobTitle: data.jobTitle, isAdmin: data.isAdmin },
    streakDays: data.streakDays,
    shellProps: {
      viewer,
      streakDays: data.streakDays,
      // The admin console link is offered only to somebody who can use it. It
      // used to be shown to every teacher in the school, with the gate on the
      // other side doing the refusing.
      showAdminLink: data.isAdmin,
      onSignOut,
    },
  };
}
