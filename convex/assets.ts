import type { R2Callbacks } from "@convex-dev/r2";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { MAX_SIBLINGS, nextAssetOrder, renumberAssets } from "./lib/ordering";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  deleteBlobIfPresent,
  r2,
} from "./lib/storage";
import schema from "./schema";
import { assetKind, publishState } from "./validators";

/**
 * The upload surface the browser talks to.
 *
 * `generateUploadUrl` takes no arguments, so the object key is a server-issued
 * uuid: a caller cannot name a key and therefore cannot overwrite another
 * asset's blob. `checkUpload` is the whole reason this is not simply re-exported
 * — an ungated upload-URL mutation lets anyone fill the bucket.
 *
 * `onSyncMetadata` is wired because the client-facing `syncMetadata` only
 * *schedules* the HEAD against R2, so authoritative size and content type are
 * not available yet when `attachFile` runs. See `applySyncedMetadata`.
 */
/**
 * The component invokes `onSyncMetadata` below by reference, so this module's
 * api has to be handed back to it. The explicit `R2Callbacks` annotation is
 * what keeps that from being a circular type: without it, TypeScript tries to
 * infer `generateUploadUrl` from an expression that mentions it.
 */
const callbacks: R2Callbacks = internal.assets;

export const { generateUploadUrl, syncMetadata, onSyncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireAdmin(ctx);
  },
  onSyncMetadata: async (ctx, args) => {
    await ctx.runMutation(internal.assets.applySyncedMetadata, { key: args.key });
  },
  callbacks,
});

/**
 * Admin reads for the asset editor.
 *
 * `usageReferences` is the reverse side of the `lessonAssets` join, which is
 * the whole reason the join is a table: answering "which lessons use this
 * asset" against an inline id array meant scanning every lesson in the module.
 *
 * `fileUrl` is a presigned R2 URL, resolved on every read and never written to
 * the row: it is an expiring credential, not a fact about the asset. The
 * earlier rule here forbade serving one from this query at all, but that was
 * written when nothing was gated; the objection was an *ungated* query keyed by
 * a client-supplied id, and this one calls `requireAdmin` first.
 */
export const adminDetail = query({
  args: { moduleSlug: v.string(), assetId: v.id("assets") },
  returns: v.object({
    module: schema.doc("modules"),
    asset: schema.doc("assets"),
    /** Lessons this asset is attached to, in lesson order. */
    usageReferences: v.array(schema.doc("lessons")),
    /** True when this asset is the module hero. */
    isFeatured: v.boolean(),
    /**
     * Presigned download URL, or null when no file is attached. Expires; do not
     * store it, and do not hand it to a surface that outlives the page.
     */
    fileUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const module = await ctx.db
      .query("modules")
      .withIndex("by_slug", (q) => q.eq("slug", args.moduleSlug))
      .unique();
    if (module === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `No module with slug "${args.moduleSlug}".`,
      });
    }

    const asset = await ctx.db.get("assets", args.assetId);
    if (asset === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That asset no longer exists." });
    }
    // Guard against an asset id from another module being read through this
    // module's URL.
    if (asset.moduleId !== module._id) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `That asset does not belong to "${args.moduleSlug}".`,
      });
    }

    const links = await ctx.db
      .query("lessonAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .take(MAX_SIBLINGS);

    const usageReferences = [];
    for (const link of links) {
      const lesson = await ctx.db.get("lessons", link.lessonId);
      if (lesson !== null) usageReferences.push(lesson);
    }
    usageReferences.sort((a, b) => a.order - b.order);

    return {
      module,
      asset,
      usageReferences,
      isFeatured: module.featuredAssetId === asset._id,
      fileUrl:
        asset.r2Key === undefined
          ? null
          : await r2.getUrl(asset.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS }),
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function assetOrThrow(ctx: MutationCtx, assetId: Id<"assets">): Promise<Doc<"assets">> {
  const asset = await ctx.db.get("assets", assetId);
  if (asset === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That asset no longer exists." });
  }
  return asset;
}

/**
 * Create an asset placeholder. The file itself arrives in Phase 6; this is the
 * row a later upload attaches to.
 */
export const create = mutation({
  args: {
    moduleId: v.id("modules"),
    title: v.string(),
    kind: assetKind,
    description: v.optional(v.string()),
    metaNote: v.optional(v.string()),
  },
  returns: v.id("assets"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await ctx.db.get("modules", args.moduleId);
    if (module === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
    }
    const title = args.title.trim();
    if (title.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "An asset needs a title." });
    }

    const assetId = await ctx.db.insert("assets", {
      moduleId: module._id,
      title,
      description: args.description?.trim() ?? "",
      kind: args.kind,
      publishState: "draft",
      order: await nextAssetOrder(ctx, module._id),
      ...(args.metaNote === undefined ? {} : { metaNote: args.metaNote.trim() }),
      ...stamp(),
    });

    await ctx.db.patch("modules", module._id, stamp());
    await recordAudit(ctx, {
      actor,
      action: "asset.create",
      entityTable: "assets",
      entityId: assetId,
      summary: title,
    });
    return assetId;
  },
});

export const update = mutation({
  args: {
    assetId: v.id("assets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    kind: v.optional(assetKind),
    metaNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const asset = await assetOrThrow(ctx, args.assetId);

    if (args.title !== undefined && args.title.trim().length === 0) {
      throw new ConvexError({ code: "INVALID", message: "An asset needs a title." });
    }

    await ctx.db.patch("assets", asset._id, {
      ...(args.title === undefined ? {} : { title: args.title.trim() }),
      ...(args.description === undefined ? {} : { description: args.description.trim() }),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.metaNote === undefined
        ? {}
        : { metaNote: args.metaNote.trim().length === 0 ? undefined : args.metaNote.trim() }),
      ...stamp(),
    });

    await recordAudit(ctx, {
      actor,
      action: "asset.update",
      entityTable: "assets",
      entityId: asset._id,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Clear every field that describes the *previous* file.
 *
 * Spread into the patch on both attach and detach. `pageCount` and
 * `durationSeconds` are the dangerous ones: nothing recomputes them, so a
 * replacement file would otherwise inherit the old file's page count.
 */
const CLEARED_FILE_FIELDS = {
  r2Key: undefined,
  fileName: undefined,
  contentType: undefined,
  sizeBytes: undefined,
  pageCount: undefined,
  durationSeconds: undefined,
} as const;

/** The asset holding this object key, if any. */
async function assetByKey(ctx: MutationCtx, key: string): Promise<Doc<"assets"> | null> {
  return await ctx.db
    .query("assets")
    .withIndex("by_r2Key", (q) => q.eq("r2Key", key))
    .unique();
}

/**
 * Record an uploaded file against its asset.
 *
 * Step three of the upload: the browser has already taken a signed URL and PUT
 * the bytes, so the blob exists but nothing references it. Until this runs the
 * object is an orphan.
 *
 * `contentType` and `sizeBytes` arrive from the browser's `File`, which is why
 * they are treated as a first guess rather than fact — `applySyncedMetadata`
 * overwrites both with what R2 reports. They are accepted at all so the editor
 * shows a correct size immediately instead of a blank while the sync lands.
 */
export const attachFile = mutation({
  args: {
    assetId: v.id("assets"),
    key: v.string(),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const asset = await assetOrThrow(ctx, args.assetId);

    const fileName = args.fileName.trim();
    if (fileName.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "An uploaded file needs a name." });
    }
    if (args.sizeBytes !== undefined && args.sizeBytes > MAX_FILE_BYTES) {
      throw new ConvexError({
        code: "INVALID",
        message: `That file is larger than the ${MAX_FILE_LABEL} limit.`,
      });
    }

    // Two assets sharing one blob would mean deleting either breaks the other.
    // Server-issued keys are uuids, so this is a guard against a replayed or
    // hand-crafted argument rather than an accident.
    const holder = await assetByKey(ctx, args.key);
    if (holder !== null && holder._id !== asset._id) {
      throw new ConvexError({
        code: "INVALID",
        message: "That file is already attached to another asset.",
      });
    }

    // Delete the outgoing blob before repointing the row. Doing it after would
    // leave the key unreachable if the patch failed, and the whole point of
    // this mutation owning the replacement is that a replace cannot leak
    // storage.
    if (asset.r2Key !== args.key) await deleteBlobIfPresent(ctx, asset.r2Key);

    await ctx.db.patch("assets", asset._id, {
      ...CLEARED_FILE_FIELDS,
      r2Key: args.key,
      fileName,
      ...(args.contentType === undefined ? {} : { contentType: args.contentType }),
      ...(args.sizeBytes === undefined ? {} : { sizeBytes: args.sizeBytes }),
      ...stamp(),
    });

    await ctx.db.patch("modules", asset.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "asset.attachFile",
      entityTable: "assets",
      entityId: asset._id,
      summary: fileName,
    });
    return null;
  },
});

/** Remove the file from an asset and delete its blob. Leaves the row in place. */
export const detachFile = mutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const asset = await assetOrThrow(ctx, args.assetId);
    if (asset.r2Key === undefined) return null;

    await deleteBlobIfPresent(ctx, asset.r2Key);
    await ctx.db.patch("assets", asset._id, { ...CLEARED_FILE_FIELDS, ...stamp() });
    await ctx.db.patch("modules", asset.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "asset.detachFile",
      entityTable: "assets",
      entityId: asset._id,
      summary: asset.fileName,
    });
    return null;
  },
});

/**
 * Replace the browser's guess at file metadata with what R2 actually reports.
 *
 * Reached only through the component's `onSyncMetadata` callback, which fires
 * once the scheduled HEAD against R2 has completed. `attachFile` cannot do this
 * itself: the client-facing `syncMetadata` is a mutation that merely schedules
 * that HEAD, so `r2.getMetadata` is still empty while the upload is being
 * recorded.
 *
 * No `requireAdmin` here, and that is deliberate — this is an `internalMutation`
 * invoked by the component, where there is no end-user identity to check. It is
 * unreachable from a client.
 *
 * Silent when the key belongs to no asset: the same callback fires for every
 * synced object, including the source files Phase 7 will attach to
 * `aiGenerations`.
 */
export const applySyncedMetadata = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await assetByKey(ctx, args.key);
    if (asset === null) return null;

    const metadata = await r2.getMetadata(ctx, args.key);
    if (metadata === null) return null;

    await ctx.db.patch("assets", asset._id, {
      ...(metadata.contentType === undefined ? {} : { contentType: metadata.contentType }),
      ...(metadata.size === undefined ? {} : { sizeBytes: metadata.size }),
    });
    return null;
  },
});

/**
 * Publish or unpublish an asset. The asset editor rendered this as read-only
 * text while its own copy promised publishing controls.
 */
export const setPublishState = mutation({
  args: { assetId: v.id("assets"), publishState },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const asset = await assetOrThrow(ctx, args.assetId);

    await ctx.db.patch("assets", asset._id, { publishState: args.publishState, ...stamp() });
    await recordAudit(ctx, {
      actor,
      action: `asset.${args.publishState}`,
      entityTable: "assets",
      entityId: asset._id,
    });
    return null;
  },
});

/**
 * Delete an asset and every reference to it.
 *
 * Three references have to go, or the read side starts rendering holes: the
 * lesson join rows, any lesson using it as hero media, and the module hero
 * pointer. This is exactly what an inline id array could not guarantee.
 *
 * The blob goes too. Deleting only the row would leave an object in the bucket
 * that nothing can ever reach or name again.
 */
export const remove = mutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const asset = await assetOrThrow(ctx, args.assetId);

    const links = await ctx.db
      .query("lessonAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
      .take(MAX_SIBLINGS);
    for (const link of links) await ctx.db.delete("lessonAssets", link._id);

    // Hero references live on the lessons of this module only, so the scan is
    // bounded by the module rather than the table.
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", asset.moduleId))
      .take(MAX_SIBLINGS);
    for (const lesson of lessons) {
      if (lesson.heroAssetId === asset._id) {
        await ctx.db.patch("lessons", lesson._id, { heroAssetId: undefined, ...stamp() });
      }
    }

    const module = await ctx.db.get("modules", asset.moduleId);
    if (module !== null && module.featuredAssetId === asset._id) {
      await ctx.db.patch("modules", module._id, { featuredAssetId: undefined });
    }

    await deleteBlobIfPresent(ctx, asset.r2Key);

    await ctx.db.delete("assets", asset._id);
    await renumberAssets(ctx, asset.moduleId);
    await ctx.db.patch("modules", asset.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "asset.remove",
      entityTable: "assets",
      entityId: asset._id,
      summary: asset.title,
    });
    return null;
  },
});
