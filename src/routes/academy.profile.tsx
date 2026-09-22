import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, Flame, Lock, Mail } from "lucide-react";

import { presentLearnerProfile } from "@/application/academy/presenters";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { errorMessage } from "@/lib/convex-error";
import { api } from "../../convex/_generated/api";

/**
 * The signed-in teacher's own profile.
 *
 * Everything here used to be a literal — "Ms. M. Naidoo", a "Gold Tier" badge,
 * eight invented achievements and a three-row CPTD ledger with hand-typed
 * dates — shown identically to whoever opened the page. It is now their own
 * record, and the numbers move when they do the work.
 */
export const Route = createFileRoute("/academy/profile")({
  head: () => ({ meta: [{ title: "My Profile · Cliffview Academy" }] }),
  component: ProfilePage,
});

/** Stable across renders, so the query key does not churn. */
function startOfDayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function ProfilePage() {
  const gate = useStaffViewer();
  const shell = gate.status === "ready" ? gate.shellProps : {};

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.profile, { now: startOfDayUtc() }),
    enabled: gate.status === "ready",
    retry: false,
  });

  if (gate.status === "loading" || (gate.status === "ready" && isPending)) {
    return (
      <StaffShell {...shell}>
        <PageNotice title="Loading your profile…" />
      </StaffShell>
    );
  }
  if (gate.status === "signed-out") {
    return (
      <StaffShell>
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
          title="We could not load your profile"
          body={errorMessage(error, "") || undefined}
        />
      </StaffShell>
    );
  }

  const me = presentLearnerProfile(data);

  return (
    <StaffShell {...shell}>
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-col items-start gap-6 rounded-3xl border border-border bg-card p-8 shadow-sm sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-black text-primary-foreground">
            {me.initials}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-black tracking-tight text-foreground">{me.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {me.jobTitle} · {me.phaseName}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> {me.email} · {me.joinedLabel}
            </p>
          </div>
          {me.streakDays > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-4 py-2 text-sm font-semibold text-primary-deep">
              <Flame className="h-4 w-4" /> {me.streakLabel}
            </div>
          )}
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "CPTD points", value: `${me.cptdPoints}` },
            { label: "Total XP", value: `${me.xpTotal}` },
            { label: "Compliance", value: `${me.compliancePercent}%` },
            { label: "Streak", value: me.streakLabel },
          ].map((stat) => (
            <article
              key={stat.label}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-3 text-2xl font-black text-foreground">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black tracking-tight text-foreground">Achievements</h2>
            <span className="text-sm text-muted-foreground">{me.badgesLabel}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{me.modulesLabel}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {me.badges.map((badge) => (
              <article
                key={badge.key}
                className={`rounded-2xl border p-4 ${
                  badge.earned ? "border-gold/50 bg-gold-soft/40" : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  {badge.earned ? (
                    <Award className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                  ) : (
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        badge.earned ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {badge.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{badge.description}</p>
                    {badge.earnedLabel === null ? null : (
                      <p className="mt-1 text-xs font-semibold text-gold">
                        Earned {badge.earnedLabel}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black tracking-tight text-foreground">CPTD record</h2>
            <span className="text-sm font-bold text-foreground">{me.ledgerTotal} points</span>
          </div>

          {me.ledger.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing logged yet. Finish a module and it is recorded here with the points it was
              worth.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border">
              {me.ledger.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link
                      to="/academy/modules/$moduleSlug"
                      params={{ moduleSlug: row.slug }}
                      className="font-bold text-foreground hover:text-primary"
                    >
                      {row.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.dateLabel}
                      {row.scoreLabel === null ? "" : ` · scored ${row.scoreLabel}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-success">+{row.cptdPoints} pts</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
