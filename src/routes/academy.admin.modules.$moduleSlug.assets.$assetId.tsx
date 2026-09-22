import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ModuleAssetKind } from "@/domain/academy/entities";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";
import { presentAdminAssetDetail } from "@/application/academy/presenters";
import { useAssetUploads } from "@/hooks/use-asset-upload";
import { errorMessage } from "@/lib/convex-error";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ArrowLeft, Download, Eye, FileText, Headphones, Video } from "lucide-react";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/assets/$assetId")({
  head: () => ({ meta: [{ title: "Asset Editor · Cliffview Academy" }] }),
  // No loader prefetch: Convex Auth keeps its token in localStorage, so there
  // is no identity on the server and a prefetched gated query would be held
  // forever. This screen is client-rendered behind the admin gate.
  loader: () => ({ now: Date.now() }),
  component: AdminAssetEditor,
});

function AdminAssetEditor() {
  const viewer = useAdminViewer();
  const { moduleSlug, assetId } = Route.useParams();
  const { now } = Route.useLoaderData();
  const { data: detail } = useSuspenseQuery(
    convexQuery(api.assets.adminDetail, {
      moduleSlug,
      assetId: assetId as Id<"assets">,
    }),
  );
  const data = presentAdminAssetDetail(detail, now);

  const id = detail.asset._id;
  const updateAsset = useMutation({ mutationFn: useConvexMutation(api.assets.update) });
  const setAssetState = useMutation({ mutationFn: useConvexMutation(api.assets.setPublishState) });
  const detachFile = useMutation({ mutationFn: useConvexMutation(api.assets.detachFile) });
  const uploads = useAssetUploads();
  const upload = uploads.stateFor(id);

  const [form, setForm] = useState({
    title: data.assetTitle,
    kind: data.assetKind as ModuleAssetKind,
    description: data.assetDescription,
  });
  const [saving, setSaving] = useState(false);

  const ASSET_KINDS: ModuleAssetKind[] = ["video", "audio", "document", "worksheet"];

  async function save() {
    setSaving(true);
    try {
      await updateAsset.mutateAsync({ assetId: id, ...form });
      toast.success("Asset saved.");
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not save the asset."));
    } finally {
      setSaving(false);
    }
  }
  const AssetIcon =
    data.assetKind === "audio" ? Headphones : data.assetKind === "video" ? Video : FileText;

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
              Asset editor
            </p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">{data.assetTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Dedicated admin UI for placeholder media and document assets.
            </p>
          </div>
          <Link
            to={data.previewPath}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            <Eye className="h-4 w-4" /> Preview learner module
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <AssetIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                  Asset details
                </p>
                <h2 className="mt-1 text-2xl font-bold text-foreground">
                  Edit placeholder metadata
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Asset title
                </span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Asset type
                </span>
                <select
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, kind: e.target.value as ModuleAssetKind }))
                  }
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm capitalize text-foreground outline-none focus:border-primary"
                >
                  {ASSET_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  File metadata
                </span>
                <input
                  value={data.assetMeta}
                  readOnly
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Publish state
                </span>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {data.publishLabel}
                  </span>
                  <button
                    onClick={async () => {
                      const next = data.publishState === "published" ? "draft" : "published";
                      try {
                        await setAssetState.mutateAsync({ assetId: id, publishState: next });
                        toast.success(
                          next === "published" ? "Asset published." : "Asset set to draft.",
                        );
                      } catch (caught) {
                        toast.error(errorMessage(caught, "That did not work."));
                      }
                    }}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    {data.publishState === "published" ? "Move to draft" : "Publish asset"}
                  </button>
                </div>
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Learner-facing description
              </span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-32 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">File upload</p>
              <p className="mt-2 text-sm text-muted-foreground">{data.placeholderState}</p>
              <div className="mt-5">
                <DragAndDropZone
                  title={data.hasFile ? "Replace this file" : "Upload the file for this asset"}
                  description={
                    data.hasFile
                      ? data.assetMeta
                      : "Drag and drop the file here, or click to browse."
                  }
                  icon={AssetIcon}
                  status={upload.status}
                  progress={upload.progress}
                  errorMessage={upload.errorMessage}
                  uploadedFileName={data.fileName}
                  onUpload={async (file) => {
                    await uploads.upload(id, file);
                  }}
                  onRemove={
                    data.hasFile
                      ? async () => {
                          try {
                            await detachFile.mutateAsync({ assetId: id });
                            uploads.reset(id);
                            toast.success("File removed.");
                          } catch (caught) {
                            toast.error(
                              caught instanceof Error
                                ? caught.message
                                : "Could not remove the file.",
                            );
                          }
                        }
                      : undefined
                  }
                />
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">File</p>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <dt className="text-muted-foreground">Attached file</dt>
                  <dd className="font-semibold text-foreground">{data.fileName ?? "None yet"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <dt className="text-muted-foreground">Details</dt>
                  <dd className="font-semibold text-foreground">{data.assetMeta}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <dt className="text-muted-foreground">Module hero</dt>
                  <dd className="font-semibold text-foreground">
                    {data.isFeatured ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
                  <dt className="text-muted-foreground">Last edited</dt>
                  <dd className="font-semibold text-foreground">{data.updatedLabel}</dd>
                </div>
              </dl>
              {/*
                A presigned R2 URL, resolved fresh on every read of this query
                and never stored. It expires, so it is rendered straight into
                the href and nowhere else.
              */}
              {data.fileUrl === null ? null : (
                <a
                  href={data.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  <Download className="h-4 w-4" /> Download {data.fileName}
                </a>
              )}
            </section>
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
            Learner-side usage
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">Where this asset appears</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {data.usageReferences.map((usage) => (
              <div key={usage.id} className="rounded-2xl border border-border bg-background p-5">
                <div>
                  <h3 className="font-semibold text-foreground">{usage.title}</h3>
                  <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                    {usage.kind} · {usage.durationLabel}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    to={usage.href}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Open lesson editor
                  </Link>
                  <Link
                    to={usage.previewHref}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Preview lesson
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
