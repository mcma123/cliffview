import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import {
  MAX_SIBLINGS,
  assertSameMembers,
  nextObjectiveOrder,
  renumberObjectives,
} from "./lib/ordering";

/**
 * Learning objectives.
 *
 * Rows rather than a string array on the module, so they can be edited and
 * reordered individually without a read-modify-write of the parent, and so the
 * UI can key on an id instead of the text — duplicate objective text used to be
 * a React key collision.
 */

export const add = mutation({
  args: { moduleId: v.id("modules"), text: v.string() },
  returns: v.id("moduleObjectives"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const module = await ctx.db.get("modules", args.moduleId);
    if (module === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
    }
    const text = args.text.trim();
    if (text.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "An objective needs some text." });
    }

    const objectiveId = await ctx.db.insert("moduleObjectives", {
      moduleId: module._id,
      text,
      order: await nextObjectiveOrder(ctx, module._id),
    });
    await ctx.db.patch("modules", module._id, stamp());
    await recordAudit(ctx, {
      actor,
      action: "objective.add",
      entityTable: "moduleObjectives",
      entityId: objectiveId,
    });
    return objectiveId;
  },
});

export const update = mutation({
  args: { objectiveId: v.id("moduleObjectives"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const objective = await ctx.db.get("moduleObjectives", args.objectiveId);
    if (objective === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That objective no longer exists." });
    }
    const text = args.text.trim();
    if (text.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "An objective needs some text." });
    }

    await ctx.db.patch("moduleObjectives", objective._id, { text });
    await ctx.db.patch("modules", objective.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "objective.update",
      entityTable: "moduleObjectives",
      entityId: objective._id,
    });
    return null;
  },
});

export const remove = mutation({
  args: { objectiveId: v.id("moduleObjectives") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const objective = await ctx.db.get("moduleObjectives", args.objectiveId);
    if (objective === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That objective no longer exists." });
    }

    await ctx.db.delete("moduleObjectives", objective._id);
    // Close the gap so order stays a dense 1..N.
    await renumberObjectives(ctx, objective.moduleId);
    await ctx.db.patch("modules", objective.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "objective.remove",
      entityTable: "moduleObjectives",
      entityId: objective._id,
    });
    return null;
  },
});

/**
 * Reorder the whole list at once.
 *
 * Validating the id set against the authoritative siblings is the important
 * half: a stale client reordering while someone else adds an objective would
 * otherwise drop the new row out of the ordering entirely.
 */
export const reorder = mutation({
  args: { moduleId: v.id("modules"), orderedIds: v.array(v.id("moduleObjectives")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const siblings = await ctx.db
      .query("moduleObjectives")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", args.moduleId))
      .take(MAX_SIBLINGS);

    assertSameMembers(
      args.orderedIds,
      siblings.map((row) => row._id),
    );

    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch("moduleObjectives", args.orderedIds[i], { order: i + 1 });
    }
    await ctx.db.patch("modules", args.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "objective.reorder",
      entityTable: "modules",
      entityId: args.moduleId,
    });
    return null;
  },
});
