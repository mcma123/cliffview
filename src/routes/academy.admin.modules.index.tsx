import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { presentAdminModuleLibrary } from "@/application/academy/presenters";
import { api } from "../../convex/_generated/api";
import { BookOpen, FileText, Plus, Search, Sparkles, Video } from "lucide-react";

export const Route = createFileRoute("/academy/admin/modules/")({
  head: () => ({ meta: [{ title: "Module Admin · Cliffview Academy" }] }),
  // No loader prefetch: Convex Auth keeps its token in localStorage, so there
  // is no identity on the server and a prefetched gated query would be held
  // forever. This screen is client-rendered behind the admin gate.
  loader: () => ({ now: Date.now() }),
  component: AdminModuleLibrary,
});

function AdminModuleLibrary() {
  const viewer = useAdminViewer();
  const { now } = Route.useLoaderData();
  // Live subscription on the client: an edit elsewhere repaints this grid with
  // no refetch code.
  const { data: rows } = useSuspenseQuery(convexQuery(api.modules.listForAdmin, {}));
  const data = presentAdminModuleLibrary(rows, now);

  return (
    <AdminShell viewer={viewer}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
              Content management
            </p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">Module content studio</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{data.summary}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:w-[340px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search modules, lessons, or assets..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <Link
              to="/academy/admin/modules/create"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              <Plus className="h-4 w-4" /> Create module
            </Link>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Link
            to="/academy/admin/modules/create"
            className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-primary-deep to-[#173650] p-6 text-primary-foreground shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                  Quick start
                </p>
                <h2 className="mt-2 text-2xl font-bold">Create a new module blueprint</h2>
                <p className="mt-3 max-w-2xl text-sm text-primary-foreground/85">
                  Start with module naming, audience, outcome, lesson structure, and placeholder
                  uploads for video, audio, and docs.
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep">
                <Sparkles className="h-6 w-6" />
              </div>
            </div>
          </Link>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Demo preview</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">
              Parent Communication Protocol
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              A mock module that demonstrates how admin-side content design appears on the academy
              side for staff.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/academy/admin/modules/$moduleSlug"
                params={{ moduleSlug: "parent-communication-protocol" }}
                className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Open editor
              </Link>
              <Link
                to="/academy/modules/$moduleSlug"
                params={{ moduleSlug: "parent-communication-protocol" }}
                className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                Open learner preview
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.modules.map((module) => (
            <Link
              key={module.id}
              to={module.href}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">
                    Module {module.number}
                  </p>
                  <h2 className="mt-3 text-2xl font-bold text-foreground">{module.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{module.category}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    module.publishState === "published"
                      ? "bg-success/15 text-success"
                      : module.publishState === "draft"
                        ? "bg-gold-soft text-primary-deep"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {module.publishLabel}
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-background p-4">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-2xl font-bold text-foreground">{module.lessonCount}</p>
                  <p className="text-xs text-muted-foreground">Lessons</p>
                </div>
                <div className="rounded-2xl bg-background p-4">
                  <Video className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-2xl font-bold text-foreground">{module.assetCount}</p>
                  <p className="text-xs text-muted-foreground">Assets</p>
                </div>
                <div className="rounded-2xl bg-background p-4">
                  <FileText className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-foreground">
                    {module.updatedLabel}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
