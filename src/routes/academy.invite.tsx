import { convexAction, useConvexAction } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Eye, KeyRound, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CliffviewShield } from "@/components/cliffview-logo";
import { api } from "../../convex/_generated/api";

/**
 * Redeem an invitation and set a first password.
 *
 * Public and ungated on purpose: the token in the URL *is* the credential, and
 * the person arriving has no account yet by definition. The filename needs no
 * trailing underscore — the only layout route in the tree is
 * `academy.admin.tsx`, so `academy.invite` is already a direct child of the
 * root and nothing gates it. (`academy.admin_.sign-in.tsx` carries an
 * underscore solely to escape the admin gate.)
 *
 * `invites.accept` mints no session, so finishing here leaves the teacher
 * signed out and sent to the normal sign-in page — which is the requested
 * flow, and avoids briefly writing a real session to localStorage just to
 * discard it.
 */
export const Route = createFileRoute("/academy/invite")({
  head: () => ({ meta: [{ title: "Set your password · Cliffview Academy" }] }),
  // No loader: this has to run in the browser, and a loader would also send
  // the token through the SSR server for no benefit.
  validateSearch: (search: Record<string, unknown>): { token: string } => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: InvitePage,
});

/** What to say for every state a link can be in. */
const REFUSALS: Record<string, { title: string; body: string }> = {
  unknown: {
    title: "This link is not valid",
    body: "It may have been mistyped or truncated by your email app. Ask an administrator to send you a new invitation.",
  },
  expired: {
    title: "This invitation has expired",
    body: "Invitations are valid for seven days. Ask an administrator to send you a new one.",
  },
  used: {
    title: "This invitation has already been used",
    body: "Your password is already set. Sign in with it below.",
  },
  revoked: {
    title: "A newer invitation was sent",
    body: "Please open the most recent invitation email instead — this one was replaced.",
  },
  email_changed: {
    title: "This invitation is out of date",
    body: "Your email address was changed after it was sent. Ask an administrator to send a new one.",
  },
};

function InvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    ...convexAction(api.invites.preview, { token }),
    enabled: token.length > 0,
    retry: false,
  });
  const accept = useMutation({ mutationFn: useConvexAction(api.invites.accept) });

  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= 8 && password === confirm && !accept.isPending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!ready) return;
    try {
      await accept.mutateAsync({ token, password, confirmPassword: confirm });
      toast.success("Password set. Sign in with it to continue.");
      await navigate({ to: "/academy/sign-in" });
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message.length > 0
          ? caught.message
          : "We could not set your password. Ask an administrator for a new invitation.";
      // Same prefix strip both sign-in routes use on ConvexError messages.
      setError(message.replace(/^\[.*?\]\s*/, ""));
    }
  }

  const state = token.length === 0 ? "unknown" : (preview.data?.state ?? null);
  const refusal =
    state !== null && state !== "valid" ? (REFUSALS[state] ?? REFUSALS.unknown) : null;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 lg:p-12">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-card shadow-2xl lg:grid-cols-2">
        <div className="relative overflow-hidden bg-primary-deep p-8 text-primary-foreground sm:p-12">
          <div className="absolute -left-20 -bottom-10 h-72 w-72 rounded-full bg-primary/60 blur-2xl" />
          <div className="absolute right-0 bottom-10 h-56 w-56 rounded-full bg-gold/30 blur-3xl" />
          <div className="relative">
            <CliffviewShield className="h-20 w-20" />
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.3em] text-gold">
              Cliffview Primary
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Staff Training Portal</h1>
            <p className="mt-6 max-w-sm text-sm italic text-primary-foreground/80">
              One more step and your training record is ready.
            </p>
            <ul className="mt-12 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-gold" /> Hosted on-site
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-gold" /> GDE-aligned
              </li>
              <li className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-gold" /> AI-powered
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col justify-center p-8 sm:p-12">
          {preview.isPending && token.length > 0 ? (
            <p className="text-sm text-muted-foreground">Checking your invitation…</p>
          ) : refusal !== null ? (
            <div>
              <h2 className="text-3xl font-bold text-foreground">{refusal.title}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{refusal.body}</p>
              <Link
                to="/academy/sign-in"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                Go to sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-foreground">
                Welcome{preview.data?.firstName === null ? "" : `, ${preview.data?.firstName}`}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a password for{" "}
                <span className="font-semibold text-foreground">{preview.data?.email}</span>. You
                will use it to sign in from now on.
              </p>

              <form className="mt-8 space-y-5" onSubmit={submit}>
                <div>
                  <label
                    htmlFor="invite-password"
                    className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    New password
                  </label>
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-input bg-muted/40 px-4 py-3 focus-within:border-primary">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <input
                      id="invite-password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
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
                  <p className="mt-2 text-xs text-muted-foreground">At least 8 characters.</p>
                </div>

                <div>
                  <label
                    htmlFor="invite-confirm"
                    className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    Confirm password
                  </label>
                  <div
                    className={`mt-2 flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 focus-within:border-primary ${
                      mismatch ? "border-destructive" : "border-input"
                    }`}
                  >
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <input
                      id="invite-confirm"
                      type={show ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-foreground outline-none"
                    />
                  </div>
                  {mismatch && (
                    <p className="mt-2 text-xs text-destructive">
                      The two passwords do not match yet.
                    </p>
                  )}
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
                  disabled={!ready}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.01] hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {accept.isPending ? "Setting your password…" : "Set my password"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <p className="text-center text-xs italic text-muted-foreground">
                  This link works once. After setting your password you will sign in with it.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
