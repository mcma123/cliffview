import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Search, CheckCircle2, Lock, Play, Circle } from "lucide-react";

export const Route = createFileRoute("/academy/modules")({
  head: () => ({ meta: [{ title: "Module Library · Cliffview Academy" }] }),
  component: Modules,
});

const tabs = [
  { label: "All Modules", count: 12, active: true },
  { label: "Core Policies", count: 5 },
  { label: "SMT Pathway", count: 4 },
  { label: "Staff Development", count: 3 },
];

type Status = "complete" | "in-progress" | "available" | "locked";
const modules: { n: string; title: string; meta: string; progress: number; status: Status; slug?: string }[] = [
  { n: "01", title: "School Code of Conduct", meta: "5 sections · 30 min", progress: 100, status: "complete" },
  { n: "02", title: "Social Media Awareness", meta: "4 sections · 25 min", progress: 65, status: "in-progress", slug: "social-media-awareness" },
  { n: "03", title: "Learner Discipline", meta: "4 sections · 25 min", progress: 0, status: "available" },
  { n: "04", title: "Health & Safety", meta: "3 sections · 20 min", progress: 0, status: "locked" },
  { n: "05", title: "Safeguarding & Reporting", meta: "5 sections · 35 min", progress: 0, status: "locked" },
  { n: "06", title: "Disciplinary Hearings", meta: "6 sections · 45 min", progress: 0, status: "locked" },
  { n: "07", title: "SASA & BELA Compliance", meta: "5 sections · 40 min", progress: 0, status: "locked" },
  { n: "08", title: "Responsible AI Usage", meta: "4 sections · 30 min", progress: 0, status: "locked" },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === "complete")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    );
  if (status === "in-progress")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
        <Play className="h-3 w-3" /> In Progress
      </span>
    );
  if (status === "locked")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Lock className="h-3 w-3" /> Locked
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
      <Circle className="h-3 w-3" /> Available
    </span>
  );
}

function Modules() {
  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Module Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            12 modules across 3 pathways. Complete in order.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input placeholder="Search modules…" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.label}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                t.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {t.label} — {t.count}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((m) => {
            const locked = m.status === "locked";
            const featured = m.status === "in-progress";
            const inner = (
              <div
                className={`rounded-2xl border p-5 transition-all ${
                  featured
                    ? "border-primary bg-card shadow-lg shadow-primary/10"
                    : locked
                      ? "border-border bg-muted/30 opacity-70"
                      : "border-border bg-card hover:border-primary hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Module {m.n}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-foreground">{m.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{m.meta}</p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold">{m.progress}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${featured ? "bg-gradient-to-r from-primary to-gold" : "bg-primary/70"}`}
                      style={{ width: `${m.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
            return m.slug ? (
              <Link key={m.n} to="/academy/modules/social-media-awareness">
                {inner}
              </Link>
            ) : (
              <div key={m.n}>{inner}</div>
            );
          })}
        </div>
      </div>
    </StaffShell>
  );
}