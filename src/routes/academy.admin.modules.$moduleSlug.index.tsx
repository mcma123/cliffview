import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { presentAdminModuleDetail } from "@/application/academy/presenters";
import { api } from "../../convex/_generated/api";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  FileText,
  GripVertical,
  Headphones,
  Plus,
  Settings2,
  Upload,
  Video,
} from "lucide-react";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";
import { AddLessonDialog } from "@/components/add-lesson-dialog";
import { AttachContentDialog } from "@/components/attach-content-dialog";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/")({
  head: () => ({ meta: [{ title: "Edit Module · Cliffview Academy" }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.modules.adminDetail, { slug: params.moduleSlug }),
    );
    return { now: Date.now() };
  },
  component: AdminModuleDetail,
});

function AdminModuleDetail() {
  const { moduleSlug } = Route.useParams();
  const { now } = Route.useLoaderData();
  const { data: detail } = useSuspenseQuery(
    convexQuery(api.modules.adminDetail, { slug: moduleSlug }),
  );
  const data = presentAdminModuleDetail(detail, now);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/academy/admin/modules"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to modules
            </Link>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-gold">
              {data.moduleNumberLabel}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">{data.title}</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{data.description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={data.previewPath}
              className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Preview learner side
            </Link>
            <span
              className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider ${
                data.publishState === "published"
                  ? "bg-success/15 text-success"
                  : data.publishState === "draft"
                    ? "bg-gold-soft text-primary-deep"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {data.publishLabel}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
                <Settings2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                  Module settings
                </p>
                <h2 className="mt-1 text-2xl font-bold text-foreground">
                  Edit learner-facing content
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Module name
                </span>
                <input
                  defaultValue={data.title}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Audience
                </span>
                <input
                  defaultValue={data.audience}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Outcome
              </span>
              <textarea
                defaultValue={data.outcome}
                className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Learner-facing description
              </span>
              <textarea
                defaultValue={data.description}
                className="min-h-32 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>

            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold">
                    Learning objectives
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    These cards appear directly on the academy-side module page.
                  </p>
                </div>
                <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                  <Plus className="h-4 w-4" /> Add objective
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {data.objectives.map((objective) => (
                  <div
                    key={objective.id}
                    className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
                  >
                    {objective.text}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Hero media</p>
              <div className="mt-5 rounded-2xl border border-dashed border-border bg-background p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    {data.featuredMedia?.kind === "audio" ? (
                      <Headphones className="h-6 w-6" />
                    ) : (
                      <Video className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{data.featuredMedia?.title}</h3>
                    <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                      {data.featuredMedia?.kind} · {data.featuredMedia?.meta}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {data.featuredMedia?.description}
                    </p>
                    <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                      <Upload className="h-4 w-4" /> Replace placeholder
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Asset placeholders
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                One zone per real asset on this module. Uploading is wired in a later phase, so
                these report the current file state rather than accepting a file.
              </p>
              <div className="mt-5 space-y-3">
                {data.resources.map((asset) => (
                  <DragAndDropZone
                    key={asset.id}
                    title={asset.title}
                    description={`${asset.kind} - ${asset.hasFile ? asset.meta : "No file attached"}`}
                    icon={Upload}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Lesson builder
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                Module flow and content blocks
              </h2>
            </div>
            <AddLessonDialog>
              <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
                <Plus className="h-4 w-4" /> Add lesson
              </button>
            </AddLessonDialog>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-border bg-background px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold">
                  Reorder lessons
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Drag styling is visual only for now. Use the move controls as placeholder actions
                  until persistence is wired up.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground">
                <GripVertical className="h-4 w-4 text-muted-foreground" /> Drag-and-drop preview
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {data.lessons.map((lesson, index) => (
              <div key={lesson.id} className="relative">
                {index < data.lessons.length - 1 && (
                  <div className="absolute left-[31px] top-16 hidden h-[calc(100%+10px)] w-px bg-border lg:block" />
                )}

                <div className="grid gap-4 lg:grid-cols-[50px_1fr]">
                  <div className="hidden lg:flex">
                    <div className="flex w-full flex-col items-center gap-2 pt-4">
                      <button
                        className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted"
                        aria-label={`Move ${lesson.title} up`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-muted-foreground">
                        <GripVertical className="h-5 w-5" />
                      </div>
                      <button
                        className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted"
                        aria-label={`Move ${lesson.title} down`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft font-bold text-primary">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                            Lesson order slot {index + 1}
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-foreground">
                            {lesson.title}
                          </h3>
                          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                            {lesson.kind} · {lesson.durationLabel}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                            lesson.publishState === "published"
                              ? "bg-success/15 text-success"
                              : lesson.publishState === "draft"
                                ? "bg-gold-soft text-primary-deep"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {lesson.publishLabel}
                        </span>
                        <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {lesson.attachedAssets} assets
                        </span>
                      </div>
                    </div>

                    <textarea
                      defaultValue={lesson.summary}
                      className="mt-4 min-h-24 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none"
                    />

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border px-3 py-1">
                          {lesson.durationLabel}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          reorder-ready UI
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted lg:hidden">
                          <ArrowUp className="h-4 w-4" /> Up
                        </button>
                        <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted lg:hidden">
                          <ArrowDown className="h-4 w-4" /> Down
                        </button>
                        <Link
                          to={lesson.href}
                          className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                        >
                          Open lesson editor
                        </Link>
                        <AttachContentDialog defaultTitle={lesson.title}>
                          <button className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                            Attach content
                          </button>
                        </AttachContentDialog>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Linked resources
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                Documents, worksheets, and media
              </h2>
            </div>
            <button className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
              Add placeholder asset
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.resources.map((resource) => (
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
                <p className="mt-3 text-sm text-muted-foreground">{resource.description}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      resource.publishState === "published"
                        ? "bg-success/15 text-success"
                        : "bg-gold-soft text-primary-deep"
                    }`}
                  >
                    {resource.publishLabel}
                  </span>
                  <Link
                    to={resource.href}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Edit asset <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
