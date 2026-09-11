import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Clock, Play } from "lucide-react";

import { presentLearnerModules } from "@/application/academy/presenters";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { api } from "../../convex/_generated/api";

/**
 * The learner dashboard, read from Convex.
 *
 * It used to read a hand-written in-memory snapshot, which is why an admin
 * could assign eight modules and the teacher would still see a stranger's
 * seeded statistics. Everything here is now the signed-in person's own rows.
 */
export const Route = createFileRoute("/academy/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Cliffview Academy" }] }),
  component: Dashboard,
});

function Dashboard() {
  const gate = useStaffViewer();
  // Real name, initials, streak, sign-out, and the admin link only for
  // admins. Empty while the gate is still resolving, so the chrome shows
  // nothing rather than a placeholder identity.
  const shell = gate.status === "ready" ? gate.shellProps : {};
  const now = Date.now();

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.myModules, {}),
    enabled: gate.status === "ready",
    retry: false,
  });

  if (gate.status === "loading" || (gate.status === "ready" && isPending)) {
    return (
      <StaffShell {...shell}>
        <PageNotice title="Loading your dashboard…" />
      </StaffShell>
    );
  }
  if (gate.status === "signed-out") {
    return (
      <StaffShell {...shell}>
        <PageNotice
          title="Sign in to continue"
          body="Your training record is private to you."
          action={{ label: "Go to sign in", to: "/academy/sign-in" }}
        />
      </StaffShell>
    );
  }
  if (data === undefined || error !== null) {
    return (
      <StaffShell {...shell}>
        <PageNotice
          title="We could not load your dashboard"
          body={error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, "") : undefined}
        />
      </StaffShell>
    );
  }

  const view = presentLearnerModules(data, now);

  return (
    <StaffShell {...shell}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-3xl border border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] p-8 text-primary-foreground shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
            Cliffview Academy
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">
            Welcome back, {view.greetingName}
          </h1>
          <p className="mt-2 text-primary-foreground/80">{view.jobTitle}</p>

          <div className="mt-6 flex items-center gap-4">
            <div className="h-3 w-full max-w-md overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gold"
                style={{ width: `${view.compliancePercent}%` }}
              />
            </div>
            <span className="text-2xl font-black">{view.compliancePercent}%</span>
            <span className="text-sm text-primary-foreground/80">compliance</span>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          {view.stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-black text-foreground">{stat.value}</p>
            </article>
          ))}
        </section>

        {view.nextUp === null ? null : (
          <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Next up</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">{view.nextUp.title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {view.nextUp.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" /> {view.nextUp.durationMinutes} min
              </span>
              <span>{view.nextUp.lessonsLabel}</span>
              <span>{view.nextUp.cptdPoints} CPTD points</span>
            </div>
            <Link
              to="/academy/modules/$moduleSlug"
              params={{ moduleSlug: view.nextUp.slug }}
              className="group mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              <Play className="h-4 w-4" />
              {view.nextUp.status === "not_started" ? "Start module" : "Continue module"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-foreground">My modules</h2>
            <Link
              to="/academy/modules"
              className="text-sm font-semibold text-primary hover:underline"
            >
              See all
            </Link>
          </div>

          {view.modules.length === 0 ? (
            <PageNotice
              title="No modules assigned yet"
              body="An SMT administrator assigns your training. Once they do, it appears here."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {view.modules.slice(0, 6).map((module) => (
                <Link
                  key={module.id}
                  to="/academy/modules/$moduleSlug"
                  params={{ moduleSlug: module.slug }}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    {module.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Play className="h-5 w-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-foreground">{module.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {module.lessonsLabel} · {module.statusLabel}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {module.progressPercent}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
