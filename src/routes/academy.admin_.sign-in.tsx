import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, KeyRound, ShieldCheck, User } from "lucide-react";
import { useState } from "react";

import { CliffviewShield } from "@/components/cliffview-logo";
import { toStaffEmail } from "@/lib/staff-identifier";

/**
 * Administrator sign-in, at `/academy/admin/sign-in`.
 *
 * The filename is `academy.admin_.sign-in.tsx`, and the trailing underscore on
 * `admin` is load-bearing. Without it this route nests inside
 * `academy.admin.tsx` — which is the admin gate — so an unauthenticated visitor
 * would be shown the gate's "Sign in to continue" card instead of this form,
 * with its button pointing back at a sign-in page it would never render. The
 * underscore opts the route out of that layout while keeping the URL.
 *
 * Differs from `/academy/sign-in` in one substantive way: the identifier field
 * accepts a bare username. There is no username column — `toStaffEmail` maps
 * `admin` to `admin@cliffview.example` before it reaches Convex Auth, which
 * keys accounts on email. The input is deliberately `type="text"`; `type="email"`
 * would make the browser reject `admin` before submit.
 */
export const Route = createFileRoute("/academy/admin_/sign-in")({
  head: () => ({ meta: [{ title: "Administrator sign in · Cliffview Academy" }] }),
  component: AdminSignInPage,
});

function AdminSignInPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  // "signUp" is the first-time claim of a pre-provisioned profile, not
  // registration: `createOrUpdateUser` refuses an email that is not already a
  // staff row, and refuses a privileged one unless an operator has opened a
  // claim window. So this toggle cannot create a new administrator.
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const email = toStaffEmail(identifier);
    if (email.length === 0) {
      setError("Enter your username or email address.");
      return;
    }

    setPending(true);
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      await navigate({ to: "/academy/admin" });
    } catch (caught) {
      // Convex Auth surfaces the ConvexError messages from
      // `createOrUpdateUser` here: NOT_PROVISIONED, INACTIVE and
      // ADMIN_CLAIM_CLOSED. Show the server's wording rather than a generic
      // failure — each one tells the operator something different to do.
      const message =
        caught instanceof Error && caught.message.length > 0
          ? caught.message
          : "We could not sign you in. Check your details and try again.";
      setError(message.replace(/^\[.*?\]\s*/, ""));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-xl sm:p-10">
          <div className="flex flex-col items-center text-center">
            <CliffviewShield className="h-14 w-14" />
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-gold">
              Cliffview Primary
            </p>
            <h1 className="mt-2 text-2xl font-bold text-foreground">Administrator sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This console is limited to senior management and system operators.
            </p>
          </div>

          {isAuthenticated ? (
            <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5 text-center">
              <p className="text-sm text-foreground">You are already signed in.</p>
              <Link
                to="/academy/admin"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                Open the admin console <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="admin-identifier"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Username or email
                </label>
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-input bg-muted/40 px-4 py-3 focus-within:border-primary">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <input
                    id="admin-identifier"
                    // Text, not email: `type="email"` would block a bare
                    // username at the browser's own validation step.
                    type="text"
                    name="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="admin"
                    className="flex-1 bg-transparent text-sm text-foreground outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Password
                </label>
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-input bg-muted/40 px-4 py-3 focus-within:border-primary">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <input
                    id="admin-password"
                    type={show ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              </div>

              {error !== null && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.01] hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending
                  ? flow === "signIn"
                    ? "Signing in…"
                    : "Setting your password…"
                  : flow === "signIn"
                    ? "Sign in"
                    : "Set up my password"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlow((f) => (f === "signIn" ? "signUp" : "signIn"));
                  setError(null);
                }}
                className="w-full text-center text-xs font-semibold text-gold hover:underline"
              >
                {flow === "signIn"
                  ? "First time here? Set up my password"
                  : "Already set up? Sign in instead"}
              </button>
            </form>
          )}

          <div className="mt-8 flex items-start gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p>
              Administrator accounts are provisioned by an operator before first use. Signing in
              here does not create one.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Staff without admin access should use the{" "}
          <Link to="/academy/sign-in" className="font-semibold text-gold hover:underline">
            staff sign-in
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
