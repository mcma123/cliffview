import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { academyQueries } from "@/infrastructure/academy/container";
import { Users, BookOpen, TrendingUp, Sparkles, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/academy/admin")({
  head: () => ({ meta: [{ title: "SMT Admin · Cliffview Academy" }] }),
  loader: () => academyQueries.getAdminOverview(),
  component: AdminOverview,
});

const statIcons = {
  "Total Staff": Users,
  "Modules Completed": BookOpen,
  "Avg. Compliance": TrendingUp,
  "Pending AI Review": Sparkles,
} as const;

function AdminOverview() {
  const data = Route.useLoaderData();

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Compliance Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.dateLabel} ·{" "}
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live data
              </span>
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            Last 30 days <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {data.stats.map((stat) => {
            const Icon = statIcons[stat.label as keyof typeof statIcons];
            const isAction = Boolean(stat.actionHref);

            return (
              <div
                key={stat.label}
                className={`rounded-2xl border p-5 shadow-sm ${
                  isAction ? "border-gold/50 bg-gold-soft/40" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {stat.label}
                  </p>
                  <Icon className={`h-4 w-4 ${isAction ? "text-gold" : "text-primary"}`} />
                </div>
                <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
                {stat.actionHref && (
                  <Link
                    to={stat.actionHref}
                    className="mt-3 inline-block text-xs font-semibold text-gold hover:underline"
                  >
                    Review queue →
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Completion by Phase
            </p>
            <div className="mt-5 space-y-4">
              {data.phases.map((phase) => (
                <div key={phase.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{phase.name}</span>
                    <span className="font-bold text-foreground">{phase.completionPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                      style={{ width: `${phase.completionPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Modules Completed · Last 6 Months
            </p>
            <div className="mt-6 flex h-48 items-end gap-3">
              {data.completionTrend.map((point) => (
                <div key={point.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-primary to-primary/70 transition-all hover:from-gold hover:to-gold/70"
                      style={{ height: `${(point.completedModules / data.trendMax) * 100}%` }}
                    />
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-foreground">
                      {point.completedModules}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {point.month}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
