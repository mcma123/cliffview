import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { academyQueries } from "@/infrastructure/academy/container";
import { Play, Clock, ArrowRight, BookOpen, Trophy, Flame, Award, Sparkles } from "lucide-react";

export const Route = createFileRoute("/academy/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Cliffview Academy" }] }),
  loader: () => academyQueries.getStaffDashboard(),
  component: Dashboard,
});

const statIcons = {
  Modules: BookOpen,
  "XP Earned": Sparkles,
  "CPTD Points": Award,
  Streak: Flame,
} as const;

function Dashboard() {
  const data = Route.useLoaderData();

  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground shadow-lg sm:p-8">
          <h2 className="text-2xl font-bold sm:text-3xl">{data.greeting} 👋</h2>
          <p className="mt-2 text-sm text-primary-foreground/80">{data.phaseLabel}</p>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {data.stats.map((stat) => {
            const Icon = statIcons[stat.label as keyof typeof statIcons];

            return (
              <div
                key={stat.label}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </p>
                  <Icon className="h-4 w-4 text-gold" />
                </div>
                <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">
                Continue Learning
              </p>
              <h3 className="mt-2 text-2xl font-bold text-foreground">
                {data.activeModule?.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.activeModule?.moduleLabel} · {data.activeModule?.sectionLabel}
              </p>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {data.activeModule?.progressPercent}% complete
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> ≈ {data.activeModule?.remainingMinutes} min
                    remaining
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                    style={{ width: `${data.activeModule?.progressPercent ?? 0}%` }}
                  />
                </div>
              </div>

              <Link
                to={data.activeModule?.resumePath ?? "/academy/modules"}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                <Play className="h-4 w-4 fill-current" /> Resume
              </Link>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Up Next in Your Pathway
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {data.upcomingModules.map((module) => (
                  <Link
                    key={module.title}
                    to={module.href}
                    className="rounded-xl border border-border bg-card p-4 hover:border-primary"
                  >
                    <h4 className="font-semibold text-foreground">{module.title}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{module.meta}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-gold">This Month</p>
                <Link
                  to="/academy/leaderboard"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>
              <ul className="mt-4 space-y-2.5">
                {data.leaderboard.map((entry) => (
                  <li
                    key={entry.rank}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${entry.isCurrentUser ? "bg-gold-soft" : ""}`}
                  >
                    <span className="w-6 text-xs font-bold text-muted-foreground">
                      #{entry.rank}
                    </span>
                    <Trophy
                      className={`h-3.5 w-3.5 ${entry.rank === 1 ? "text-gold" : "text-muted-foreground/40"}`}
                    />
                    <span className="flex-1 truncate font-medium text-foreground">
                      {entry.participantName}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {entry.xp} XP
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">
                Recent Achievements
              </p>
              <div className="mt-4 space-y-3">
                {data.recentAchievements.map((achievement) => (
                  <div key={achievement} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-soft">
                      <Award className="h-5 w-5 text-gold" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{achievement}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/academy/admin"
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
            >
              View SMT Admin Console <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </section>
      </div>
    </StaffShell>
  );
}
