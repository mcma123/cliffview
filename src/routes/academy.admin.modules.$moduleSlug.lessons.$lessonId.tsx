import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { presentAdminLessonDetail } from "@/application/academy/presenters";
import { api } from "../../convex/_generated/api";
import { ArrowLeft, Eye, FileText, Headphones, Plus, Upload, Video, Save } from "lucide-react";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";
import { AttachContentDialog } from "@/components/attach-content-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/lessons/$lessonId")({
  head: () => ({ meta: [{ title: "Lesson Editor · Cliffview Academy" }] }),
  loader: async ({ context, params }) => {
    // $lessonId now carries the module-scoped lesson slug, which is what the
    // seeded slugs are, so existing lesson URLs keep working.
    await context.queryClient.ensureQueryData(
      convexQuery(api.lessons.adminDetail, {
        moduleSlug: params.moduleSlug,
        lessonSlug: params.lessonId,
      }),
    );
    return null;
  },
  component: AdminLessonEditor,
});

function AdminLessonEditor() {
  const { moduleSlug, lessonId } = Route.useParams();
  const { data: detail } = useSuspenseQuery(
    convexQuery(api.lessons.adminDetail, { moduleSlug, lessonSlug: lessonId }),
  );
  const data = presentAdminLessonDetail(detail);

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to={data.modulePath}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to module editor
            </Link>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-gold">
              {data.lessonOrderLabel}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">{data.lessonTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Dedicated lesson editor for content blocks, media placeholders, and learner-facing
              copy.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to={data.previewPath}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Eye className="h-4 w-4" /> Preview
            </Link>
            <button
              onClick={() => toast.success("Lesson content saved successfully")}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Lesson content</p>
            <div className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Lesson title
                </span>
                <input
                  defaultValue={data.lessonTitle}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Lesson type
                  </span>
                  <div className="rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground">
                    {data.kind}
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Duration label
                  </span>
                  <input
                    defaultValue={data.durationMinutes ?? ""}
                    placeholder="Minutes, e.g. 7"
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Summary
                </span>
                <textarea
                  defaultValue={data.summary}
                  className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Scenario title
                </span>
                <input
                  defaultValue={data.scenarioTitle ?? ""}
                  placeholder="Optional. Add a scenario title for this lesson."
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Scenario body
                </span>
                <textarea
                  defaultValue={data.scenarioBody ?? ""}
                  placeholder="Optional. Describe the scenario staff should work through."
                  className="min-h-36 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reflection prompt
                </span>
                <textarea
                  defaultValue={data.reflectionPrompt ?? ""}
                  placeholder="Optional. Add the reflection prompt shown beneath the media block."
                  className="min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Hero media</p>
              <div className="mt-5">
                <DragAndDropZone
                  title={data.heroTitle ?? "No hero media set"}
                  description={
                    data.heroDescription ?? "Attach an asset to use as this lesson hero."
                  }
                  icon={data.kind === "audio" ? Headphones : Video}
                  onUpload={() => toast.success("Hero media updated successfully")}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Upload zones</p>
              <div className="mt-5 space-y-3">
                {data.linkedResources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No resources are attached to this lesson yet.
                  </p>
                ) : (
                  data.linkedResources.map((asset) => (
                    <DragAndDropZone
                      key={asset.id}
                      title={asset.title}
                      description={`${asset.kind} - ${asset.meta}`}
                      icon={Upload}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Linked resources
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                Documents and supporting files
              </h2>
            </div>
            <AttachContentDialog defaultTitle={data.lessonTitle}>
              <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
                <Plus className="h-4 w-4" /> Add resource
              </button>
            </AttachContentDialog>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.linkedResources.map((resource) => (
              <div key={resource.id} className="rounded-2xl border border-border bg-background p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{resource.title}</h3>
                    <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                      {resource.kind} · {resource.meta}
                    </p>
                  </div>
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      resource.publishState === "published"
                        ? "bg-success/15 text-success"
                        : "bg-gold-soft text-primary-deep"
                    }`}
                  >
                    {resource.publishLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
