import {
  Download,
  ExternalLink,
  FileText,
  Headphones,
  Image as ImageIcon,
  Sparkles,
  Video,
} from "lucide-react";

import type { LessonMaterialView } from "./lesson-material-view";
import { cn } from "@/lib/utils";

const KIND_ICONS = {
  video: Video,
  audio: Headphones,
  document: FileText,
  worksheet: Sparkles,
  image: ImageIcon,
} as const;

/**
 * One piece of lesson material, rendered the way its file can actually be read.
 *
 * The `media` discriminator comes from the presenter and is resolved from the
 * file's content type rather than the asset's `kind`, because `kind` is a label
 * an admin picks from a dropdown and nothing validates it. This page used to
 * render `<video>` for anything labelled "video", including a PDF.
 *
 * Prop-driven, no Convex import: the route owns the query, this owns the
 * chrome.
 */
export function LessonMaterial({ material }: { material: LessonMaterialView }) {
  const Icon = KIND_ICONS[material.kind] ?? FileText;
  const { url } = material;

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {url !== null && material.media === "video" ? (
        <video
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black"
          src={url}
        >
          Your browser cannot play this video.
        </video>
      ) : null}

      {url !== null && material.media === "image" ? (
        // The title is the alt text: it is the only description of the image
        // anybody wrote, and an empty alt would hide it from a screen reader
        // entirely rather than mark it decorative, which it is not.
        <img src={url} alt={material.title} className="w-full bg-muted object-contain" />
      ) : null}

      <div className="p-6">
        {url !== null && material.media === "audio" ? (
          <audio controls preload="metadata" className="mb-4 w-full" src={url} />
        ) : null}

        {url !== null && material.media === "pdf" ? (
          <div className="mb-4">
            {/*
              The browser's own PDF viewer. No dependency, and it brings page
              navigation, search, zoom and printing with it. `title` is what a
              screen reader announces for the frame.
            */}
            <iframe
              title={material.title}
              src={url}
              className="h-[36rem] w-full rounded-2xl border border-border bg-muted"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <div className="min-w-0">
              <p className="font-bold text-foreground">{material.title}</p>
              {material.description === "" ? null : (
                <p className="mt-1 text-sm text-muted-foreground">{material.description}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {material.meta}
                {material.media === "download" && url !== null ? (
                  // Said plainly rather than offering a preview that cannot
                  // work: a browser has no way to display Word or PowerPoint.
                  <span> · opens in the app it was made with</span>
                ) : null}
              </p>
            </div>
          </div>

          {url === null ? (
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              No file yet
            </span>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              // `download` is deliberately absent: for a PDF or an image the
              // useful action is to open it, and the browser decides. Forcing a
              // save would fight the viewer embedded right above.
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border px-4 py-2.5",
                "text-sm font-semibold text-foreground transition-colors hover:bg-muted",
              )}
            >
              {material.media === "download" ? (
                <>
                  <Download className="h-4 w-4" /> Download
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" /> Open full screen
                </>
              )}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
