import type { ModuleAssetKind } from "@/domain/academy/entities";

/**
 * One attachment, as the lesson page needs it.
 *
 * Declared structurally rather than imported from the presenter, because
 * components take view-model props and do not reach into `@/application`. The
 * route hands `presentLearnerLesson`'s output straight in, so a drift between
 * the two is a compile error at that call site.
 */
export type LessonMaterialView = {
  id: string;
  title: string;
  description: string;
  kind: ModuleAssetKind;
  /**
   * How to render it, resolved from the file's content type rather than its
   * `kind` — see `resolveMedia` in the presenter. "download" covers Word,
   * PowerPoint and anything else a browser cannot display, and any row whose
   * file has not been uploaded yet.
   */
  media: "video" | "audio" | "pdf" | "image" | "download";
  contentType: string | null;
  fileName: string | null;
  /** A short-lived signed URL, or null when no file is attached. */
  url: string | null;
  meta: string;
};
