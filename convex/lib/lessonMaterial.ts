import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertFileFacts, assertKeyUnclaimed } from "./assets";
import { stamp } from "./audit";
import { nextAssetOrder, nextLessonAssetOrder } from "./ordering";
import type { AssetKind } from "../validators";

/**
 * Putting a file onto a lesson.
 *
 * Lifted out of `lessons.addMaterial` because a second caller arrived that
 * cannot be a public mutation: the AI video poller attaches a generated file on
 * behalf of a job an admin authorized minutes earlier, and a scheduled function
 * has no identity to check.
 *
 * Shared rather than copied because this enforces five things that are each
 * easy to forget in a second implementation — the file facts, the unclaimed
 * key, the publish rule, and two separate order sequences. The same argument
 * that produced `lib/assets.ts` and `lib/questions.ts`.
 *
 * Deliberately does **not** call `requireAdmin` or `recordAudit`: authorization
 * and the audit line stay with the caller, because the actor differs. A person
 * dropping a file writes `lesson.addMaterial` under their own id; a job writes
 * its own verb under the id of whoever started it.
 */
export async function createLessonMaterial(
  ctx: MutationCtx,
  args: {
    /**
     * The lesson document, not its id.
     *
     * Forces the caller to have resolved and checked it. The poller's lesson
     * may have been deleted while the video rendered, and that has to be a
     * handled outcome rather than a crash inside here.
     */
    lesson: Doc<"lessons">;
    /** Server-issued R2 object key. */
    key: string;
    fileName: string;
    title: string;
    kind: AssetKind;
    /**
     * What the file actually is.
     *
     * Load-bearing, and the only writer: `resolveMedia` in the presenter picks
     * the player from this and consults `kind` only when it is undefined, and
     * nothing backfills it for a server-stored file — `r2.store` syncs metadata
     * without an `onComplete` handle, so `assets.applySyncedMetadata` never
     * fires for one. A video attached without `video/...` here renders as a
     * download link forever.
     */
    contentType?: string;
    sizeBytes?: number;
  },
): Promise<Id<"assets">> {
  const fileName = assertFileFacts(args.fileName, args.sizeBytes);
  const title = args.title.trim();
  if (title.length === 0) {
    throw new ConvexError({ code: "INVALID", message: "An asset needs a title." });
  }
  await assertKeyUnclaimed(ctx, args.key);

  const assetId = await ctx.db.insert("assets", {
    // The asset belongs to the module, not the lesson: that is the ownership
    // the schema models, and it is what lets the same file be attached to a
    // second lesson later without uploading it twice.
    moduleId: args.lesson.moduleId,
    title,
    description: "",
    kind: args.kind,
    // Published, not draft. `learn.lesson` skips any attachment that is not
    // published, so a draft here is a file nobody on the staff side can see —
    // indistinguishable from the upload having failed.
    publishState: "published",
    order: await nextAssetOrder(ctx, args.lesson.moduleId),
    r2Key: args.key,
    fileName,
    ...(args.contentType === undefined ? {} : { contentType: args.contentType }),
    ...(args.sizeBytes === undefined ? {} : { sizeBytes: args.sizeBytes }),
    ...stamp(),
  });

  await ctx.db.insert("lessonAssets", {
    lessonId: args.lesson._id,
    assetId,
    order: await nextLessonAssetOrder(ctx, args.lesson._id),
  });

  await ctx.db.patch("lessons", args.lesson._id, stamp());
  await ctx.db.patch("modules", args.lesson.moduleId, stamp());

  return assetId;
}
