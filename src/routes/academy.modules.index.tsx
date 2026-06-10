import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import type { ModuleStatus } from "@/domain/academy/entities";
import { academyQueries } from "@/infrastructure/academy/container";
import { ArrowRight, CheckCircle2, Circle, Lock, Play, Search, Sparkles } from "lucide-react";

export const Route = createFileRoute("/academy/modules/")({
  head: () => ({ meta: [{ title: "Module Library · Cliffview Academy" }] }),
  loader: () => academyQueries.getModuleLibrary(),
  component: Modules,
});

function StatusBadge({ status }: { status: ModuleStatus }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    );
  }
  if (status === "in-progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
        <Play className="h-3 w-3" /> In Progress
      </span>
    );
  }
  if (status === "locked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Lock className="h-3 w-3" /> Locked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
      <Circle className="h-3 w-3" /> Available
    </span>
  );
}

function Modules() {
  const data = Route.useLoaderData();

  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Module Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.summary}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search modules..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.tabs.map((tab) => (
            <button
              key={tab.label}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                tab.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {tab.label} — {tab.count}
            </button>
          ))}
        </div>

        {data.featuredModule && (
          <Link
            to={data.featuredModule.href}
            className="block overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-primary-deep to-[#173650] text-primary-foreground shadow-xl transition-transform hover:-translate-y-0.5"
          >
            <div className="grid gap-6 p-7 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-gold px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-deep">
                  <Sparkles className="h-3.5 w-3.5" /> Featured demo module
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.35em] text-gold">
                  {data.featuredModule.category}
                </p>
                <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{data.featuredModule.title}</h2>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-primary-foreground/85">
                  {data.featuredModule.description}
                </p>
                <div className="mt-6 flex flex-wrap gap-3 text-xs text-primary-foreground/80">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    {data.featuredModule.meta}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    {data.featuredModule.audience}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    {data.featuredModule.lastUpdatedLabel}
                  </span>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/6 p-6 backdrop-blur">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                    New in the portal
                  </p>
                  <p className="mt-3 text-sm text-primary-foreground/80">
                    A polished learner-side demo showing how admin-authored lessons, media, and docs
                    will appear once content is created in the builder.
                  </p>
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-primary-foreground/75">
                    <span className="font-semibold text-white">
                      {data.featuredModule.progressPercent}% complete
                    </span>
                    <span>Preview-ready</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold to-[#f5d16c]"
                      style={{ width: `${Math.max(18, data.featuredModule.progressPercent)}%` }}
                    />
                  </div>
                  <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-primary-deep">
                    Open demo module <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.modules.map((module) => {
            const locked = module.status === "locked";
            const featured = module.status === "in-progress";
            const inner = (
              <div
                className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border p-6 transition-all duration-300 ease-in-out ${
                  featured
                    ? "border-primary bg-gradient-to-br from-card to-primary/5 shadow-xl shadow-primary/10 hover:-translate-y-1 hover:shadow-primary/20"
                    : locked
                      ? "border-border bg-muted/20 opacity-70 grayscale"
                      : "border-border bg-card hover:-translate-y-1 hover:border-primary/50 hover:bg-gradient-to-br hover:from-card hover:to-primary/5 hover:shadow-xl"
                }`}
              >
                {/* Decorative background element for hover */}
                {!locked && (
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                )}

                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-primary/70">
                      Module {module.number}
                    </p>
                    <StatusBadge status={module.status} />
                  </div>
                  <h3 className="mt-3 text-xl font-bold text-foreground transition-colors group-hover:text-primary">
                    {module.title}
                  </h3>
                  <p className="mt-2 text-xs font-medium text-muted-foreground line-clamp-2">
                    {module.meta}
                  </p>
                </div>
                
                <div className="mt-8">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-bold text-foreground">{module.progressPercent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        featured ? "bg-gradient-to-r from-primary to-gold" : "bg-primary/70 group-hover:bg-primary"
                      }`}
                      style={{ width: `${module.progressPercent}%` }}
                    />
                  </div>
                  {!locked && (
                    <div className="mt-5 flex items-center gap-2 text-xs font-bold text-primary opacity-0 transition-all duration-300 group-hover:opacity-100">
                      View lessons <ArrowRight className="h-3 w-3 -translate-x-2 transition-transform duration-300 group-hover:translate-x-0" />
                    </div>
                  )}
                </div>
              </div>
            );

            return locked ? (
              <div key={module.number} className="h-full">{inner}</div>
            ) : (
              <Link key={module.number} to={module.href} className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-3xl">
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </StaffShell>
  );
}
