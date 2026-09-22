import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { presentAdminOverview } from "@/application/academy/presenters";
import { api } from "../../convex/_generated/api";
import type { LucideIcon } from "lucide-react";
import { Users, BookOpen, TrendingUp, Sparkles } from "lucide-react";

export const Route = createFileRoute("/academy/admin/")({
  head: () => ({ meta: [{ title: "SMT Admin · Cliffview Academy" }] }),
  // No prefetch: adminOverview requires an admin identity and Convex Auth has
  // no token on the server. The admin gate renders this only once signed in.
  loader: () => ({ now: Date.now() }),
  component: AdminOverview,
});

/** The four labels `presentAdminOverview` emits, as literals. */
type StatLabel = ReturnType<typeof presentAdminOverview>["stats"][number]["label"];

/**
 * Icon, destination and call-to-action per tile.
 *
 * The destinations live here rather than in the presenter on purpose: `as
 * const` keeps them literal, so `<Link to={card.to}>` is checked against the
 * generated route tree. A href carried through the view-model widens to
 * `string`, and a `string` `to` is the one shape TanStack accepts unchecked.
 *
 * `satisfies Record<StatLabel, …>` is what turns a renamed presenter label into
 * a compile error here, rather than the missing icon at runtime that the old
 * `stat.label as keyof typeof statIcons` cast permitted.
 */
const statCards = {
  "Total Staff": { icon: Users, to: "/academy/admin/staff", action: null },
  "Modules Completed": { icon: BookOpen, to: "/academy/admin/modules", action: null },
  "Avg. Compliance": { icon: TrendingUp, to: "/academy/admin/reports", action: null },
  "Pending AI Review": {
    icon: Sparkles,
    to: "/academy/admin/ai-review",
    action: "Review queue →",
  },
} as const satisfies Record<StatLabel, { icon: LucideIcon; to: string; action: string | null }>;

function AdminOverview() {
  const viewer = useAdminViewer();
  const { now } = Route.useLoaderData();
  const { data: overview } = useSuspenseQuery(convexQuery(api.dashboard.adminOverview, { now }));
  const data = presentAdminOverview(overview, now);

  return (
    <AdminShell viewer={viewer}>
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
        </div>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {data.stats.map((stat) => {
            const card = statCards[stat.label];
            const Icon = card.icon;
            const isAction = card.action !== null;

            return (
              <Link
                key={stat.label}
                to={card.to}
                className={`group rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isAction
                    ? "border-gold/50 bg-gold-soft/40 hover:border-gold"
                    : "border-border bg-card hover:border-primary/40"
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
                {card.action === null ? null : (
                  // A span, not a nested <Link>: the whole card is the anchor
                  // now, and an <a> inside an <a> is invalid HTML that the
                  // browser silently unnests.
                  <span className="mt-3 inline-block text-xs font-semibold text-gold group-hover:underline">
                    {card.action}
                  </span>
                )}
              </Link>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Completion by Phase
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{data.phasesCaption}</p>
            <div className="mt-5 space-y-2">
              {data.phases.map((phase) => (
                <Link
                  key={phase.name}
                  to="/academy/admin/staff"
                  // Seeds the directory's existing free-text box rather than
                  // adding a second filtering mechanism beside it, which is why
                  // this sends the phase *name*: that is what the box matches.
                  search={{ phase: phase.name }}
                  className="group -mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground group-hover:text-primary">
                      {phase.name}
                      {phase.hasStaff && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {phase.staffLabel}
                        </span>
                      )}
                    </span>
                    {phase.hasStaff ? (
                      <span className="font-bold text-foreground">{phase.completionPercent}%</span>
                    ) : (
                      <span className="font-medium text-muted-foreground">{phase.staffLabel}</span>
                    )}
                  </div>
                  {/* No track at all for an empty phase. A 0%-wide bar asserts
                      that nobody has completed anything, which is a different
                      claim from nobody being in the phase. */}
                  {phase.hasStaff && (
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                        style={{ width: `${phase.completionPercent}%` }}
                      />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Modules Completed · Last 6 Months
            </p>
            <div className="mt-6 flex h-48 items-end gap-3">
              {data.completionTrend.map((point) => (
                // The whole column is the hover target, not the bar: a month
                // with no completions has a zero-height bar and nothing to
                // point at. `role="img"` makes the label the column's
                // accessible name and its children presentational, so a screen
                // reader says "Jun · 4 modules completed" once rather than
                // reading two orphaned numbers.
                <div
                  key={point.monthKey}
                  role="img"
                  aria-label={point.tooltip}
                  title={point.tooltip}
                  className="group flex flex-1 flex-col items-center gap-2"
                >
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-primary to-primary/70 transition-all group-hover:from-gold group-hover:to-gold/70"
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

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gold">
            Completion by Teacher
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.teachersCaption}</p>

          {data.teachers.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">No active staff yet.</p>
          ) : (
            // Scrolls past roughly eight rows. The negative margin is on the
            // SCROLLER, not on each row as it is in the phase panel above:
            // `overflow-y-auto` makes overflow-x compute to `auto`, so a row
            // hanging outside this box would raise a horizontal scrollbar. The
            // container hangs out instead and its rows sit flush inside it,
            // which lands the hover background exactly where the phase rows' is.
            <div className="-mx-2 mt-5 max-h-[29rem] space-y-1 overflow-y-auto">
              {data.teachers.map((teacher) => (
                <Link
                  key={teacher.id}
                  to="/academy/admin/staff/$staffId"
                  params={{ staffId: teacher.id }}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {teacher.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {teacher.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {teacher.jobTitle} · {teacher.phaseName}
                    </span>
                  </span>
                  {teacher.hasAssignments ? (
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-muted sm:block sm:w-40">
                        <span
                          className={`block h-full rounded-full ${teacher.meterClass}`}
                          style={{ width: `${teacher.completionPercent}%` }}
                        />
                      </span>
                      <span className="w-12 text-right text-sm font-bold tabular-nums text-foreground">
                        {teacher.completionLabel}
                      </span>
                      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                        {teacher.progressLabel}
                      </span>
                    </span>
                  ) : (
                    // No track at all, for the same reason an empty phase gets
                    // none: a 0%-wide bar asserts they completed nothing.
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {teacher.completionLabel}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
