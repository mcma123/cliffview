import { Link, createFileRoute } from "@tanstack/react-router";
import { Users, TrendingUp, Award, Search, ChevronRight } from "lucide-react";
import { academyQueries } from "@/infrastructure/academy/container";
import { AdminShell } from "@/components/admin-shell";

export const Route = createFileRoute("/academy/admin/staff/")({
  component: AdminStaffIndexComponent,
  loader: () => academyQueries.getAdminStaffDirectory(),
});

function AdminStaffIndexComponent() {
  const data = Route.useLoaderData();

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Staff Management
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Staff Directory
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Monitor staff progress, module completions, and compliance across all phases.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search staff..."
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm font-medium text-foreground outline-none transition-colors hover:border-gold focus:border-gold focus:ring-1 focus:ring-gold"
            />
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Total Staff
              </p>
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">{data.summary.totalStaff}</p>
            <p className="mt-1 text-sm font-medium text-success">Active platform users</p>
          </article>

          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft">
                <TrendingUp className="h-5 w-5 text-gold" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Avg. Compliance
              </p>
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">{data.summary.avgCompliance}%</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Across all modules</p>
          </article>

          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15">
                <Award className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                High Performers
              </p>
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">{data.summary.highPerformers}</p>
            <p className="mt-1 text-sm font-medium text-success">Staff with &gt; 80% compliance</p>
          </article>
        </section>

        <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Staff Member
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Role & Phase
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Compliance
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Modules
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Last Active
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.directory.map((staff) => (
                  <tr key={staff.id} className="group transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                          {staff.name[0]}
                        </div>
                        <p className="font-bold text-foreground">{staff.name}</p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <p className="font-medium text-foreground">{staff.role}</p>
                      <p className="text-xs text-muted-foreground">{staff.phase}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              staff.compliancePercent >= 80 ? "bg-success" : staff.compliancePercent >= 50 ? "bg-gold" : "bg-destructive"
                            }`}
                            style={{ width: `${staff.compliancePercent}%` }}
                          />
                        </div>
                        <span className="font-bold text-foreground">{staff.compliancePercent}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-foreground">
                      {staff.completedModulesCount} / {staff.totalAssignedModules}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                      {staff.recentActivityLabel}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <Link
                        to={staff.href}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background border border-border text-foreground transition-colors hover:border-gold hover:text-gold"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
