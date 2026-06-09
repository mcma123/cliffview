import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { Users, BookOpen, TrendingUp, Sparkles, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/academy/admin")({
  head: () => ({ meta: [{ title: "SMT Admin · Cliffview Academy" }] }),
  component: AdminOverview,
});

const stats = [
  { label: "Total Staff", value: "42", sub: "+2 active accounts", icon: Users },
  { label: "Modules Completed", value: "127", sub: "+18 this month", icon: BookOpen },
  { label: "Avg. Compliance", value: "73%", sub: "+5% across all staff", icon: TrendingUp },
  { label: "Pending AI Review", value: "8", sub: "Action questions queued", icon: Sparkles, action: true },
];

const phases = [
  { name: "Foundation Phase", pct: 82 },
  { name: "Intersen Phase", pct: 68 },
  { name: "Senior Management", pct: 91 },
  { name: "Support Staff", pct: 55 },
];

const chart = [
  { m: "Dec", v: 12 },
  { m: "Jan", v: 28 },
  { m: "Feb", v: 45 },
  { m: "Mar", v: 67 },
  { m: "Apr", v: 109 },
  { m: "May", v: 127 },
];
const max = Math.max(...chart.map((c) => c.v));

function AdminOverview() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Compliance Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Wednesday, 19 May 2026 · <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Live data</span>
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            Last 30 days <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl border p-5 shadow-sm ${
                s.action ? "border-gold/50 bg-gold-soft/40" : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </p>
                <s.icon className={`h-4 w-4 ${s.action ? "text-gold" : "text-primary"}`} />
              </div>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
              {s.action && (
                <Link to="/academy/admin/ai-review" className="mt-3 inline-block text-xs font-semibold text-gold hover:underline">
                  Review queue →
                </Link>
              )}
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Phase compliance */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">Completion by Phase</p>
            <div className="mt-5 space-y-4">
              {phases.map((p) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="font-bold text-foreground">{p.pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Modules Completed · Last 6 Months
            </p>
            <div className="mt-6 flex h-48 items-end gap-3">
              {chart.map((c) => (
                <div key={c.m} className="flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-primary to-primary/70 transition-all hover:from-gold hover:to-gold/70"
                      style={{ height: `${(c.v / max) * 100}%` }}
                    />
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-foreground">
                      {c.v}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">{c.m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}