import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Circle, Clock, Play, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { presentLearnerModules } from "@/application/academy/presenters";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { api } from "../../convex/_generated/api";

/**
 * The learner's module library: everything assigned to them, and nothing else.
 *
 * There is deliberately no "locked" or "available but not assigned" state. An
 * enrollment row IS the entitlement, so a module either appears here because
 * an admin assigned it, or it does not appear at all.
 *
 * Client-rendered with no loader prefetch — `learn.myModules` is
 * `requireStaff` and there is no identity on the server.
 */
export const Route = createFileRoute("/academy/modules/")({
  head: () => ({ meta: [{ title: "My Modules · Cliffview Academy" }] }),
  component: ModuleLibrary,
});

function StatusPill({ status, label }: { status: string; label: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
        <CheckCircle2 className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
        <Play className="h-3 w-3" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
      <Circle className="h-3 w-3" /> {label}
    </span>
  );
}

function ModuleLibrary() {
  const gate = useStaffViewer();
  const now = Date.now();
  const [search, setSearch] = useState("");

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.myModules, {}),
    enabled: gate.status === "ready",
    retry: false,
  });

  const view = data === undefined ? null : presentLearnerModules(data, now);
  const visible = useMemo(() => {
    if (view === null) return [];
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return view.modules;
    return view.modules.filter(
      (module) =>
        module.title.toLowerCase().includes(needle) ||
        module.category.toLowerCase().includes(needle),
    );
  }, [view, search]);

  if (gate.status === "loading" || (gate.status === "ready" && isPending)) {
    return (
      <StaffShell>
        <PageNotice title="Loading your modules…" />
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
  if (view === null || error !== null) {
    return (
      <StaffShell>
        <PageNotice
          title="We could not load your modules"
          body={error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, "") : undefined}
        />
      </StaffShell>
    );
  }

  return (
    <StaffShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">My Modules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.modules.length === 0
                ? "Nothing has been assigned to you yet."
                : `${view.modules.length} assigned to you.`}
            </p>
          </div>
          {view.modules.length === 0 ? null : (
            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search my modules"
                className="w-full rounded-2xl border border-input bg-background py-2.5 pl-11 pr-4 text-sm outline-none focus:border-primary"
              />
            </label>
          )}
        </header>

        {view.modules.length === 0 ? (
          <PageNotice
            title="No modules assigned yet"
            body="An SMT administrator assigns your training. Once they do, it appears here."
            action={{ label: "Back to dashboard", to: "/academy/dashboard" }}
          />
        ) : visible.length === 0 ? (
          <PageNotice title="No module matches that search" />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((module) => (
              <Link
                key={module.id}
                to="/academy/modules/$moduleSlug"
                params={{ moduleSlug: module.slug }}
                className="group flex flex-col rounded-3xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {module.number}
                  </span>
                  <StatusPill status={module.status} label={module.statusLabel} />
                </div>
                <h2 className="mt-3 text-lg font-bold text-foreground">{module.title}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{module.description}</p>

                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {module.durationMinutes} min
                  </span>
                  <span>·</span>
                  <span>{module.lessonsLabel}</span>
                  {module.dueLabel === null ? null : (
                    <>
                      <span>·</span>
                      <span className={module.dueLabel === "Overdue" ? "text-destructive" : ""}>
                        {module.dueLabel}
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${module.progressPercent}%` }}
                  />
                </div>

                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {module.status === "not_started" ? "Start module" : "Continue"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StaffShell>
  );
}
