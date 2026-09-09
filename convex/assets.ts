import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { MAX_SIBLINGS, nextAssetOrder, renumberAssets } from "./lib/ordering";
import schema from "./schema";
import { assetKind, publishState } from "./validators";

/**
 * Admin reads for the asset editor.
 *
 * `usageReferences` is the reverse side of the `lessonAssets` join, which is
 * the whole reason the join is a table: answering "which lessons use this
 * asset" against an inline id array meant scanning every lesson in the module.
 *
 * No download URL is returned here. Resolving `ctx.storage.getUrl` in a public
 * query keyed by a client-supplied asset id would hand a signed link to any
 * caller who can guess a module slug, so file serving lands in Phase 6 together
 * with the decision about whether documents may sit behind a signed-but-public
 * URL at all.
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
