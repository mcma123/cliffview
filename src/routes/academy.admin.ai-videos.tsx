import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Clapperboard, FileText, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { presentAiVideoJobs } from "@/application/academy/presenters";
import { AdminShell } from "@/components/admin-shell";
import { DragAndDropZone, type UploadZoneStatus } from "@/components/drag-and-drop-zone";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { useAssetUploads } from "@/hooks/use-asset-upload";
import { errorMessage } from "@/lib/convex-error";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * AI video generation.
 *
 * The shape worth knowing: this screen never waits for a video. Generation
 * takes minutes, so `startGeneration` returns as soon as the provider accepts
 * the job and a scheduled poller finishes the work. The job list below is a
 * live Convex subscription, so it repaints when the poller writes — there is no
 * polling in this file at all.
 *
 * Two deliberate steps rather than one button: the document is read into a
 * prompt, a person reads and edits that prompt, and only then is anything
 * rendered. Rendering costs real money, which no other button in this admin
 * does.
 */

/**
 * PDF only, and that is the read path's limit rather than a UI preference.
 * The model reads PDFs natively; a `.docx` is mislabelled `application/pdf`
 * downstream and fails inside the model call, which is a worse error than
 * refusing it at the picker. Word support needs a conversion step.
 */
const ACCEPTED_UPLOAD_TYPES = ".pdf,application/pdf";

const DURATIONS = [5, 8, 10, 12, 15] as const;
const RESOLUTIONS = ["480p", "720p"] as const;
const ASPECTS = ["16:9", "9:16", "1:1"] as const;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** "Safeguarding policy.pdf" -> "Safeguarding policy". */
function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.length === 0 ? fileName : withoutExtension;
}

export const Route = createFileRoute("/academy/admin/ai-videos")({
  head: () => ({ meta: [{ title: "AI Videos · Cliffview Academy" }] }),
  // No prefetch: admin screens are client-rendered behind the gate.
  loader: () => ({ now: Date.now() }),
  component: AIVideos,
});

function AIVideos() {
  const viewer = useAdminViewer();
  const { now } = Route.useLoaderData();
  const { data: raw } = useSuspenseQuery(convexQuery(api.aiVideoQueue.jobs, { now }));
  const data = presentAiVideoJobs(raw, now);

  const [moduleId, setModuleId] = useState<string>("");
  const [lessonId, setLessonId] = useState<string>("");
  const [documentId, setDocumentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState<Id<"aiVideoJobs"> | null>(null);

  const [durationSeconds, setDurationSeconds] = useState<number>(15);
  const [resolution, setResolution] = useState<string>("720p");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");

  // The uploader's own state, the same two-leg shape the AI review screen uses.
  const [uploadedAssetId, setUploadedAssetId] = useState<Id<"assets"> | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const openJob = useMutation({ mutationFn: useConvexMutation(api.aiVideoQueue.openJob) });
  const draft = useMutation({ mutationFn: useConvexAction(api.aiVideo.draftPrompt) });
  const generate = useMutation({ mutationFn: useConvexAction(api.aiVideo.startGeneration) });
  const cancel = useMutation({ mutationFn: useConvexMutation(api.aiVideoQueue.cancel) });
  const createAsset = useMutation({ mutationFn: useConvexMutation(api.assets.create) });

  const uploads = useAssetUploads();
  const uploadState = uploadedAssetId === null ? null : uploads.stateFor(uploadedAssetId);

  const selectedModule = data.modules.find((module) => module.id === moduleId) ?? null;

  const zoneStatus: UploadZoneStatus = creatingAsset
    ? "saving"
    : createError !== null
      ? "error"
      : (uploadState?.status ?? "idle");

  // `useAssetUploads.upload` records failure in per-asset state instead of
  // throwing, so success is observed here rather than after the await.
  useEffect(() => {
    if (uploadedAssetId !== null && uploadState?.status === "done") {
      setDocumentId(uploadedAssetId);
    }
  }, [uploadedAssetId, uploadState?.status]);

  // Changing module invalidates the two things scoped to it.
  useEffect(() => {
    setLessonId("");
    setDocumentId("");
  }, [moduleId]);

  async function onUploadDocument(file: File) {
    if (moduleId === "") {
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
        moduleId: moduleId as Id<"modules">,
        title: titleFromFileName(file.name),
        kind: "document",
        description: "Uploaded on the AI videos screen to generate a video from.",
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
    if (title === "") setTitle(titleFromFileName(file.name));
    await uploads.upload(assetId, file);
  }

  /** Open the job, then ask the model for a prompt to put in front of a person. */
  async function onDraft() {
    if (lessonId === "" || documentId === "") {
      toast.error("Choose a document to read and a lesson to put the video on.");
      return;
    }
    if (title.trim().length === 0) {
      toast.error("Give the video a title first.");
      return;
    }

    try {
      const openedId = await openJob.mutateAsync({
        lessonId: lessonId as Id<"lessons">,
        sourceAssetId: documentId as Id<"assets">,
        title,
      });
      setJobId(openedId);
      const result = await draft.mutateAsync({
        jobId: openedId,
        assetId: documentId as Id<"assets">,
      });
      setPrompt(result.prompt);
      toast.success("Prompt drafted. Read it before generating.");
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not draft a prompt from that document."));
    }
  }

  /** Submit for rendering. Returns as soon as the provider accepts the job. */
  async function onGenerate() {
    if (jobId === null) {
      toast.error("Draft a prompt first.");
      return;
    }
    if (prompt.trim().length === 0) {
      toast.error("The video needs a prompt to work from.");
      return;
    }

    try {
      const { lessonTitle } = await generate.mutateAsync({
        jobId,
        prompt,
        durationSeconds,
        resolution,
        aspectRatio,
      });
      toast.success(`Generating. It will appear on ${lessonTitle} when it is done.`);
      setJobId(null);
      setPrompt("");
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not start generating that video."));
    }
  }

  return (
    <AdminShell viewer={viewer}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Content studio</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">AI Videos</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Read a module document, turn it into a short video, and put it on a lesson. The prompt
            is yours to edit before anything is rendered.
          </p>
        </div>

        {data.configured ? null : (
          <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
            <div>
              <p className="text-sm font-semibold text-foreground">Generation is not configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Set <code className="font-mono text-xs">OPENROUTER_API_KEY</code> on the deployment
                to generate videos.
              </p>
            </div>
          </div>
        )}

        <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Module
              </span>
              <select
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
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

            <label className="space-y-2">
              <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Lesson the video goes on
              </span>
              <select
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                disabled={selectedModule === null}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">
                  {selectedModule === null ? "Choose a module first" : "Choose a lesson…"}
                </option>
                {selectedModule?.lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-background p-5">
            <p className="text-sm font-semibold text-foreground">The document to read</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick one already on the module, or upload a new PDF. PDF only for now.
            </p>

            <label className="mt-4 block space-y-2">
              <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Document
              </span>
              <select
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                disabled={selectedModule === null}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">
                  {selectedModule === null ? "Choose a module first" : "Choose a document…"}
                </option>
                {selectedModule?.documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title}
                  </option>
                ))}
              </select>
            </label>

            {moduleId === "" ? (
              <p className="mt-4 flex items-start gap-2 rounded-2xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary-deep" />
                Choose a module above first. A document is saved onto a module, so there is nowhere
                to put this one yet.
              </p>
            ) : null}

            <div className="mt-4">
              <DragAndDropZone
                title="Upload a PDF"
                description={
                  moduleId === ""
                    ? "Choose a module above first, then drop a PDF here."
                    : "Drag and drop a PDF here, or click to browse"
                }
                icon={FileText}
                acceptedFileTypes={ACCEPTED_UPLOAD_TYPES}
                onUpload={onUploadDocument}
                status={zoneStatus}
                progress={uploadState?.progress ?? 0}
                errorMessage={createError ?? uploadState?.errorMessage ?? null}
                uploadedFileName={uploadedFileName}
              />
            </div>
          </div>

          <label className="block space-y-2">
            <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Video title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What this video is called on the lesson"
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </label>

          <button
            onClick={() => void onDraft()}
            disabled={draft.isPending || !data.configured}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            {draft.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading the document…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Draft a prompt from this document
              </>
            )}
          </button>
        </section>

        {prompt === "" ? null : (
          <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Step two</p>
              <h2 className="mt-2 text-xl font-bold text-foreground">
                Read this before anything is rendered
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This is what the video model will be given. Edit it freely — describe only what a
                camera can see.
              </p>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-40 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Length
                </span>
                <select
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  {DURATIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} seconds
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Resolution
                </span>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  {RESOLUTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Shape
                </span>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  {ASPECTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              {/* Said plainly. No other button in this admin spends money. */}
              <p className="text-xs text-muted-foreground">
                Generating charges your OpenRouter account. It takes a few minutes, and you can
                leave this page — the video appears on the lesson when it is ready.
              </p>
              <button
                onClick={() => void onGenerate()}
                disabled={generate.isPending || !data.configured}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Clapperboard className="h-4 w-4" /> Generate this video
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Recent videos</p>

          {data.jobs.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing generated yet. Read a document above to start.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{job.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.moduleTitle} · {job.lessonTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{job.sourceLabel}</p>
                    {job.errorMessage === null ? null : (
                      <p className="mt-1 max-w-xl text-xs text-destructive">{job.errorMessage}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                        job.statusTone,
                      )}
                    >
                      {job.statusLabel}
                    </span>
                    {job.isRunning ? (
                      <button
                        onClick={() =>
                          void cancel
                            .mutateAsync({ jobId: job.id as Id<"aiVideoJobs"> })
                            .then(() => toast.success("Stopped."))
                            .catch((caught: unknown) =>
                              toast.error(errorMessage(caught, "Could not stop that job.")),
                            )
                        }
                        className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label={`Stop ${job.title}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
