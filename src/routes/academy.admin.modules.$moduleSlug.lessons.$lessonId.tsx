import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ModuleAssetKind, ModuleLessonKind } from "@/domain/academy/entities";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { formatAssetMeta, presentAdminLessonDetail } from "@/application/academy/presenters";
import { api } from "../../convex/_generated/api";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, FileText, Plus, Save, Upload, X } from "lucide-react";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";
import { AttachContentDialog } from "@/components/attach-content-dialog";
import { MAX_FILE_BYTES, useAssetUploads } from "@/hooks/use-asset-upload";
import { errorMessage } from "@/lib/convex-error";
import { toast } from "sonner";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/lessons/$lessonId")({
  head: () => ({ meta: [{ title: "Lesson Editor · Cliffview Academy" }] }),
  // No loader prefetch: Convex Auth keeps its token in localStorage, so there
  // is no identity on the server and a prefetched gated query would be held
  // forever. This screen is client-rendered behind the admin gate.
  component: AdminLessonEditor,
});

const MAX_FILE_LABEL = `${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB`;

/** A readable title from a file name: "policy-notes-v2.pdf" -> "Policy notes v2". */
function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const spaced = withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (spaced.length === 0) return fileName;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The asset kind for a dropped file, from its MIME type.
 *
 * A label, not a gate: nothing downstream trusts it — the learner page decides
 * how to render from `contentType`, because an admin can set `kind` to anything
 * from the asset editor's dropdown. This only saves them from picking.
 */
function kindForFile(file: File): ModuleAssetKind {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return "document";
}

function AdminLessonEditor() {
  const viewer = useAdminViewer();
  const { moduleSlug, lessonId } = Route.useParams();
  const { data: detail } = useSuspenseQuery(
    convexQuery(api.lessons.adminDetail, { moduleSlug, lessonSlug: lessonId }),
  );
  const data = presentAdminLessonDetail(detail);

  const lessonDocId = detail.lesson._id;
  const updateLesson = useMutation({ mutationFn: useConvexMutation(api.lessons.update) });
  const setLessonState = useMutation({
    mutationFn: useConvexMutation(api.lessons.setPublishState),
  });
  const detachAsset = useMutation({ mutationFn: useConvexMutation(api.lessons.detachAsset) });
  const attachAsset = useMutation({ mutationFn: useConvexMutation(api.lessons.attachAsset) });
  // One instance for the screen, keyed by asset id: this page renders a zone
  // per attached resource, so a hook call per zone would break the rules of
  // hooks as soon as a resource was attached or detached.
  const uploads = useAssetUploads();
  const addMaterial = useMutation({ mutationFn: useConvexMutation(api.lessons.addMaterial) });
  const reorderAssets = useMutation({ mutationFn: useConvexMutation(api.lessons.reorderAssets) });

  // Files in flight, so several dropped at once each show their own progress
  // rather than one shared bar. Keyed by a generated id because there is no
  // asset row to key on until the upload lands — that is the whole point of
  // uploading first.
  const [pending, setPending] = useState<Array<{ id: string; name: string }>>([]);
  const addingCount = pending.length;

  /**
   * One dropped file becomes one attachment.
   *
   * Bytes first, row second. `assets.create` then upload leaves a titled
   * placeholder with no file whenever the upload fails; this way a failure
   * leaves nothing behind. `lessons.addMaterial` then creates, attaches and
   * publishes in a single transaction.
   */
  async function addMaterialFile(file: File) {
    const trackingId = `pending-${crypto.randomUUID()}`;
    setPending((current) => [...current, { id: trackingId, name: file.name }]);
    try {
      const key = await uploads.uploadNew(trackingId, file);
      // The reason is already on screen, from the hook's own state.
      if (key === null) return;

      await addMaterial.mutateAsync({
        lessonId: lessonDocId,
        key,
        fileName: file.name,
        title: titleFromFileName(file.name),
        kind: kindForFile(file),
        // Some browsers report an empty type for an unrecognised extension.
        // Omit it rather than storing "" — the learner page reads this to
        // decide whether it can play or render the file.
        ...(file.type === "" ? {} : { contentType: file.type }),
        sizeBytes: file.size,
      });
      toast.success(`${file.name} added.`);
      setPending((current) => current.filter((item) => item.id !== trackingId));
      uploads.reset(trackingId);
    } catch (caught) {
      toast.error(errorMessage(caught, `Could not add ${file.name}.`));
    }
  }

  /** Run a mutation, reporting the server's own refusal on failure. */
  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (caught) {
      toast.error(errorMessage(caught, "That did not work."));
    }
  }

  /** Move one attachment by one place, sending the whole new order. */
  async function moveMaterial(index: number, delta: number) {
    const ids = data.linkedResources.map((asset) => asset.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run("Order saved.", () =>
      reorderAssets.mutateAsync({ lessonId: lessonDocId, assetIds: ids }),
    );
  }

  // Every asset on the module, flagged with whether this lesson already has it,
  // so the picker can hide the ones that are attached.
  const attachedIds = new Set(data.linkedResources.map((r) => r.id));
  const attachable = detail.moduleAssets.map((asset) => ({
    id: asset._id,
    title: asset.title,
    kind: asset.kind,
    // Derived, like every other surface. Reading raw `metaNote` here meant the
    // picker described an asset differently from the card next to it.
    meta: formatAssetMeta(asset),
    alreadyAttached: attachedIds.has(asset._id),
  }));

  // Unauthored optional fields stay empty strings in the form and are sent as
  // empty, which the mutation reads as "clear this" rather than storing a blank
  // as content.
  const [form, setForm] = useState({
    title: data.lessonTitle,
    kind: data.kind as ModuleLessonKind,
    durationMinutes: data.durationMinutes === null ? "" : `${data.durationMinutes}`,
    summary: data.summary,
    scenarioTitle: data.scenarioTitle ?? "",
    scenarioBody: data.scenarioBody ?? "",
    reflectionPrompt: data.reflectionPrompt ?? "",
  });
  const [saving, setSaving] = useState(false);

  const LESSON_KINDS: ModuleLessonKind[] = [
    "video",
    "audio",
    "reading",
    "case-study",
    "assessment",
  ];

  async function save() {
    setSaving(true);
    try {
      const minutes = form.durationMinutes.trim();
      await updateLesson.mutateAsync({
        lessonId: lessonDocId,
        title: form.title,
        kind: form.kind,
        summary: form.summary,
        scenarioTitle: form.scenarioTitle,
        scenarioBody: form.scenarioBody,
        reflectionPrompt: form.reflectionPrompt,
        ...(minutes.length === 0 ? {} : { durationMinutes: Number(minutes) }),
      });
      toast.success("Lesson saved.");
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not save the lesson."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell viewer={viewer}>
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
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Lesson state
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {data.publishLabel}
          </span>
          <button
            onClick={async () => {
              const next = data.publishState === "published" ? "draft" : "published";
              try {
                await setLessonState.mutateAsync({ lessonId: lessonDocId, publishState: next });
                toast.success(next === "published" ? "Lesson published." : "Lesson set to draft.");
              } catch (caught) {
                toast.error(errorMessage(caught, "That did not work."));
              }
            }}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            {data.publishState === "published" ? "Move to draft" : "Publish lesson"}
          </button>
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
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Lesson type
                  </span>
                  <select
                    value={form.kind}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kind: e.target.value as ModuleLessonKind }))
                    }
                    className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm capitalize text-foreground outline-none focus:border-primary"
                  >
                    {LESSON_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Duration label
                  </span>
                  <input
                    value={form.durationMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
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
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Scenario title
                </span>
                <input
                  value={form.scenarioTitle}
                  onChange={(e) => setForm((f) => ({ ...f, scenarioTitle: e.target.value }))}
                  placeholder="Optional. Add a scenario title for this lesson."
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Scenario body
                </span>
                <textarea
                  value={form.scenarioBody}
                  onChange={(e) => setForm((f) => ({ ...f, scenarioBody: e.target.value }))}
                  placeholder="Optional. Describe the scenario staff should work through."
                  className="min-h-36 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reflection prompt
                </span>
                <textarea
                  value={form.reflectionPrompt}
                  onChange={(e) => setForm((f) => ({ ...f, reflectionPrompt: e.target.value }))}
                  placeholder="Optional. Add the reflection prompt shown beneath the media block."
                  className="min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Materials</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Video, notes, PDFs and worksheets. Drop several at once — each becomes its own
                attachment, and staff see them in the order below. Up to {MAX_FILE_LABEL} per file.
              </p>
              <div className="mt-5">
                <DragAndDropZone
                  title="Add material to this lesson"
                  description="Drag files here, or click to browse. MP4, PDF, Word, PowerPoint and images."
                  icon={Upload}
                  multiple
                  status={addingCount > 0 ? "uploading" : "idle"}
                  progress={0}
                  onUpload={addMaterialFile}
                />
              </div>

              {pending.length === 0 ? null : (
                <div className="mt-4 space-y-2">
                  {pending.map((item) => {
                    const state = uploads.stateFor(item.id);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border bg-background px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium text-foreground">{item.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {state.status === "error"
                              ? "Failed"
                              : state.status === "saving"
                                ? "Attaching…"
                                : `${Math.round(state.progress * 100)}%`}
                          </span>
                        </div>
                        {state.errorMessage === null ? (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-[width]"
                              style={{ width: `${Math.round(state.progress * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-destructive">{state.errorMessage}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 space-y-2">
                {data.linkedResources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing attached yet. Staff will see this lesson with no material.
                  </p>
                ) : (
                  data.linkedResources.map((asset, index) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3"
                    >
                      <span className="text-xs font-bold tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {asset.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {asset.kind} · {asset.meta}
                        </p>
                      </div>
                      {/*
                        Order is what a learner reads top to bottom — the video
                        before the notes that discuss it — so it has to be
                        something an admin can set. Buttons rather than drag:
                        they work with a keyboard and on a touchscreen.
                      */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          aria-label={`Move ${asset.title} up`}
                          disabled={index === 0}
                          onClick={() => moveMaterial(index, -1)}
                          className="rounded-lg border border-border p-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label={`Move ${asset.title} down`}
                          disabled={index === data.linkedResources.length - 1}
                          onClick={() => moveMaterial(index, 1)}
                          className="rounded-lg border border-border p-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label={`Remove ${asset.title}`}
                          onClick={() =>
                            run("Material removed.", () =>
                              detachAsset.mutateAsync({
                                lessonId: lessonDocId,
                                assetId: asset.id,
                              }),
                            )
                          }
                          className="rounded-lg border border-border p-1.5 text-foreground transition-colors hover:border-destructive hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
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
            <AttachContentDialog
              lessonTitle={data.lessonTitle}
              assets={attachable}
              onAttach={async (assetId) => {
                try {
                  await attachAsset.mutateAsync({
                    lessonId: lessonDocId,
                    assetId: assetId as (typeof detail.moduleAssets)[number]["_id"],
                  });
                  toast.success("Resource attached.");
                } catch (caught) {
                  toast.error(errorMessage(caught, "That did not work."));
                }
              }}
            >
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
                    <button
                      aria-label={`Detach ${resource.title}`}
                      onClick={async () => {
                        try {
                          await detachAsset.mutateAsync({
                            lessonId: lessonDocId,
                            assetId: resource.id,
                          });
                          toast.success("Resource detached.");
                        } catch (caught) {
                          toast.error(errorMessage(caught, "That did not work."));
                        }
                      }}
                      className="ml-2 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      Detach
                    </button>
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
