import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail, KeyRound, Eye, ArrowRight, Lock, CheckCircle2, Sparkles } from "lucide-react";
import { CliffviewShield } from "@/components/cliffview-logo";
import { useState } from "react";

export const Route = createFileRoute("/academy/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · Cliffview Academy" }] }),
  component: SignInPage,
});

function SignInPage() {
  const [show, setShow] = useState(false);
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  // "signUp" is the first-time claim of a pre-provisioned profile; "signIn" is
  // every visit after. Convex Auth refuses a signUp whose email is not already
  // a staff row, so this toggle cannot create a new person.
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      await navigate({ to: "/academy/dashboard" });
    } catch (caught) {
      // Convex Auth surfaces our ConvexError messages from
      // `createOrUpdateUser` here — the not-provisioned, inactive and
      // admin-claim-closed refusals.
      const message =
        caught instanceof Error && caught.message.length > 0
          ? caught.message
          : "We could not sign you in. Check your email and password and try again.";
      setError(message.replace(/^\[.*?\]\s*/, ""));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 lg:p-12">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-card shadow-2xl lg:grid-cols-2">
        {/* Brand panel */}
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
              Continuous Professional Teacher Development — right here, on Cliffview's own server.
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

        {/* Form */}
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <h2 className="text-3xl font-bold text-foreground">Welcome back</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your Cliffview email to continue.
          </p>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                School Email
              </label>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-input bg-muted/40 px-4 py-3 focus-within:border-primary">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@cliffview.example"
                  className="flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Password
              </label>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-input bg-muted/40 px-4 py-3 focus-within:border-primary">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <input
                  type={show ? "text" : "password"}
                  name="password"
                  required
                  minLength={8}
                  autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none"
                />
                <button type="button" onClick={() => setShow((v) => !v)}>
                  <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 accent-[color:var(--primary)]"
                />
                Keep me signed in
              </label>
              <a className="font-semibold text-gold hover:underline" href="#">
                Forgot password?
              </a>
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
              {pending ? "Signing in…" : flow === "signIn" ? "Sign In" : "Create my password"}
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
                ? "First time here? Set up your password"
                : "Already set up? Sign in instead"}
            </button>
            <p className="text-center text-xs italic text-muted-foreground">
              Only staff already registered by the school can sign in.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
