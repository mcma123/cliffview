import { useCallback, useRef, useState } from "react";
import { Download, FileText, Headphones, Image as ImageIcon, Maximize2, Video } from "lucide-react";

import type { LessonMaterialView } from "./lesson-material-view";
import { materialAction } from "@/lib/lesson-media";
import { cn } from "@/lib/utils";

/**
 * The icon follows `media`, not `kind`.
 *
 * `kind` is a dropdown an admin picks from, and "Add placeholder asset"
 * hardcodes `document` — so a perfectly good MP4 uploaded that way sat behind a
 * document icon while playing as a video. `media` is resolved from the file's
 * own content type, so it is the one that matches what the reader sees.
 */
const MEDIA_ICONS = {
  video: Video,
  audio: Headphones,
  pdf: FileText,
  image: ImageIcon,
  download: FileText,
} as const;

/** A video element on iOS, which has fullscreen but not the standard call. */
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

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
  const Icon = MEDIA_ICONS[material.media] ?? FileText;
  const frameRef = useRef<HTMLElement | null>(null);

  /**
   * The first URL this material was given, held for the life of the mount.
   *
   * `learn.lesson` mints a fresh signed R2 URL on every execution, and it also
   * reads `lessonProgress` — so the moment the page records "in progress", the
   * query re-runs and hands back a *different* URL for the very same bytes.
   * Letting that reach `<video src>` tears the media element down and restarts
   * the download from zero, which on a 57 MB file is most of the wait somebody
   * notices. A signed URL lasts six hours, chosen in `lib/storage.ts` to
   * "outlive any plausible cache lifetime", so pinning one for a mount is what
   * that TTL is for. Keyed by asset id at the call site, so a genuinely
   * different asset remounts and re-pins.
   */
  const [pinnedUrl] = useState(material.url);
  const url = pinnedUrl ?? material.url;

  const action = materialAction(material.media, url !== null);

  const goFullscreen = useCallback(() => {
    const element = frameRef.current;
    if (element === null) return;

    if (typeof element.requestFullscreen === "function") {
      // Rejects when the browser refuses — a gesture it did not trust, or a
      // permissions policy. Nothing to recover, but an unhandled rejection in
      // the console is worse than silence.
      void element.requestFullscreen().catch(() => undefined);
      return;
    }

    // iOS Safari has no element fullscreen except on a video, where it is
    // spelled differently and returns nothing.
    const video = element as IosVideo;
    if (typeof video.webkitEnterFullscreen === "function") {
      video.webkitEnterFullscreen();
      return;
    }

    // Neither exists. Opening the file is worse than fullscreen but far better
    // than a button that does nothing at all.
    if (url !== null) window.open(url, "_blank", "noreferrer");
  }, [url]);

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {url !== null && material.media === "video" ? (
        <video
          ref={(node) => {
            frameRef.current = node;
          }}
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
        <img
          ref={(node) => {
            frameRef.current = node;
          }}
          src={url}
          alt={material.title}
          className="w-full bg-muted object-contain"
        />
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
              ref={(node) => {
                frameRef.current = node;
              }}
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
                {action === "download" ? (
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
          ) : action === "download" ? (
            <a
              href={url}
              download={material.fileName ?? undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border px-4 py-2.5",
                "text-sm font-semibold text-foreground transition-colors hover:bg-muted",
              )}
            >
              <Download className="h-4 w-4" /> Download
            </a>
          ) : action === "fullscreen" ? (
            // A button, not a link. It used to be an anchor to the signed URL,
            // which threw a teacher out of the lesson into a new tab to watch
            // a video that was already playing in front of them.
            <button
              type="button"
              onClick={goFullscreen}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border px-4 py-2.5",
                "text-sm font-semibold text-foreground transition-colors hover:bg-muted",
              )}
            >
              <Maximize2 className="h-4 w-4" /> Full screen
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
