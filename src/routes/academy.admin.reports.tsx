import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Gauge,
  Users,
} from "lucide-react";
import { useState } from "react";

import { complianceMeterClass, presentComplianceReport } from "@/application/academy/presenters";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { csvFileName, downloadCsv, toCsv, type CsvTable } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Compliance reports — the evidence behind the overview's tiles.
 *
 * Every figure is computed from live enrollment rows at page load, which is why
 * there is no history section: the only stored history is a seeded formula that
 * nothing maintains, and a fabricated trend has no place in a document an
 * administrator might forward to a department.
 */
export const Route = createFileRoute("/academy/admin/reports")({
  head: () => ({ meta: [{ title: "Reports · Cliffview Academy" }] }),
  // No prefetch: admin screens are client-rendered behind the gate in
  // `academy.admin.tsx`, and a gated query has no identity on the server.
  loader: () => ({ now: Date.now() }),
  component: AdminReports,
});

const STAT_ICONS: Record<string, typeof Users> = {
  "Active staff": Users,
  Assignments: ClipboardList,
  Completed: CheckCircle2,
  "Avg. compliance": Gauge,
};

function AdminReports() {
  const viewer = useAdminViewer();
  const { now } = Route.useLoaderData();
  const [phaseId, setPhaseId] = useState<Id<"phases"> | null>(null);

  // The filter is a query argument rather than a client-side `.filter()`,
  // unlike the staff directory's search: the summary tiles have to describe the
  // tables beneath them, and re-deriving them in the browser would be a second
  // place for the arithmetic to disagree.
  const { data: report } = useSuspenseQuery(
    convexQuery(api.reports.compliance, {
      now,
      ...(phaseId === null ? {} : { phaseId }),
    }),
  );
  const data = presentComplianceReport(report, now);

  function exportCsv(table: CsvTable, base: string) {
    downloadCsv(csvFileName(base, now), toCsv(table));
  }

  return (
    <AdminShell viewer={viewer}>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
              Compliance reports
            </p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">Where the school stands</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.generatedLabel} · {data.scopeLabel}
            </p>
          </div>

          <label className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Phase
            </span>
            <select
              value={phaseId ?? ""}
              onChange={(e) =>
                setPhaseId(e.target.value === "" ? null : (e.target.value as Id<"phases">))
              }
              className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary sm:w-64"
            >
              <option value="">All phases</option>
              {data.phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.name}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {data.stats.map((stat) => {
            const Icon = STAT_ICONS[stat.label] ?? ClipboardList;
            return (
              <div
                key={stat.label}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {stat.label}
                  </p>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            );
          })}
        </div>

        {!data.hasOverdue ? null : (
          <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
            <p className="text-sm text-foreground">
              Some assignments are past their due date. They are counted in the Overdue column of
              both tables below.
            </p>
          </div>
        )}

        {/* --- Module coverage ------------------------------------------- */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Module coverage
              </p>
              <h2 className="mt-2 text-xl font-bold text-foreground">
                How far each module has reached
              </h2>
            </div>
            <button
              onClick={() => exportCsv(data.moduleCsv, "module-coverage")}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs">
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Module
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      Assigned
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      Done
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      In progress
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      Overdue
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Completion
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Avg. score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.modules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">
                        No modules exist yet.
                      </td>
                    </tr>
                  ) : (
                    data.modules.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-6 py-4">
                          <Link to={row.href} className="group block">
                            <span className="font-semibold text-foreground group-hover:text-gold">
                              {row.title}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {row.numberLabel} · {row.category}
                              {row.isPublished ? null : (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                  {row.publishLabel}
                                </span>
                              )}
                            </span>
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-foreground">
                          {row.assigned}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-foreground">
                          {row.completed}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                          {row.inProgress}
                        </td>
                        <td
                          className={cn(
                            "px-6 py-4 text-right tabular-nums",
                            row.overdue > 0
                              ? "font-semibold text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {row.overdue}
                        </td>
                        <td className="px-6 py-4">
                          {row.completionPercent === null ? (
                            <span className="text-muted-foreground">Nobody assigned</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    complianceMeterClass(row.completionPercent),
                                  )}
                                  style={{ width: `${row.completionPercent}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-foreground">
                                {row.completionLabel}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="block tabular-nums text-foreground">
                            {row.averageScoreLabel}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {row.scoredLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* --- Staff compliance ------------------------------------------ */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Staff compliance
              </p>
              <h2 className="mt-2 text-xl font-bold text-foreground">Where each person stands</h2>
            </div>
            <button
              onClick={() => exportCsv(data.staffCsv, "staff-compliance")}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs">
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Staff member
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Phase
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      Modules
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      Overdue
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Compliance
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                      CPTD
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Last active
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.staff.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">
                        {data.phases.length === 0
                          ? "No active staff yet."
                          : "No active staff in this phase."}
                      </td>
                    </tr>
                  ) : (
                    data.staff.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-6 py-4">
                          <Link to={row.href} className="group flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                              {row.initials}
                            </span>
                            <span>
                              <span className="block font-semibold text-foreground group-hover:text-gold">
                                {row.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {row.jobTitle}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                          {row.phaseName}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right tabular-nums text-foreground">
                          {row.progressLabel}
                        </td>
                        <td
                          className={cn(
                            "px-6 py-4 text-right tabular-nums",
                            row.overdue > 0
                              ? "font-semibold text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {row.overdue}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  complianceMeterClass(row.compliancePercent),
                                )}
                                style={{ width: `${row.compliancePercent}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-foreground">
                              {row.complianceLabel}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-foreground">
                          {row.cptdPoints}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                          {row.lastActiveLabel}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <p className="flex items-start gap-2 pb-4 text-xs text-muted-foreground">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Every figure is counted from live enrollment records when this page loads. There is no
          stored history behind it, so these are today&rsquo;s numbers rather than a trend.
        </p>
      </div>
    </AdminShell>
  );
}
