import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import { MAX_SIBLINGS } from "./lib/ordering";
import schema from "./schema";

/**
 * Admin reads for the lesson editor.
 *
 * `linkedAssets` comes from the `lessonAssets` join and is exactly what the
 * lesson has attached — an empty list means empty. The old resolver fell back
 * to every non-video asset in the module whenever the join was empty or
 * dangling, so a brand-new lesson claimed three attachments it never had.
 *
 * AUTHORIZATION: `requireAdmin` on every entry point. These queries expose
 * draft and archived content and the full asset list, so they are tighter than
 * the plan's `requireStaff`: being signed in as staff is not the same as being
 * allowed to see unpublished material. Learner-facing content queries arrive in
 * Phase 8 and will filter on `publishState` instead.
 */
export const adminDetail = query({
  args: { moduleSlug: v.string(), lessonSlug: v.string() },
  returns: v.object({
    module: schema.doc("modules"),
    lesson: schema.doc("lessons"),
    /** Total lessons in the module, for the "Lesson 3 of 7" label. */
    lessonCount: v.number(),
    linkedAssets: v.array(schema.doc("assets")),
    heroAsset: v.union(schema.doc("assets"), v.null()),
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

    // Lesson slugs are unique per module, not globally: the seed repeats ids
    // such as why-this-matters across modules, which is fine because the parent
    // scopes the lookup.
    const lesson = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_slug", (q) =>
        q.eq("moduleId", module._id).eq("slug", args.lessonSlug),
      )
      .unique();
    if (lesson === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `No lesson "${args.lessonSlug}" in module "${args.moduleSlug}".`,
      });
    }

    const siblings = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const links = await ctx.db
      .query("lessonAssets")
      .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lesson._id))
      .take(MAX_SIBLINGS);

    const linkedAssets = [];
    for (const link of links) {
      const asset = await ctx.db.get("assets", link.assetId);
      // A join row whose asset is gone is skipped rather than rendered as a
      // hole. `assets.remove` deletes its join rows, so this should not happen.
      if (asset !== null) linkedAssets.push(asset);
    }

    const heroAsset =
      lesson.heroAssetId === undefined ? null : await ctx.db.get("assets", lesson.heroAssetId);

    return { module, lesson, lessonCount: siblings.length, linkedAssets, heroAsset };
  },
});
