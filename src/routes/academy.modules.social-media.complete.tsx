import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Trophy, Award, Sparkles, CheckCircle2, Home, BookOpen } from "lucide-react";

export const Route = createFileRoute("/academy/modules/social-media/complete")({
  head: () => ({ meta: [{ title: "Module complete · Cliffview Academy" }] }),
  component: Complete,
});

function Complete() {
  return (
    <StaffShell>
      <div className="relative mx-auto max-w-3xl">
        {/* Confetti shapes */}
        <div className="pointer-events-none absolute -top-10 left-1/4 h-32 w-32 rounded-full bg-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute top-20 right-1/4 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-card via-card to-gold-soft/40 p-8 text-center shadow-xl sm:p-14">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold text-primary-deep shadow-lg">
            <Trophy className="h-10 w-10" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-gold">
            Module Complete
          </p>
          <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
            Beautifully done, Ms. Naidoo.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Social Media Awareness · 100% pass on first attempt
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Award, big: "+3", label: "CPTD Points", sub: "logged to your profile" },
              { icon: Sparkles, big: "+250", label: "XP Earned", sub: "this week" },
              { icon: CheckCircle2, big: "100%", label: "Quiz Score", sub: "5 of 5 correct" },
            ].map((r) => (
              <div key={r.label} className="rounded-2xl border border-border bg-card p-5 text-left">
                <r.icon className="h-5 w-5 text-gold" />
                <p className="mt-3 text-2xl font-bold text-foreground">{r.big}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  {r.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{r.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/academy/modules"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              <BookOpen className="h-4 w-4" /> Next Module
            </Link>
            <Link
              to="/academy/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Home className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </StaffShell>
  );
}
