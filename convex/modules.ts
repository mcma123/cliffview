import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { MAX_MODULES } from "./lib/counts";
import { MAX_SIBLINGS } from "./lib/ordering";
import schema from "./schema";

/**
 * Admin reads for the module content studio.
 *
 * These return documents plus small derived counts. No display prose, no
 * relative-time labels and no hrefs: `src/application/academy/presenters.ts`
 * owns every user-facing string, so the same data can serve a different label
 * without a backend change.
 *
 * AUTHORIZATION: these are public and unauthenticated for now. They return
 * module content only — titles, copy, publish state, lesson prose — with no
 * personal, financial or audit data, and the learner side reads the same
 * content. Phase 4 adds `requireStaff` once an auth provider exists; until
 * then there is nothing to check against. Anything privileged stays an
 * `internalQuery` (see `convex/dashboard.ts`).
 */

/** Resolve a module by its URL slug, or throw a typed not-found. */
async function moduleBySlugOrThrow(ctx: QueryCtx, slug: string): Promise<Doc<"modules">> {
  const module = await ctx.db
    .query("modules")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (module === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: `No module with slug "${slug}".` });
  }
  return module;
}

/** Attachment count for one lesson. Bounded: a lesson holds a handful of assets. */
async function attachedAssetCount(ctx: QueryCtx, lessonId: Id<"lessons">): Promise<number> {
  const links = await ctx.db
    .query("lessonAssets")
    .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lessonId))
    .take(MAX_SIBLINGS);
  return links.length;
}

/**
 * The module library grid.
 *
 * Lesson and asset counts are derived, never stored. The old `sectionCount`
 * field disagreed with the actual lesson list on seven of nine modules, and
 * nothing recomputed it.
 */
export const listForAdmin = query({
  args: {},
  returns: v.array(
    v.object({
      module: schema.doc("modules"),
      lessonCount: v.number(),
      assetCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const modules = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_MODULES);

    const rows = [];
    for (const module of modules) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
        .take(MAX_SIBLINGS);
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
        .take(MAX_SIBLINGS);
      rows.push({ module, lessonCount: lessons.length, assetCount: assets.length });
    }
    return rows;
  },
});

/**
 * Everything the module editor renders, in one transaction: the module, its
 * objectives, its lessons with attachment counts, its assets, and the resolved
 * featured asset.
 *
 * `featuredAsset` is null when unset. The old resolver fell back to
 * `resources[0]`, so a broken reference rendered as if it were intentional.
 */
export const adminDetail = query({
  args: { slug: v.string() },
  returns: v.object({
    module: schema.doc("modules"),
    objectives: v.array(schema.doc("moduleObjectives")),
    lessons: v.array(
      v.object({
        lesson: schema.doc("lessons"),
        attachedAssetCount: v.number(),
      }),
    ),
    assets: v.array(schema.doc("assets")),
    featuredAsset: v.union(schema.doc("assets"), v.null()),
  }),
  handler: async (ctx, args) => {
    const module = await moduleBySlugOrThrow(ctx, args.slug);

    const objectives = await ctx.db
      .query("moduleObjectives")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const lessonDocs = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const lessons = [];
    for (const lesson of lessonDocs) {
      lessons.push({ lesson, attachedAssetCount: await attachedAssetCount(ctx, lesson._id) });
    }

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const featuredAsset =
      module.featuredAssetId === undefined
        ? null
        : await ctx.db.get("assets", module.featuredAssetId);

    return { module, objectives, lessons, assets, featuredAsset };
  },
});
