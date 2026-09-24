import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, FileText, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { presentAiReviewQueue } from "@/application/academy/presenters";
import { AdminShell } from "@/components/admin-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { DragAndDropZone, type UploadZoneStatus } from "@/components/drag-and-drop-zone";
import { useAssetUploads } from "@/hooks/use-asset-upload";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/convex-error";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * The AI review queue, reading and writing prod.
 *
 * What this replaced: a `setInterval` that animated a fake progress bar and
 * then injected two hardcoded questions with `Date.now()` ids, while decisions
 * lived in React state and vanished on refresh. Nothing it showed was real.
 *
 * The rule the screen exists to enforce: a generated question is a draft.
 * Approving it is what copies it into the module's live question bank, through
 * the same validation a hand-typed question passes.
 */
/**
 * Only PDFs are offered here, and that is the read path's limit rather than a
 * UI preference: `lib/openrouter.ts` posts the file to a model that reads PDFs
 * natively, and `aiReviewQueue.sourceAsset` falls back to `application/pdf`
 * for an asset whose content type never synced. A .docx pushed through that
 * path is mislabelled and fails inside the model call, which is a worse error
 * than refusing it at the picker. Word support is follow-up work.
 */
const ACCEPTED_UPLOAD_TYPES = ".pdf,application/pdf";

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** "Safeguarding policy.pdf" -> "Safeguarding policy". */
function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.length === 0 ? fileName : withoutExtension;
}

export const Route = createFileRoute("/academy/admin/ai-review")({
  head: () => ({ meta: [{ title: "AI Review Queue · Cliffview Academy" }] }),
  // No prefetch: admin screens are client-rendered behind the gate.
  loader: () => ({ now: Date.now() }),
  component: AIReview,
});

function AIReview() {
  const viewer = useAdminViewer();
  const { now } = Route.useLoaderData();
  /**
   * Which generation run to show, or every one.
   *
   * Held above the query because it is an argument to it: the server filters,
   * rather than the screen hiding rows it fetched. `onGenerate` sets this to
   * the run it just started, so after drafting you are looking at exactly what
   * was drafted and nothing else.
   */
  const [runFilter, setRunFilter] = useState<string>("");

  const { data: queue } = useSuspenseQuery(
    convexQuery(
      api.aiReviewQueue.queue,
      runFilter === "" ? {} : { generationId: runFilter as Id<"aiGenerations"> },
    ),
  );
  const data = presentAiReviewQueue(queue, now);

  const [tab, setTab] = useState<"queue" | "generate">("queue");
  const [sourceId, setSourceId] = useState<string>("");
  const [count, setCount] = useState("8");
  const [editing, setEditing] = useState<{ id: string; prompt: string } | null>(null);

  // The uploader's own state. `uploadedAssetId` is the row this screen created,
  // held so the zone can report that upload's progress and offer to undo it.
  const [uploadModuleId, setUploadModuleId] = useState<string>("");
  const [uploadedAssetId, setUploadedAssetId] = useState<Id<"assets"> | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const decide = useMutation({ mutationFn: useConvexMutation(api.aiReviewQueue.setDecision) });
  const discard = useMutation({
    mutationFn: useConvexMutation(api.aiReviewQueue.discardQuestion),
  });
  const clearReviewed = useMutation({
    mutationFn: useConvexMutation(api.aiReviewQueue.clearReviewed),
  });
  const generate = useMutation({ mutationFn: useConvexAction(api.aiReview.generateFromAsset) });
  const createAsset = useMutation({ mutationFn: useConvexMutation(api.assets.create) });
  const removeAsset = useMutation({ mutationFn: useConvexMutation(api.assets.remove) });

  const uploads = useAssetUploads();
  const uploadState = uploadedAssetId === null ? null : uploads.stateFor(uploadedAssetId);

  // Creating the row and moving the bytes are two legs of one action to the
  // admin, so the zone shows "saving" across the first and the hook's own
  // status across the second.
  const zoneStatus: UploadZoneStatus = creatingAsset
    ? "saving"
    : createError !== null
      ? "error"
      : (uploadState?.status ?? "idle");

  // `useAssetUploads.upload` records failure in per-asset state instead of
  // throwing, so success is observed here rather than after the await. Once
  // `attachFile` lands, the queue query re-runs and the asset turns up in
  // `sources`; selecting it saves hunting through a list you just added to.
  useEffect(() => {
    if (uploadedAssetId !== null && uploadState?.status === "done") {
      setSourceId(uploadedAssetId);
    }
  }, [uploadedAssetId, uploadState?.status]);

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (caught) {
      // The server's own message: "Add at least one…", "exactly one option…",
      // or OpenRouter's refusal text. All more useful than a generic failure.
      toast.error(errorMessage(caught, "That did not work."));
    }
  }

  /**
   * Create the asset row, then upload into it.
   *
   * Two calls rather than one because a file attaches to an asset and no asset
   * exists until this screen makes one — the same order the module editor
   * uses, which is why `assets.create` and `useAssetUploads` are reused here
   * rather than a second upload path being written.
   *
   * A failure between the two legs leaves a titled placeholder with no file.
   * That is visible rather than hidden: the zone reports the error and offers
   * Remove, which deletes the row.
   */
  async function onUploadDocument(file: File) {
    if (uploadModuleId === "") {
      toast.error("Choose which module this document belongs to first.");
      return;
    }
    if (!isPdf(file)) {
      toast.error("Only PDF files can be read for now.");
      return;
    }

    setCreateError(null);
    setCreatingAsset(true);
    let assetId: Id<"assets">;
    try {
      assetId = await createAsset.mutateAsync({
        moduleId: uploadModuleId as Id<"modules">,
        title: titleFromFileName(file.name),
        kind: "document",
        description: "Uploaded on the AI review screen to draft questions from.",
      });
    } catch (caught) {
      const message = errorMessage(caught, "Could not add that document to the module.");
      setCreateError(message);
      toast.error(message);
      return;
    } finally {
      setCreatingAsset(false);
    }

    setUploadedAssetId(assetId);
    setUploadedFileName(file.name);
    await uploads.upload(assetId, file);
  }

  /** Undo an upload: deletes the row this screen created, and its blob. */
  async function onRemoveUpload() {
    if (uploadedAssetId === null) return;
    const assetId = uploadedAssetId;
    try {
      await removeAsset.mutateAsync({ assetId });
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not remove that upload."));
      return;
    }
    uploads.reset(assetId);
    setUploadedAssetId(null);
    setUploadedFileName(null);
    setCreateError(null);
    if (sourceId === assetId) setSourceId("");
    toast.success("Upload removed.");
  }

  async function onGenerate() {
    if (sourceId === "") {
      toast.error("Choose a document to read first.");
      return;
    }
    try {
      const result = await generate.mutateAsync({
        assetId: sourceId as Id<"assets">,
        count: Number(count) || 8,
      });
      toast.success(
        result.discarded === 0
          ? `${result.questionCount} questions drafted for review.`
          : `${result.questionCount} drafted — ${result.discarded} discarded as ungradable.`,
      );
      // The id was already being returned and thrown away. Selecting it is the
      // difference between "the queue looks the same as before" and seeing the
      // eight questions this upload just produced.
      setRunFilter(result.generationId);
      setTab("queue");
    } catch (caught) {
      toast.error(errorMessage(caught, "Generation failed."));
    }
  }

  return (
    <AdminShell viewer={viewer}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Question Review Queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Questions are drafted from a module&rsquo;s own documents. Nothing reaches a teacher
              without your approval.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            {(["queue", "generate"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {id === "generate" && <Sparkles className="h-4 w-4" />}
                {id === "queue" ? "Review Queue" : "Generate"}
              </button>
            ))}
          </div>
        </div>

        {data.configured ? null : (
          <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
            <div>
              <p className="text-sm font-semibold text-foreground">Generation is not configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Set <code className="font-mono text-xs">OPENROUTER_API_KEY</code> on the deployment
                to draft questions. The review queue below still works.
              </p>
            </div>
          </div>
        )}

        {tab === "queue" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {data.summary.map((chip) => (
                <span
                  key={chip.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold",
                    chip.tone,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", chip.dot)} />
                  {chip.value} {chip.label}
                </span>
              ))}

              <div className="ml-auto flex flex-wrap items-center gap-3">
                {data.generations.length === 0 ? null : (
                  <select
                    value={runFilter}
                    onChange={(e) => setRunFilter(e.target.value)}
                    aria-label="Show questions from"
                    className="rounded-2xl border border-input bg-background px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
                  >
                    <option value="">All uploads</option>
                    {data.generations.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.filterLabel}
                      </option>
                    ))}
                  </select>
                )}

                {data.reviewedCount === 0 ? null : (
                  <ConfirmDialog
                    icon={Trash2}
                    title="Clear the drafts you have already reviewed"
                    description={`Removes ${data.reviewedCount} draft${
                      data.reviewedCount === 1 ? "" : "s"
                    } you have approved, edited or rejected.`}
                    confirmLabel="Clear reviewed"
                    body={
                      <p className="text-sm text-muted-foreground">
                        Questions you approved stay on their modules — they are real assessment
                        questions now, and a teacher may already have answered one. This only clears
                        the drafts behind them, which cannot be undone.
                      </p>
                    }
                    onConfirm={async () => {
                      const { removed } = await clearReviewed.mutateAsync({});
                      toast.success(
                        `${removed} reviewed draft${removed === 1 ? "" : "s"} cleared.`,
                      );
                    }}
                  >
                    <button className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
                      <Trash2 className="h-3.5 w-3.5" /> Clear reviewed ({data.reviewedCount})
                    </button>
                  </ConfirmDialog>
                )}
              </div>
            </div>

            {data.questions.length === 0 ? (
              <section className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
                <h2 className="text-lg font-bold text-foreground">Nothing to review</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {runFilter === ""
                    ? "Generate questions from a module document and they will appear here as drafts."
                    : "Every question from that upload has been dealt with."}
                </p>
                {runFilter === "" ? null : (
                  <button
                    onClick={() => setRunFilter("")}
                    className="mt-4 rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Show all uploads
                  </button>
                )}
              </section>
            ) : (
              <div className="space-y-4">
                {data.questions.map((question) => (
                  <article
                    key={question.id}
                    className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-gold" />
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          AI draft · {question.moduleTitle}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {question.difficulty}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                            question.confidenceTone,
                          )}
                          title="How well the source document supports this question"
                        >
                          Confidence {question.confidencePercent}%
                        </span>
                      </div>
                    </div>

                    {editing?.id === question.id ? (
                      <textarea
                        value={editing.prompt}
                        onChange={(e) => setEditing({ id: question.id, prompt: e.target.value })}
                        className="mt-4 min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                      />
                    ) : (
                      <h3 className="mt-4 text-lg font-bold text-foreground">{question.prompt}</h3>
                    )}

                    <ul className="mt-4 space-y-2">
                      {question.options.map((option) => (
                        <li
                          key={option.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
                            option.isCorrect
                              ? "border-success/60 bg-success/10 font-semibold text-foreground"
                              : "border-border text-foreground",
                          )}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                            {option.key}
                          </span>
                          <span className="flex-1">{option.text}</span>
                          {option.isCorrect && <Check className="h-4 w-4 text-success" />}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">{question.sourceLabel}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {editing?.id === question.id ? (
                          <>
                            <button
                              onClick={() => setEditing(null)}
                              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={decide.isPending || editing.prompt.trim().length === 0}
                              onClick={() =>
                                void run(
                                  `Edited and added to ${question.moduleTitle}.`,
                                  async () => {
                                    await decide.mutateAsync({
                                      questionId: question.id as Id<"aiQuestions">,
                                      decision: "edited",
                                      editedPrompt: editing.prompt,
                                    });
                                    setEditing(null);
                                  },
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" /> Save and approve
                            </button>
                          </>
                        ) : (
                          <>
                            <ConfirmDialog
                              icon={Trash2}
                              title="Discard this draft"
                              description="It is deleted outright, not recorded as rejected."
                              confirmLabel="Discard"
                              body={
                                <p className="text-sm text-muted-foreground">
                                  Use Reject instead if the question was wrong and you want that
                                  judgement kept. Discard is for a draft not worth judging — a run
                                  that came back as nonsense. It cannot be undone.
                                </p>
                              }
                              onConfirm={async () => {
                                await discard.mutateAsync({
                                  questionId: question.id as Id<"aiQuestions">,
                                });
                                toast.success("Draft discarded.");
                              }}
                            >
                              <button className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-destructive">
                                <Trash2 className="h-4 w-4" /> Discard
                              </button>
                            </ConfirmDialog>
                            <button
                              onClick={() =>
                                setEditing({ id: question.id, prompt: question.prompt })
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" /> Edit
                            </button>
                            <button
                              disabled={decide.isPending}
                              onClick={() =>
                                void run("Question rejected.", () =>
                                  decide.mutateAsync({
                                    questionId: question.id as Id<"aiQuestions">,
                                    decision: "rejected",
                                  }),
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted hover:text-destructive disabled:opacity-60"
                            >
                              <X className="h-4 w-4" /> Reject
                            </button>
                            <button
                              disabled={decide.isPending}
                              onClick={() =>
                                void run(`Approved — added to ${question.moduleTitle}.`, () =>
                                  decide.mutateAsync({
                                    questionId: question.id as Id<"aiQuestions">,
                                    decision: "approved",
                                  }),
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" /> Approve
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {question.moduleSlug === "" ? null : (
                      <Link
                        to="/academy/admin/modules/$moduleSlug/assessment"
                        params={{ moduleSlug: question.moduleSlug }}
                        className="mt-3 inline-block text-xs font-semibold text-gold hover:underline"
                      >
                        Open this module&rsquo;s assessment
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Draft from a document
              </p>
              <h2 className="mt-2 text-xl font-bold text-foreground">
                Read a module document and write questions about it
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                The whole document is read in one pass — nothing is summarised or chunked first.
                Questions arrive as drafts for review, never in a live assessment.
              </p>

              <div className="mt-6 space-y-5">
                <div className="rounded-2xl border border-border bg-background p-5">
                  <p className="text-sm font-semibold text-foreground">Add a document</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    It is saved to the module as a draft asset, so no learner sees it until you
                    publish it. PDF only for now.
                  </p>

                  <label className="mt-4 block space-y-2">
                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Module
                    </span>
                    <select
                      value={uploadModuleId}
                      onChange={(e) => setUploadModuleId(e.target.value)}
                      className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Choose a module…</option>
                      {data.modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="mt-4">
                    <DragAndDropZone
                      title="Upload a PDF"
                      description={
                        uploadModuleId === ""
                          ? "Choose a module first, then drop a PDF here."
                          : "Drag and drop a PDF here, or click to browse"
                      }
                      icon={FileText}
                      acceptedFileTypes={ACCEPTED_UPLOAD_TYPES}
                      onUpload={onUploadDocument}
                      status={zoneStatus}
                      progress={uploadState?.progress ?? 0}
                      errorMessage={createError ?? uploadState?.errorMessage ?? null}
                      uploadedFileName={uploadedFileName}
                      onRemove={uploadedAssetId === null ? undefined : onRemoveUpload}
                      disabled={uploadModuleId === ""}
                    />
                  </div>
                </div>

                {data.sources.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground">
                    No readable documents yet. Upload one above, or attach a file to a document or
                    worksheet asset under Modules, and it will appear here.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
                    <label className="space-y-2">
                      <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Document
                      </span>
                      <select
                        value={sourceId}
                        onChange={(e) => setSourceId(e.target.value)}
                        className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                      >
                        <option value="">Choose a document…</option>
                        {data.sources.map((source) => (
                          <option key={source.assetId} value={source.assetId}>
                            {source.moduleTitle} — {source.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Questions
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary sm:w-24"
                      />
                    </label>

                    <div className="flex items-end">
                      <button
                        onClick={onGenerate}
                        disabled={generate.isPending || !data.configured}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
                      >
                        {generate.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Reading the document…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" /> Draft questions
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {data.generations.length === 0 ? null : (
              <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                  Recent runs
                </p>
                <div className="mt-4 space-y-2">
                  {data.generations.map((run) => (
                    <div
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{run.fileName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{run.startedLabel}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {run.errorMessage === null ? null : (
                          <span className="max-w-md text-xs text-destructive">
                            {run.errorMessage}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                            run.tone,
                          )}
                        >
                          {run.statusLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
