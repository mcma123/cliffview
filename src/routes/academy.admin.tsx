import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { api } from "../../convex/_generated/api";

/**
 * The admin gate.
 *
 * This layout route used to be a two-line `<Outlet />` pass-through, which
 * `src/routes/AGENTS.md` requires of layout files. This is the documented
 * exception: putting the gate here means one check protects every current and
 * future `/academy/admin/*` screen, and no admin query can fire before the
 * caller is known to be an admin.
 *
 * It is a component gate rather than a `beforeLoad` redirect because Convex
 * Auth keeps its token in localStorage. There is no identity on the server, so
 * a server-side check would refuse everyone. Admin screens are therefore
 * client-rendered; they are behind a login and gain nothing from SSR.
 *
 * The gate is defence in depth, not the defence itself. Every admin query and
 * mutation calls `requireAdmin` server-side — this only decides what the
 * browser draws.
 */
export const Route = createFileRoute("/academy/admin")({
  component: AdminGate,
});

function GateMessage({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
        {action !== undefined && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

/** Resolves the signed-in staff member's role. Only runs once authenticated. */
function RoleGate() {
  const { data, isPending, isError } = useQuery(convexQuery(api.auth.viewer, {}));

  if (isPending) {
    return <LoadingScreen label="Checking your access" />;
  }

  if (isError || data === undefined || data === null) {
    return (
      <GateMessage
        title="We could not load your profile"
        action={
          <Link
            to="/academy/admin/sign-in"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Back to sign in
          </Link>
        }
      >
        Your sign-in worked but your staff profile could not be read. An administrator may need to
        finish setting up your account.
      </GateMessage>
    );
  }

  if (!data.isAdmin) {
    return (
      <GateMessage
        title="SMT access only"
        action={
          <Link
            to="/academy/dashboard"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Go to my training
          </Link>
        }
      >
        The admin console is limited to senior management. Your account is signed in as{" "}
        <span className="font-semibold text-foreground">{data.jobTitle}</span>.
      </GateMessage>
    );
  }

  return <Outlet />;
}

function AdminGate() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  // True during SSR and on the first client render, before the stored token is
  // read. Rendering the gate rather than the outlet is what keeps admin queries
  // from firing without an identity.
  if (isLoading) {
    return <LoadingScreen label="Restoring your session" />;
  }

  if (!isAuthenticated) {
    return (
      <GateMessage
        title="Sign in to continue"
        action={
          <Link
            to="/academy/admin/sign-in"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Sign in
          </Link>
        }
      >
        The SMT admin console requires a Cliffview Academy staff account.
      </GateMessage>
    );
  }

  return <RoleGate />;
}
