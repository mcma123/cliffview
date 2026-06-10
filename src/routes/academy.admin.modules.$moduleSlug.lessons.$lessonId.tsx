import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { academyQueries } from "@/infrastructure/academy/container";
import { ArrowLeft, Eye, FileText, Headphones, Plus, Upload, Video } from "lucide-react";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/lessons/$lessonId")({
  head: () => ({ meta: [{ title: "Lesson Editor · Cliffview Academy" }] }),
  loader: ({ params }) => academyQueries.getAdminLessonDetail(params.moduleSlug, params.lessonId),
  component: AdminLessonEditor,
});

function AdminLessonEditor() {
  const data = Route.useLoaderData();

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
          <Link
            to={data.previewPath}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            <Eye className="h-4 w-4" /> Preview lesson
          </Link>
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
                    defaultValue={data.durationLabel}
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
                  defaultValue={data.scenarioTitle}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Scenario body
                </span>
                <textarea
                  defaultValue={data.scenarioBody}
                  className="min-h-36 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reflection prompt
                </span>
                <textarea
                  defaultValue={data.reflectionPrompt}
                  className="min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Media placeholder
              </p>
              <div className="mt-5 rounded-2xl border border-dashed border-border bg-background p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    {data.kind === "audio" ? (
                      <Headphones className="h-6 w-6" />
                    ) : (
                      <Video className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{data.mediaTitle}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{data.mediaDescription}</p>
                    <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                      <Upload className="h-4 w-4" /> Replace placeholder
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Upload zones</p>
              <div className="mt-5 space-y-3">
                {data.uploadZones.map((zone) => (
                  <div
                    key={zone.title}
                    className="rounded-2xl border border-dashed border-border bg-background p-5"
                  >
                    <h3 className="font-semibold text-foreground">{zone.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{zone.description}</p>
                  </div>
                ))}
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
            <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
              <Plus className="h-4 w-4" /> Add resource
            </button>
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
                      resource.status === "published"
                        ? "bg-success/15 text-success"
                        : "bg-gold-soft text-primary-deep"
                    }`}
                  >
                    {resource.status}
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
