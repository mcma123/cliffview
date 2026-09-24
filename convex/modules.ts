import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { assertAssessmentReady } from "./lib/assessments";
import { requireAdmin } from "./lib/authz";
import { assignableStaff } from "./lib/enrollment";
import { internal } from "./_generated/api";
import { moduleCategory, publishState } from "./validators";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { MAX_MODULES } from "./lib/counts";
import { MAX_OPTIONS, MAX_SIBLINGS } from "./lib/ordering";
import { deleteBlobIfPresent } from "./lib/storage";
import schema from "./schema";

/**
 * Admin reads for the module content studio.
 *
 * These return documents plus small derived counts. No display prose, no
 * relative-time labels and no hrefs: `src/application/academy/presenters.ts`
 * owns every user-facing string, so the same data can serve a different label
 * without a backend change.
 *
 * AUTHORIZATION: `requireAdmin` on every entry point. These queries expose
 * draft and archived content and the full asset list, so they are tighter than
 * the plan's `requireStaff`: being signed in as staff is not the same as being
 * allowed to see unpublished material. Learner-facing content queries arrive in
 * Phase 8 and will filter on `publishState` instead.
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

/**
 * The assets attached to one lesson. Bounded: a lesson holds a handful.
 *
 * Ids rather than a bare count, because the module editor's attach picker has
 * to know which assets a lesson already has. With only a count it hardcoded
 * `alreadyAttached: false` and offered every asset, including the attached
 * ones. The count is `.length`.
 */
async function attachedAssetIds(
  ctx: QueryCtx,
  lessonId: Id<"lessons">,
): Promise<Array<Id<"assets">>> {
  const links = await ctx.db
    .query("lessonAssets")
    .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lessonId))
    .take(MAX_SIBLINGS);
  return links.map((link) => link.assetId);
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
    await requireAdmin(ctx);
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
        attachedAssetIds: v.array(v.id("assets")),
      }),
    ),
    assets: v.array(schema.doc("assets")),
    featuredAsset: v.union(schema.doc("assets"), v.null()),
    /**
     * How many assessment questions this module has, so the editor can link to
     * the builder and say what is there. A count, not the questions themselves:
     * the builder is its own screen with its own subscription, and folding the
     * whole bank in here would repaint this page on every question save.
     */
    questionCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
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
      lessons.push({ lesson, attachedAssetIds: await attachedAssetIds(ctx, lesson._id) });
    }

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const featuredAsset =
      module.featuredAssetId === undefined
        ? null
        : await ctx.db.get("assets", module.featuredAssetId);

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    return {
      module,
      objectives,
      lessons,
      assets,
      featuredAsset,
      questionCount: questions.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
//
// Every one calls `requireAdmin` first, before reading or writing anything, and
// stamps `contentUpdatedAt`. Who acted goes to `auditLog`, never onto the row.

/**
 * The three numbers on a module, checked the same way wherever they are set.
 *
 * Worth being strict about, because one of them is irreversible. `cptdPoints`
 * is multiplied by `XP_PER_CPTD_POINT` and **incremented** onto `users.xpTotal`
 * when somebody finishes the module — awards record what a person was paid at
 * the time and are never recomputed, so a negative value would permanently
 * subtract from a teacher's total with no path back, and a fractional one would
 * pay fractional XP. `passMark` is what `learn.submitAssessment` grades against.
 *
 * Magnitude is deliberately the school's business: there is no upper bound on
 * duration or CPTD points, because any ceiling we picked would be a policy
 * nobody could reconcile against anything.
 */
function assertModuleNumbers(args: {
  durationMinutes?: number;
  cptdPoints?: number;
  passMark?: number;
}): void {
  for (const [field, label] of [
    ["durationMinutes", "Duration"],
    ["cptdPoints", "CPTD points"],
  ] as const) {
    const value = args[field];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new ConvexError({
        code: "INVALID",
        message: `${label} must be a whole number, zero or more.`,
      });
    }
  }

  if (args.passMark !== undefined) {
    if (!Number.isInteger(args.passMark) || args.passMark < 0 || args.passMark > 100) {
      throw new ConvexError({
        code: "INVALID",
        message: "Pass mark must be a whole number between 0 and 100.",
      });
    }
  }
}

/** Slug-safe form of a title: lowercase, alphanumeric, single hyphens. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Reserve a unique slug. Convex has no unique constraint, so uniqueness is a
 * mutation invariant: probe the index and suffix until one is free.
 */
async function reserveSlug(ctx: MutationCtx, base: string): Promise<string> {
  const root = base.length > 0 ? base : "module";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const clash = await ctx.db
      .query("modules")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (clash === null) return candidate;
  }
  throw new ConvexError({
    code: "SLUG_EXHAUSTED",
    message: `Could not find a free slug based on "${root}".`,
  });
}

/** Load a module or throw a typed not-found. */
async function moduleOrThrow(ctx: MutationCtx, moduleId: Id<"modules">): Promise<Doc<"modules">> {
  const module = await ctx.db.get("modules", moduleId);
  if (module === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
  }
  return module;
}

/**
 * Create a module. Always a draft: publishing is a separate, gated step, so a
 * half-written module can never appear to staff.
 */
export const create = mutation({
  args: {
    title: v.string(),
    category: moduleCategory,
    description: v.optional(v.string()),
    audience: v.optional(v.string()),
    outcome: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    cptdPoints: v.optional(v.number()),
    passMark: v.optional(v.number()),
    format: v.optional(v.string()),
  },
  returns: v.object({ moduleId: v.id("modules"), slug: v.string() }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const title = args.title.trim();
    if (title.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "A module needs a title." });
    }

    assertModuleNumbers(args);

    const slug = await reserveSlug(ctx, slugify(title));

    // Append to the end of the running order, and derive the display number
    // from it so the two cannot drift apart.
    const last = await ctx.db.query("modules").withIndex("by_sequence").order("desc").first();
    const sequence = (last?.sequence ?? 0) + 1;

    const moduleId = await ctx.db.insert("modules", {
      slug,
      number: `${sequence}`.padStart(2, "0"),
      sequence,
      title,
      description: args.description?.trim() ?? "",
      audience: args.audience?.trim() ?? "",
      outcome: args.outcome?.trim() ?? "",
      category: args.category,
      durationMinutes: args.durationMinutes ?? 0,
      cptdPoints: args.cptdPoints ?? 0,
      passMark: args.passMark ?? 80,
      // Still the default, but no longer the only possible value: it used to be
      // written here and accepted by nothing, so every module the console made
      // claimed to be self-paced whether it was or not.
      format: args.format?.trim() || "Self-paced",
      publishState: "draft",
      ...stamp(),
    });

    await recordAudit(ctx, {
      actor,
      action: "module.create",
      entityTable: "modules",
      entityId: moduleId,
      summary: title,
    });

    return { moduleId, slug };
  },
});

/** Edit module copy. Only the fields present in `args` are touched. */
export const update = mutation({
  args: {
    moduleId: v.id("modules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    audience: v.optional(v.string()),
    outcome: v.optional(v.string()),
    category: v.optional(moduleCategory),
    durationMinutes: v.optional(v.number()),
    cptdPoints: v.optional(v.number()),
    passMark: v.optional(v.number()),
    format: v.optional(v.string()),
    featuredAssetId: v.optional(v.id("assets")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await moduleOrThrow(ctx, args.moduleId);

    assertModuleNumbers(args);
    // Refused rather than silently defaulted: this is prose on a learner's
    // module page, and a blank one would render as a gap nobody could explain.
    if (args.format !== undefined && args.format.trim().length === 0) {
      throw new ConvexError({ code: "INVALID", message: "A delivery format needs some text." });
    }
    if (args.title !== undefined && args.title.trim().length === 0) {
      throw new ConvexError({ code: "INVALID", message: "A module needs a title." });
    }

    // A hero asset must belong to this module. The old read-side resolver fell
    // back to the first resource, so a cross-module reference looked deliberate.
    if (args.featuredAssetId !== undefined) {
      const asset = await ctx.db.get("assets", args.featuredAssetId);
      if (asset === null || asset.moduleId !== module._id) {
        throw new ConvexError({
          code: "INVALID",
          message: "That asset does not belong to this module.",
        });
      }
    }

    await ctx.db.patch("modules", module._id, {
      ...(args.title === undefined ? {} : { title: args.title.trim() }),
      ...(args.description === undefined ? {} : { description: args.description.trim() }),
      ...(args.audience === undefined ? {} : { audience: args.audience.trim() }),
      ...(args.outcome === undefined ? {} : { outcome: args.outcome.trim() }),
      ...(args.category === undefined ? {} : { category: args.category }),
      ...(args.durationMinutes === undefined ? {} : { durationMinutes: args.durationMinutes }),
      ...(args.cptdPoints === undefined ? {} : { cptdPoints: args.cptdPoints }),
      ...(args.passMark === undefined ? {} : { passMark: args.passMark }),
      ...(args.format === undefined ? {} : { format: args.format.trim() }),
      ...(args.featuredAssetId === undefined ? {} : { featuredAssetId: args.featuredAssetId }),
      ...stamp(),
    });

    await recordAudit(ctx, {
      actor,
      action: "module.update",
      entityTable: "modules",
      entityId: module._id,
    });
    return null;
  },
});

/**
 * Publish a module, but only if it is actually ready.
 *
 * This gate is the difference between a button that toasts and a button that
 * means something: the old create page offered "Save draft" and "Publish
 * module" with no field to write and no checks at all.
 */
export const publish = mutation({
  args: { moduleId: v.id("modules") },
  /** How many active staff the module was handed to on the way out. */
  returns: v.object({ assignedTo: v.number() }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await moduleOrThrow(ctx, args.moduleId);

    const missing: string[] = [];
    for (const field of ["title", "description", "audience", "outcome"] as const) {
      if (module[field].trim().length === 0) missing.push(field);
    }
    if (missing.length > 0) {
      throw new ConvexError({
        code: "NOT_READY",
        message: `Fill in ${missing.join(", ")} before publishing.`,
      });
    }
    if (module.passMark < 0 || module.passMark > 100) {
      throw new ConvexError({
        code: "NOT_READY",
        message: "Pass mark must be between 0 and 100.",
      });
    }

    const publishedLessons = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_publishState", (q) =>
        q.eq("moduleId", module._id).eq("publishState", "published"),
      )
      .take(1);
    if (publishedLessons.length === 0) {
      throw new ConvexError({
        code: "NOT_READY",
        message: "Publish at least one lesson before publishing the module.",
      });
    }

    // A published assessment lesson with an empty question bank is a lesson
    // nobody can finish, and since passing it is what completes it, a module
    // nobody can complete. `lessons.setPublishState` holds the same rule from
    // the other side.
    await assertAssessmentReady(ctx, module._id);

    await ctx.db.patch("modules", module._id, {
      publishState: "published",
      publishedAt: Date.now(),
      ...stamp(),
    });
    // Publishing is what makes a module somebody's work, so it hands it to
    // everybody on the way out. Without this the catalogue and the trackers
    // drift apart every time content is added, and the drift is invisible:
    // nothing on any screen says "nine people are missing this module".
    //
    // Scheduled rather than looped, for the same reason `staff.assignAllModules`
    // schedules — one module across 500 staff is bounded, but it shares that
    // mutation's step so there is one implementation of the walk.
    const staff = await assignableStaff(ctx);
    if (staff.length > 0) {
      await ctx.scheduler.runAfter(0, internal.staff.assignAllStep, {
        moduleIds: [module._id],
        staffIds: staff.map((user) => user._id),
        index: 0,
      });
    }

    await recordAudit(ctx, {
      actor,
      action: "module.publish",
      entityTable: "modules",
      entityId: module._id,
      summary: `assigned to ${staff.length} active staff`,
    });
    return { assignedTo: staff.length };
  },
});

/**
 * Move a module between editorial states.
 *
 * `archived` rather than deleted is the default for retiring content, because
 * enrollments reference modules and a hard delete would orphan a compliance
 * record.
 */
export const setPublishState = mutation({
  args: { moduleId: v.id("modules"), publishState },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await moduleOrThrow(ctx, args.moduleId);

    // Publishing has preconditions, so route it through the gate rather than
    // letting this become a way around them.
    if (args.publishState === "published" && module.publishState !== "published") {
      throw new ConvexError({
        code: "USE_PUBLISH",
        message: "Use modules.publish to publish a module; it checks readiness first.",
      });
    }

    await ctx.db.patch("modules", module._id, {
      publishState: args.publishState,
      ...stamp(),
    });
    await recordAudit(ctx, {
      actor,
      action: `module.${args.publishState}`,
      entityTable: "modules",
      entityId: module._id,
    });
    return null;
  },
});

/**
 * Hard-delete a module and its children.
 *
 * Refused once anyone is enrolled: that is what `archived` is for. Deletion is
 * only for content that never reached a learner.
 */
export const remove = mutation({
  args: { moduleId: v.id("modules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await moduleOrThrow(ctx, args.moduleId);

    const enrolled = await ctx.db
      .query("enrollments")
      .withIndex("by_moduleId_and_status", (q) => q.eq("moduleId", module._id))
      .take(1);
    if (enrolled.length > 0) {
      throw new ConvexError({
        code: "IN_USE",
        message: "Staff are enrolled in this module. Archive it instead of deleting it.",
      });
    }

    // Children before parent, and join rows before the rows they join.
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    for (const lesson of lessons) {
      const links = await ctx.db
        .query("lessonAssets")
        .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lesson._id))
        .take(MAX_SIBLINGS);
      for (const link of links) await ctx.db.delete("lessonAssets", link._id);
      await ctx.db.delete("lessons", lesson._id);
    }

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    // Blob before row: an asset row deleted on its own leaves an object in the
    // R2 bucket that nothing can ever reach or name again.
    for (const asset of assets) {
      await deleteBlobIfPresent(ctx, asset.r2Key);
      await ctx.db.delete("assets", asset._id);
    }

    const objectives = await ctx.db
      .query("moduleObjectives")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    for (const objective of objectives) await ctx.db.delete("moduleObjectives", objective._id);

    // Options before questions, for the same reason lesson joins go before
    // lessons: an option row left behind points at nothing and no index can
    // ever name it again.
    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    for (const question of questions) {
      const options = await ctx.db
        .query("assessmentQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
        .take(MAX_OPTIONS);
      for (const option of options) {
        await ctx.db.delete("assessmentQuestionOptions", option._id);
      }
      await ctx.db.delete("assessmentQuestions", question._id);
    }

    await ctx.db.delete("modules", module._id);
    await recordAudit(ctx, {
      actor,
      action: "module.remove",
      entityTable: "modules",
      entityId: module._id,
      summary: module.title,
    });
    return null;
  },
});
