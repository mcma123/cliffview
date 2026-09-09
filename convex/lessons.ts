import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import {
  MAX_SIBLINGS,
  assertSameMembers,
  nextLessonAssetOrder,
  nextLessonOrder,
  renumberLessons,
} from "./lib/ordering";
import schema from "./schema";
import { lessonKind, publishState } from "./validators";

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
    /**
     * Every asset on the parent module, so the attach picker can offer the ones
     * this lesson does not have yet without a second round trip.
     */
    moduleAssets: v.array(schema.doc("assets")),
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

    const moduleAssets = await ctx.db
      .query("assets")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    return {
      module,
      lesson,
      lessonCount: siblings.length,
      linkedAssets,
      heroAsset,
      moduleAssets,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Slug-safe form of a title. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Reserve a slug unique *within the module*. Lesson slugs are deliberately not
 * globally unique — the seed repeats `why-this-matters` across modules — so the
 * probe is scoped by `moduleId`.
 */
async function reserveLessonSlug(
  ctx: MutationCtx,
  moduleId: Id<"modules">,
  base: string,
): Promise<string> {
  const root = base.length > 0 ? base : "lesson";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const clash = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_slug", (q) => q.eq("moduleId", moduleId).eq("slug", candidate))
      .unique();
    if (clash === null) return candidate;
  }
  throw new ConvexError({
    code: "SLUG_EXHAUSTED",
    message: `Could not find a free lesson slug based on "${root}".`,
  });
}

async function lessonOrThrow(ctx: MutationCtx, lessonId: Id<"lessons">): Promise<Doc<"lessons">> {
  const lesson = await ctx.db.get("lessons", lessonId);
  if (lesson === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That lesson no longer exists." });
  }
  return lesson;
}

export const create = mutation({
  args: {
    moduleId: v.id("modules"),
    title: v.string(),
    kind: lessonKind,
    summary: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
  },
  returns: v.object({ lessonId: v.id("lessons"), slug: v.string() }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await ctx.db.get("modules", args.moduleId);
    if (module === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
    }
    const title = args.title.trim();
    if (title.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "A lesson needs a title." });
    }

    const slug = await reserveLessonSlug(ctx, module._id, slugify(title));
    const lessonId = await ctx.db.insert("lessons", {
      moduleId: module._id,
      slug,
      title,
      summary: args.summary?.trim() ?? "",
      kind: args.kind,
      order: await nextLessonOrder(ctx, module._id),
      // New lessons are drafts. Editorial state is no longer inferred from
      // whether some learner happened to finish them.
      publishState: "draft",
      ...(args.durationMinutes === undefined ? {} : { durationMinutes: args.durationMinutes }),
      ...stamp(),
    });

    await ctx.db.patch("modules", module._id, stamp());
    await recordAudit(ctx, {
      actor,
      action: "lesson.create",
      entityTable: "lessons",
      entityId: lessonId,
      summary: title,
    });
    return { lessonId, slug };
  },
});

export const update = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    kind: v.optional(lessonKind),
    durationMinutes: v.optional(v.number()),
    heroTitleOverride: v.optional(v.string()),
    heroDescriptionOverride: v.optional(v.string()),
    scenarioTitle: v.optional(v.string()),
    scenarioBody: v.optional(v.string()),
    reflectionPrompt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const lesson = await lessonOrThrow(ctx, args.lessonId);

    if (args.title !== undefined && args.title.trim().length === 0) {
      throw new ConvexError({ code: "INVALID", message: "A lesson needs a title." });
    }
    if (args.durationMinutes !== undefined && args.durationMinutes < 0) {
      throw new ConvexError({ code: "INVALID", message: "Duration cannot be negative." });
    }

    // An empty string clears an optional field rather than storing "". That
    // matters because the editor now shows unauthored fields as genuinely
    // empty, and clearing one must not persist a blank as content.
    const optionalText = (value: string | undefined) =>
      value === undefined ? undefined : value.trim().length === 0 ? undefined : value.trim();

    await ctx.db.patch("lessons", lesson._id, {
      ...(args.title === undefined ? {} : { title: args.title.trim() }),
      ...(args.summary === undefined ? {} : { summary: args.summary.trim() }),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.durationMinutes === undefined ? {} : { durationMinutes: args.durationMinutes }),
      ...(args.heroTitleOverride === undefined
        ? {}
        : { heroTitleOverride: optionalText(args.heroTitleOverride) }),
      ...(args.heroDescriptionOverride === undefined
        ? {}
        : { heroDescriptionOverride: optionalText(args.heroDescriptionOverride) }),
      ...(args.scenarioTitle === undefined
        ? {}
        : { scenarioTitle: optionalText(args.scenarioTitle) }),
      ...(args.scenarioBody === undefined ? {} : { scenarioBody: optionalText(args.scenarioBody) }),
      ...(args.reflectionPrompt === undefined
        ? {}
        : { reflectionPrompt: optionalText(args.reflectionPrompt) }),
      ...stamp(),
    });

    await ctx.db.patch("modules", lesson.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "lesson.update",
      entityTable: "lessons",
      entityId: lesson._id,
    });
    return null;
  },
});

export const setPublishState = mutation({
  args: { lessonId: v.id("lessons"), publishState },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const lesson = await lessonOrThrow(ctx, args.lessonId);

    await ctx.db.patch("lessons", lesson._id, { publishState: args.publishState, ...stamp() });
    await ctx.db.patch("modules", lesson.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: `lesson.${args.publishState}`,
      entityTable: "lessons",
      entityId: lesson._id,
    });
    return null;
  },
});

/**
 * Move a lesson one position. Backs the up/down controls, which had no handler
 * at all and were self-documented as visual only.
 *
 * A swap of two adjacent rows inside one transaction, so there is no moment
 * where two lessons share an order.
 */
export const move = mutation({
  args: { lessonId: v.id("lessons"), direction: v.union(v.literal("up"), v.literal("down")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const lesson = await lessonOrThrow(ctx, args.lessonId);

    const siblings = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", lesson.moduleId))
      .take(MAX_SIBLINGS);
    const index = siblings.findIndex((row) => row._id === lesson._id);
    const swapWith = args.direction === "up" ? index - 1 : index + 1;

    // Already at the end: a no-op rather than an error, so holding the button
    // down does not throw.
    if (swapWith < 0 || swapWith >= siblings.length) return null;

    const other = siblings[swapWith];
    await ctx.db.patch("lessons", lesson._id, { order: other.order });
    await ctx.db.patch("lessons", other._id, { order: lesson.order });
    await ctx.db.patch("modules", lesson.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: `lesson.move.${args.direction}`,
      entityTable: "lessons",
      entityId: lesson._id,
    });
    return null;
  },
});

/** Reorder the whole lesson list. Rejects a stale id set rather than corrupting it. */
export const reorder = mutation({
  args: { moduleId: v.id("modules"), orderedIds: v.array(v.id("lessons")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const siblings = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", args.moduleId))
      .take(MAX_SIBLINGS);

    assertSameMembers(
      args.orderedIds,
      siblings.map((row) => row._id),
    );

    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch("lessons", args.orderedIds[i], { order: i + 1 });
    }
    await ctx.db.patch("modules", args.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "lesson.reorder",
      entityTable: "modules",
      entityId: args.moduleId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { lessonId: v.id("lessons") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const lesson = await lessonOrThrow(ctx, args.lessonId);

    // Join rows first: an orphaned lessonAssets row would point at nothing.
    const links = await ctx.db
      .query("lessonAssets")
      .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lesson._id))
      .take(MAX_SIBLINGS);
    for (const link of links) await ctx.db.delete("lessonAssets", link._id);

    // Learner progress rows reference the lesson, so they go with it. The
    // table is empty until Phase 8 wires learner progress, but deleting a
    // lesson must not be able to leave a dangling reference behind later.
    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lesson._id))
      .take(MAX_SIBLINGS);
    for (const row of progress) await ctx.db.delete("lessonProgress", row._id);

    await ctx.db.delete("lessons", lesson._id);
    await renumberLessons(ctx, lesson.moduleId);
    await ctx.db.patch("modules", lesson.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "lesson.remove",
      entityTable: "lessons",
      entityId: lesson._id,
      summary: lesson.title,
    });
    return null;
  },
});

/**
 * Attach an asset to a lesson.
 *
 * Two invariants the old inline `documentIds` array could not hold: the asset
 * must belong to the same module, and the same asset cannot be attached twice.
 */
export const attachAsset = mutation({
  args: { lessonId: v.id("lessons"), assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const lesson = await lessonOrThrow(ctx, args.lessonId);
    const asset = await ctx.db.get("assets", args.assetId);
    if (asset === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That asset no longer exists." });
    }
    if (asset.moduleId !== lesson.moduleId) {
      throw new ConvexError({
        code: "CROSS_MODULE",
        message: "An asset can only be attached to lessons in its own module.",
      });
    }

    const existing = await ctx.db
      .query("lessonAssets")
      .withIndex("by_lessonId_and_assetId", (q) =>
        q.eq("lessonId", lesson._id).eq("assetId", asset._id),
      )
      .unique();
    if (existing !== null) return null;

    await ctx.db.insert("lessonAssets", {
      lessonId: lesson._id,
      assetId: asset._id,
      order: await nextLessonAssetOrder(ctx, lesson._id),
    });
    await ctx.db.patch("lessons", lesson._id, stamp());
    await recordAudit(ctx, {
      actor,
      action: "lesson.attachAsset",
      entityTable: "lessons",
      entityId: lesson._id,
      summary: asset.title,
    });
    return null;
  },
});

export const detachAsset = mutation({
  args: { lessonId: v.id("lessons"), assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const lesson = await lessonOrThrow(ctx, args.lessonId);

    const link = await ctx.db
      .query("lessonAssets")
      .withIndex("by_lessonId_and_assetId", (q) =>
        q.eq("lessonId", lesson._id).eq("assetId", args.assetId),
      )
      .unique();
    if (link === null) return null;

    await ctx.db.delete("lessonAssets", link._id);
    await ctx.db.patch("lessons", lesson._id, stamp());
    await recordAudit(ctx, {
      actor,
      action: "lesson.detachAsset",
      entityTable: "lessons",
      entityId: lesson._id,
    });
    return null;
  },
});
