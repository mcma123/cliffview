import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModuleDeletionImpact } from "@/components/module-deletion-impact";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { presentAdminModuleLibrary } from "@/application/academy/presenters";
import { errorMessage } from "@/lib/convex-error";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BookOpen, FileText, Plus, Search, Sparkles, Trash2, Video } from "lucide-react";

/**
 * What an admin types to clear the library.
 *
 * The same string the server checks. A hidden button is not a guard, so
 * `modules.removeAll` refuses anything else regardless of what this screen
 * sends.
 */
const DELETE_ALL_PHRASE = "delete every module";

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

  const removeModule = useMutation({ mutationFn: useConvexMutation(api.modules.remove) });
  const removeAll = useMutation({ mutationFn: useConvexMutation(api.modules.removeAll) });

  /** Run a mutation, surfacing the server message rather than a generic toast. */
  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (caught) {
      // The server's own sentence: "Staff are enrolled in this module",
      // "The library has 11 modules now". All more useful than a failure.
      toast.error(errorMessage(caught, "That did not work."));
      // Rethrown so the dialog stays open on a refusal rather than closing as
      // though it had worked.
      throw caught;
    }
  }

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

            {data.moduleCount === 0 ? null : (
              <ConfirmDialog
                icon={Trash2}
                title="Delete every module"
                description={`Removes all ${data.moduleCount} modules and everything inside them.`}
                confirmPhrase={DELETE_ALL_PHRASE}
                confirmLabel="Delete everything"
                body={
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Lessons, files, objectives and question banks all go. A module somebody is
                      enrolled in is <strong className="text-foreground">skipped</strong> — clear
                      those one at a time from their own card, where you can see who is affected.
                    </p>
                    <p>This cannot be undone.</p>
                  </div>
                }
                onConfirm={() =>
                  run("Deleting. The library empties as it goes.", () =>
                    removeAll.mutateAsync({
                      confirm: DELETE_ALL_PHRASE,
                      expectedModuleCount: data.moduleCount,
                    }),
                  )
                }
              >
                <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> Delete all
                </button>
              </ConfirmDialog>
            )}
          </div>
        </div>

        <Link
          to="/academy/admin/modules/create"
          className="block rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-primary-deep to-[#173650] p-6 text-primary-foreground shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Quick start</p>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.modules.map((module) => (
            // A div wrapping the link, rather than the whole card being one.
            // The card used to be a single `<Link>`, and a button nested in an
            // anchor navigates when clicked — so Delete would have opened the
            // editor instead of asking anything.
            <div
              key={module.id}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <Link to={module.href} className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">
                    Module {module.number}
                  </p>
                  <h2 className="mt-3 text-2xl font-bold text-foreground">{module.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{module.category}</p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
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

                  <ConfirmDialog
                    icon={Trash2}
                    title={`Delete ${module.title}`}
                    description="The module and everything inside it are removed for good."
                    // The module's own slug, not a generic word: a confirmation
                    // that names which module cannot be given to the wrong one.
                    confirmPhrase={module.slug}
                    confirmLabel="Delete module"
                    body={<ModuleDeletionImpact moduleId={module.id as Id<"modules">} />}
                    onConfirm={() =>
                      run(`${module.title} deleted.`, () =>
                        removeModule.mutateAsync({
                          moduleId: module.id as Id<"modules">,
                          deleteEnrollments: true,
                          confirm: module.slug,
                        }),
                      )
                    }
                  >
                    <button
                      aria-label={`Delete ${module.title}`}
                      className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </ConfirmDialog>
                </div>
              </div>

              <Link to={module.href} className="mt-6 grid gap-3 sm:grid-cols-3">
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
              </Link>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
