import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { academyQueries } from "@/infrastructure/academy/container";
import { ArrowLeft, Eye, FileText, Headphones, Upload, Video } from "lucide-react";

export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/assets/$assetId")({
  head: () => ({ meta: [{ title: "Asset Editor · Cliffview Academy" }] }),
  loader: ({ params }) => academyQueries.getAdminAssetDetail(params.moduleSlug, params.assetId),
  component: AdminAssetEditor,
});

function AdminAssetEditor() {
  const data = Route.useLoaderData();
  const AssetIcon =
    data.assetKind === "audio" ? Headphones : data.assetKind === "video" ? Video : FileText;

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
                  defaultValue={data.assetTitle}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Asset type
                </span>
                <div className="rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground">
                  {data.assetKind}
                </div>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  File metadata
                </span>
                <input
                  defaultValue={data.assetMeta}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Publish state
                </span>
                <div className="rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground">
                  {data.assetStatus}
                </div>
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Learner-facing description
              </span>
              <textarea
                defaultValue={data.assetDescription}
                className="min-h-32 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Placeholder state
              </p>
              <div className="mt-5 rounded-2xl border border-dashed border-border bg-background p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{data.placeholderState}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This is the admin-side placeholder upload panel for the final backend flow.
                    </p>
                    <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                      <Upload className="h-4 w-4" /> Replace placeholder file
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Editor hints</p>
              <div className="mt-5 space-y-3">
                {data.uploadHints.map((hint) => (
                  <div
                    key={hint.title}
                    className="rounded-2xl border border-dashed border-border bg-background p-5"
                  >
                    <h3 className="font-semibold text-foreground">{hint.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{hint.description}</p>
                  </div>
                ))}
              </div>
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
