import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Headphones, Paperclip, Video } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Attach one of the module's existing assets to a lesson.
 *
 * Previously this dialog had no callback and no state beyond `open`: its
 * Cancel and "Attach file" buttons both just closed it, and it never received
 * a lesson or asset id, so attaching was impossible by construction.
 *
 * It is a picker rather than an uploader because attaching an existing asset is
 * the operation the backend supports today; uploading a new file arrives with
 * storage in a later phase. Still prop-driven — no Convex import here.
 */
export type AttachableAsset = {
  id: string;
  title: string;
  kind: "video" | "audio" | "document" | "worksheet";
  meta: string;
  alreadyAttached: boolean;
};

const kindIcon = {
  video: Video,
  audio: Headphones,
  document: FileText,
  worksheet: FileText,
} as const;

export function AttachContentDialog({
  children,
  lessonTitle,
  assets,
  onAttach,
}: {
  children: React.ReactNode;
  lessonTitle?: string;
  assets: AttachableAsset[];
  onAttach: (assetId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const available = assets.filter((asset) => !asset.alreadyAttached);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border bg-card px-6 py-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
              <Paperclip className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-foreground">
                Attach a resource
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Pick one of this module&apos;s assets to attach to{" "}
                {lessonTitle === undefined ? "this lesson" : `"${lessonTitle}"`}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 p-6 sm:p-8">
          {available.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
              {assets.length === 0
                ? "This module has no assets yet. Add one from the module editor first."
                : "Every asset in this module is already attached to this lesson."}
            </p>
          ) : (
            available.map((asset) => {
              const Icon = kindIcon[asset.kind];
              const busy = busyId === asset.id;
              return (
                <button
                  key={asset.id}
                  disabled={busy}
                  onClick={async () => {
                    setBusyId(asset.id);
                    try {
                      await onAttach(asset.id);
                      setOpen(false);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted",
                    busy && "opacity-60",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">
                      {asset.title}
                    </span>
                    <span className="block truncate text-xs uppercase tracking-widest text-muted-foreground">
                      {asset.kind} · {asset.meta}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {busy ? "Attaching…" : "Attach"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
