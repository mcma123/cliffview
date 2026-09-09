import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { MAX_SIBLINGS } from "./lib/ordering";
import schema from "./schema";

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
