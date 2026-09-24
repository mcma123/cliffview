/**
 * What the action button beside a piece of lesson material should do.
 *
 * A pure rule, deliberately separated from the component that performs it.
 * `vitest.config.ts` runs `src/lib/**` under `edge-runtime` with no DOM, so a
 * React component calling the Fullscreen API cannot be tested here — but the
 * decision it acts on can be, and that is the part worth pinning.
 */

/** Mirrors `LessonMaterialMedia` in the presenter. */
export type MediaKind = "video" | "audio" | "pdf" | "image" | "download";

export type MaterialAction = "fullscreen" | "download" | "none";

/**
 * Anything a browser can display goes fullscreen **in the app**; anything it
 * cannot is a download.
 *
 * Video, PDFs and images all render in place already, so sending somebody to a
 * new tab to see them bigger undoes the reason they were put in place. Word,
 * PowerPoint and Excel genuinely cannot be shown by a browser, so a download is
 * the honest affordance rather than a preview that would fail.
 *
 * Audio has no fullscreen worth entering — a player with no picture filling the
 * screen is a black rectangle — so it gets no button at all. The inline
 * controls are the whole interface.
 */
export function materialAction(media: MediaKind, hasFile: boolean): MaterialAction {
  if (!hasFile) return "none";
  if (media === "audio") return "none";
  if (media === "download") return "download";
  return "fullscreen";
}
