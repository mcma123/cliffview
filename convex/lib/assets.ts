import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_FILE_BYTES, MAX_FILE_LABEL } from "./storage";

/**
 * The rules an uploaded file has to satisfy before a row may point at it.
 *
 * Shared because two mutations now record an upload: `assets.attachFile`
 * replaces the file on an existing row, and `lessons.addMaterial` creates a row
 * around a file that has just landed. They are the same rules, and a second
 * copy is how one of them later stops refusing something the other refuses.
 */

/** The asset currently holding an R2 key, if any. */
export async function assetByKey(ctx: MutationCtx, key: string): Promise<Doc<"assets"> | null> {
  return await ctx.db
    .query("assets")
    .withIndex("by_r2Key", (q) => q.eq("r2Key", key))
    .unique();
}

/**
 * Refuse a key another asset already holds.
 *
 * Two assets sharing one blob would mean deleting either breaks the other.
 * Server-issued keys are uuids, so this guards against a replayed or
 * hand-crafted argument rather than an accident. `exceptAssetId` lets a row
 * re-record the key it already has, which is what replacing a file does.
 */
export async function assertKeyUnclaimed(
  ctx: MutationCtx,
  key: string,
  exceptAssetId?: Id<"assets">,
): Promise<void> {
  const holder = await assetByKey(ctx, key);
  if (holder !== null && holder._id !== exceptAssetId) {
    throw new ConvexError({
      code: "INVALID",
      message: "That file is already attached to another asset.",
    });
  }
}

/**
 * Validate the file facts the browser reported, returning the trimmed name.
 *
 * The size check is a courtesy, not a defence: a presigned PUT cannot be
 * size-capped, so by the time this runs the bytes have already landed. It still
 * refuses the row, which is what keeps an over-cap file from becoming reachable.
 */
export function assertFileFacts(fileName: string, sizeBytes: number | undefined): string {
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    throw new ConvexError({ code: "INVALID", message: "An uploaded file needs a name." });
  }
  if (sizeBytes !== undefined && sizeBytes > MAX_FILE_BYTES) {
    throw new ConvexError({
      code: "INVALID",
      message: `That file is larger than the ${MAX_FILE_LABEL} limit.`,
    });
  }
  return trimmed;
}
