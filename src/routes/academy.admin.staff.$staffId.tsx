import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CheckCircle, Clock } from "lucide-react";
import { academyQueries } from "@/infrastructure/academy/container";
import { AdminShell } from "@/components/admin-shell";

export const Route = createFileRoute("/academy/admin/staff/$staffId")({
  component: AdminStaffDetailComponent,
  loader: ({ params }) => academyQueries.getAdminStaffDetail(params.staffId),
});

function AdminStaffDetailComponent() {
  const data = Route.useLoaderData();

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500">
        <Link
          to="/academy/admin/staff"
          className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-gold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Staff Directory
        </Link>

        <header className="flex flex-col sm:flex-row gap-6 items-start sm:items-center rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-black text-primary-foreground">
            {data.initials}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-black tracking-tight text-foreground">{data.name}</h1>
            <p className="mt-1 text-lg font-medium text-muted-foreground">
              {data.role} · {data.phase}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-start sm:items-end w-full sm:w-auto mt-4 sm:mt-0">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Compliance Rating
            </p>
            <div className="flex items-center gap-4 w-full">
              <div className="h-3 flex-1 w-full sm:w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    data.compliancePercent >= 80 ? "bg-success" : data.compliancePercent >= 50 ? "bg-gold" : "bg-destructive"
                  }`}
                  style={{ width: `${data.compliancePercent}%` }}
                />
              </div>
              <span className="text-2xl font-black text-foreground">{data.compliancePercent}%</span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          {data.stats.map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-black text-foreground">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gold" />
            Module Development Tracker
          </h2>
          
          <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Module Name
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Category
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Score
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Last Accessed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.modules.map((mod) => (
                    <tr key={mod.moduleSlug} className="group transition-colors hover:bg-muted/40">
                      <td className="px-6 py-4">
                        <Link to={mod.href} className="font-bold text-foreground hover:text-primary transition-colors">
                          {mod.moduleTitle}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                        {mod.category}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2">
                          {mod.status === "complete" ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : mod.status === "in-progress" ? (
                            <Clock className="h-4 w-4 text-gold" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                          )}
                          <span className="font-semibold text-foreground capitalize">
                            {mod.status.replace("-", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-bold text-foreground">
                        {mod.score ? `${mod.score}%` : "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                        {mod.lastAccessedLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
