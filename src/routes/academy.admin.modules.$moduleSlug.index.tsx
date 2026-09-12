import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { presentAdminModuleDetail } from "@/application/academy/presenters";
import { MODULE_CATEGORIES, type ModuleCategory } from "@/domain/academy/entities";
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
  Target,
  Upload,
  Video,
} from "lucide-react";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";
import { useAssetUploads } from "@/hooks/use-asset-upload";
import { AddLessonDialog } from "@/components/add-lesson-dialog";
import { AddObjectiveDialog } from "@/components/add-objective-dialog";
import { AttachContentDialog } from "@/components/attach-content-dialog";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/")({
  head: () => ({ meta: [{ title: "Edit Module · Cliffview Academy" }] }),
  // No loader prefetch: Convex Auth keeps its token in localStorage, so there
  // is no identity on the server and a prefetched gated query would be held
  // forever. This screen is client-rendered behind the admin gate.
  loader: () => ({ now: Date.now() }),
  component: AdminModuleDetail,
});

function AdminModuleDetail() {
  const { moduleSlug } = Route.useParams();
  const { now } = Route.useLoaderData();
  const { data: detail } = useSuspenseQuery(
    convexQuery(api.modules.adminDetail, { slug: moduleSlug }),
  );
  const data = presentAdminModuleDetail(detail, now);

  const moduleId = detail.module._id;
  const updateModule = useMutation({ mutationFn: useConvexMutation(api.modules.update) });
  const publishModule = useMutation({ mutationFn: useConvexMutation(api.modules.publish) });
  const setModuleState = useMutation({
    mutationFn: useConvexMutation(api.modules.setPublishState),
  });
  const addObjective = useMutation({ mutationFn: useConvexMutation(api.objectives.add) });
  const removeObjective = useMutation({ mutationFn: useConvexMutation(api.objectives.remove) });
  const moveLesson = useMutation({ mutationFn: useConvexMutation(api.lessons.move) });
  const createLesson = useMutation({ mutationFn: useConvexMutation(api.lessons.create) });
  const createAsset = useMutation({ mutationFn: useConvexMutation(api.assets.create) });
  const attachAsset = useMutation({ mutationFn: useConvexMutation(api.lessons.attachAsset) });
  // One instance for the screen, keyed by asset id, because this page renders a
  // zone per asset and a hook call per zone would break the rules of hooks the
  // moment an asset was added or removed.
  const uploads = useAssetUploads();

  /**
   * The module's assets in the picker's shape, for one lesson.
   *
   * Per-lesson because `alreadyAttached` is: this used to be a single list with
   * `alreadyAttached` hardcoded to `false`, so the picker offered assets the
   * lesson already had and attaching one silently did nothing. Building it here
   * keeps the dialog prop-driven and free of any Convex import.
   */
  const attachableFor = (attachedAssetIds: ReadonlyArray<string>) => {
    const attached = new Set(attachedAssetIds);
    return data.resources.map((asset) => ({
      id: asset.id,
      title: asset.title,
      kind: asset.kind,
      meta: asset.meta,
      alreadyAttached: attached.has(asset.id),
    }));
  };

  // Copy edits are collected here and saved together, so one Save covers the
  // whole block rather than firing a mutation per keystroke.
  const [copy, setCopy] = useState({
    title: data.title,
    audience: data.audience,
    outcome: data.outcome,
    description: data.description,
    category: detail.module.category,
    // Held as strings so a field being cleared mid-edit is an empty box rather
    // than a NaN on its way to the server.
    durationMinutes: `${detail.module.durationMinutes}`,
    cptdPoints: `${detail.module.cptdPoints}`,
    passMark: `${detail.module.passMark}`,
  });
  const [saving, setSaving] = useState(false);

  /**
   * A whole number, or a thrown message `run` will toast.
   *
   * These mirror `assertModuleNumbers` in `convex/modules.ts`. The server is the
   * enforcement — it has to be, because `cptdPoints` is incremented onto a
   * teacher's XP and never recomputed — but catching it here saves a round trip
   * and names the field.
   */
  function wholeNumber(raw: string, label: string, max?: number): number {
    const value = Number(raw.trim());
    if (raw.trim().length === 0 || !Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a whole number, zero or more.`);
    }
    if (max !== undefined && value > max) {
      throw new Error(`${label} cannot be more than ${max}.`);
    }
    return value;
  }

  /** Run a mutation, surfacing the server message rather than a generic toast. */
  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "That did not work.");
    }
  }

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
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await run("Module settings saved.", () =>
                  updateModule.mutateAsync({
                    moduleId,
                    title: copy.title,
                    audience: copy.audience,
                    outcome: copy.outcome,
                    description: copy.description,
                    category: copy.category,
                    durationMinutes: wholeNumber(copy.durationMinutes, "Duration"),
                    cptdPoints: wholeNumber(copy.cptdPoints, "CPTD points"),
                    passMark: wholeNumber(copy.passMark, "Pass mark", 100),
                  }),
                );
                setSaving(false);
              }}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {data.publishState === "published" ? (
              <button
                onClick={() =>
                  run("Module moved back to draft.", () =>
                    setModuleState.mutateAsync({ moduleId, publishState: "draft" }),
                  )
                }
                className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Unpublish
              </button>
            ) : (
              <button
                onClick={() =>
                  run("Module published.", () => publishModule.mutateAsync({ moduleId }))
                }
                className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Publish
              </button>
            )}
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
                  value={copy.title}
                  onChange={(e) => setCopy((c) => ({ ...c, title: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Audience
                </span>
                <input
                  value={copy.audience}
                  onChange={(e) => setCopy((c) => ({ ...c, audience: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Outcome
              </span>
              <textarea
                value={copy.outcome}
                onChange={(e) => setCopy((c) => ({ ...c, outcome: e.target.value }))}
                className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Learner-facing description
              </span>
              <textarea
                value={copy.description}
                onChange={(e) => setCopy((c) => ({ ...c, description: e.target.value }))}
                className="min-h-32 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Category
                </span>
                <select
                  value={copy.category}
                  onChange={(e) =>
                    setCopy((c) => ({ ...c, category: e.target.value as ModuleCategory }))
                  }
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                >
                  {MODULE_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Duration (minutes)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={copy.durationMinutes}
                  onChange={(e) => setCopy((c) => ({ ...c, durationMinutes: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  CPTD points
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={copy.cptdPoints}
                  onChange={(e) => setCopy((c) => ({ ...c, cptdPoints: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
                <span className="block text-[11px] text-muted-foreground">
                  Also worth {Number(copy.cptdPoints || 0) * 100} XP on completion.
                </span>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Pass mark (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={copy.passMark}
                  onChange={(e) => setCopy((c) => ({ ...c, passMark: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
                <span className="block text-[11px] text-muted-foreground">
                  What the assessment is graded against.
                </span>
              </label>
            </div>

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
                <AddObjectiveDialog
                  onAddObjective={(text) =>
                    void run("Objective added.", () => addObjective.mutateAsync({ moduleId, text }))
                  }
                >
                  <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                    <Plus className="h-4 w-4" /> Add objective
                  </button>
                </AddObjectiveDialog>
              </div>

              <div className="mt-5 space-y-3">
                {data.objectives.map((objective) => (
                  <div
                    key={objective.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
                  >
                    <span>{objective.text}</span>
                    <button
                      aria-label={`Remove objective: ${objective.text}`}
                      onClick={() =>
                        run("Objective removed.", () =>
                          removeObjective.mutateAsync({ objectiveId: objective.id }),
                        )
                      }
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      Remove
                    </button>
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
                    {/*
                      Was a button with no onClick. The hero asset is a real
                      asset row, so its file is uploaded through its own editor
                      rather than through a second, separate upload path here.
                    */}
                    {data.featuredMedia === null ? null : (
                      <Link
                        to={data.featuredMedia.href}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                      >
                        <Upload className="h-4 w-4" />
                        {data.featuredMedia.hasFile ? "Replace file" : "Upload file"}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Asset placeholders
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                One zone per real asset on this module. Dropping a file uploads it and attaches it
                to that asset, replacing any file already there.
              </p>
              <div className="mt-5 space-y-3">
                {data.resources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No assets on this module yet. Add a placeholder below, then upload its file.
                  </p>
                ) : (
                  data.resources.map((asset) => (
                    <DragAndDropZone
                      key={asset.id}
                      title={asset.title}
                      description={`${asset.kind} - ${asset.meta}`}
                      icon={Upload}
                      status={uploads.stateFor(asset.id).status}
                      progress={uploads.stateFor(asset.id).progress}
                      errorMessage={uploads.stateFor(asset.id).errorMessage}
                      uploadedFileName={asset.fileName}
                      onUpload={async (file) => {
                        await uploads.upload(asset.id, file);
                      }}
                    />
                  ))
                )}
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
            <AddLessonDialog
              onAddLesson={(lesson) =>
                void run("Lesson added.", () =>
                  createLesson.mutateAsync({
                    moduleId,
                    title: lesson.title,
                    kind: lesson.kind,
                    summary: lesson.description,
                  }),
                )
              }
            >
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
                        onClick={() =>
                          run("Lesson order updated.", () =>
                            moveLesson.mutateAsync({ lessonId: lesson.id, direction: "up" }),
                          )
                        }
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-muted-foreground">
                        <GripVertical className="h-5 w-5" />
                      </div>
                      <button
                        className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:bg-muted"
                        aria-label={`Move ${lesson.title} down`}
                        onClick={() =>
                          run("Lesson order updated.", () =>
                            moveLesson.mutateAsync({ lessonId: lesson.id, direction: "down" }),
                          )
                        }
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
                        <button
                          aria-label={`Move ${lesson.title} up`}
                          onClick={() =>
                            run("Lesson order updated.", () =>
                              moveLesson.mutateAsync({ lessonId: lesson.id, direction: "up" }),
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted lg:hidden"
                        >
                          <ArrowUp className="h-4 w-4" /> Up
                        </button>
                        <button
                          aria-label={`Move ${lesson.title} down`}
                          onClick={() =>
                            run("Lesson order updated.", () =>
                              moveLesson.mutateAsync({ lessonId: lesson.id, direction: "down" }),
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted lg:hidden"
                        >
                          <ArrowDown className="h-4 w-4" /> Down
                        </button>
                        <Link
                          to={lesson.href}
                          className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                        >
                          Open lesson editor
                        </Link>
                        <AttachContentDialog
                          lessonTitle={lesson.title}
                          assets={attachableFor(lesson.attachedAssetIds)}
                          onAttach={(assetId) =>
                            run("Resource attached.", () =>
                              attachAsset.mutateAsync({
                                lessonId: lesson.id,
                                assetId: assetId as (typeof data.resources)[number]["id"],
                              }),
                            )
                          }
                        >
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
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Assessment</p>
                <h2 className="mt-2 text-2xl font-bold text-foreground">
                  {data.questionCountLabel}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Staff answer these inside the module&rsquo;s assessment lesson. Passing is what
                  marks that lesson complete, so a published assessment lesson needs at least one
                  question before the module can go live.
                </p>
              </div>
            </div>
            <Link
              to="/academy/admin/modules/$moduleSlug/assessment"
              params={{ moduleSlug }}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              Build the assessment <ArrowRight className="h-4 w-4" />
            </Link>
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
            <button
              onClick={() =>
                run("Asset placeholder created.", () =>
                  createAsset.mutateAsync({
                    moduleId,
                    title: "Untitled asset",
                    kind: "document",
                  }),
                )
              }
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
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
