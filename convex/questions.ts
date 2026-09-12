import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordAudit, stamp } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import {
  MAX_OPTIONS,
  MAX_SIBLINGS,
  assertSameMembers,
  nextQuestionOrder,
  renumberQuestions,
} from "./lib/ordering";
import schema from "./schema";
import { assessmentQuestionKind } from "./validators";

/**
 * The admin surface for a module's assessment questions.
 *
 * Shaped like `convex/objectives.ts` — `requireAdmin` first, load-or-throw,
 * validate, write, stamp the parent, record who acted — with one deliberate
 * divergence, explained on `save` below: a question and all of its options are
 * written in a single mutation rather than edited row by row.
 *
 * Not to be confused with `aiQuestions`, which is the AI review staging queue.
 * These are authored questions an admin stands behind. The two are kept apart
 * because they have different lifecycles, but the shapes line up on purpose:
 * an `aiQuestions` row plus its `aiQuestionOptions` maps one-to-one onto
 * `save`'s arguments, so importing an approved question when the review
 * pipeline lands is a small function, not a migration.
 */

/** True/false questions are stored as these two options, in this order. */
const TRUE_FALSE_TEXT = ["True", "False"] as const;

type OptionInput = { text: string; isCorrect: boolean };

async function questionOrThrow(
  ctx: QueryCtx | MutationCtx,
  questionId: Id<"assessmentQuestions">,
): Promise<Doc<"assessmentQuestions">> {
  const question = await ctx.db.get("assessmentQuestions", questionId);
  if (question === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That question no longer exists." });
  }
  return question;
}

/** A question's options, in order. */
async function optionsFor(
  ctx: QueryCtx | MutationCtx,
  questionId: Id<"assessmentQuestions">,
): Promise<Array<Doc<"assessmentQuestionOptions">>> {
  return await ctx.db
    .query("assessmentQuestionOptions")
    .withIndex("by_questionId_and_order", (q) => q.eq("questionId", questionId))
    .take(MAX_OPTIONS);
}

/**
 * Everything that has to be true before a question is worth storing.
 *
 * All of it is checked before a single row is written, so a refused save leaves
 * the previous version of the question exactly as it was. The returned list is
 * the normalised one to write — trimmed, and for true/false rewritten to the
 * canonical two options.
 */
function normaliseOrThrow(
  kind: Doc<"assessmentQuestions">["kind"],
  prompt: string,
  options: ReadonlyArray<OptionInput>,
): { prompt: string; options: Array<OptionInput> } {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length === 0) {
    throw new ConvexError({ code: "INVALID", message: "A question needs a prompt." });
  }

  const trimmed = options.map((option) => ({
    text: option.text.trim(),
    isCorrect: option.isCorrect,
  }));

  if (trimmed.some((option) => option.text.length === 0)) {
    throw new ConvexError({ code: "INVALID", message: "Every answer needs some text." });
  }

  // The invariant the whole atomic-save design exists to protect. Zero correct
  // options is a question nobody can pass; two is a question the grader cannot
  // grade.
  if (trimmed.filter((option) => option.isCorrect).length !== 1) {
    throw new ConvexError({
      code: "INVALID",
      message: "Mark exactly one answer as the correct one.",
    });
  }

  if (kind === "true_false") {
    if (trimmed.length !== 2) {
      throw new ConvexError({
        code: "INVALID",
        message: "A true or false question has exactly two answers.",
      });
    }
    // Normalised server-side rather than validated, so a typo in the submitted
    // text cannot produce a question that reads "Ture". Only which one is
    // correct survives from the caller.
    return {
      prompt: trimmedPrompt,
      options: TRUE_FALSE_TEXT.map((text, index) => ({
        text,
        isCorrect: trimmed[index].isCorrect,
      })),
    };
  }

  if (trimmed.length < 2) {
    throw new ConvexError({
      code: "INVALID",
      message: "A multiple-choice question needs at least two answers.",
    });
  }
  if (trimmed.length > MAX_OPTIONS) {
    throw new ConvexError({
      code: "INVALID",
      message: `A question can have at most ${MAX_OPTIONS} answers.`,
    });
  }

  // One right answer and an identical wrong one is ungradable by a human, and
  // the learner has no way to tell which they picked.
  const seen = new Set(trimmed.map((option) => option.text.toLowerCase()));
  if (seen.size !== trimmed.length) {
    throw new ConvexError({ code: "INVALID", message: "Two answers read the same." });
  }

  return { prompt: trimmedPrompt, options: trimmed };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The whole assessment for one module, for the admin builder.
 *
 * Its own query rather than a sixth collection on `modules.adminDetail`,
 * because a Convex query is a live subscription: folding them together would
 * repaint the module editor on every question save, and repaint the builder on
 * every lesson reorder. `isCorrect` is returned here, and only here — this
 * query is `requireAdmin`.
 */
export const adminList = query({
  args: { moduleSlug: v.string() },
  returns: v.object({
    module: schema.doc("modules"),
    /**
     * The lessons a learner would actually sit this at. Empty means the
     * questions exist but nothing links to them, which the builder says out
     * loud rather than leaving the admin to wonder.
     */
    assessmentLessons: v.array(schema.doc("lessons")),
    questions: v.array(
      v.object({
        question: schema.doc("assessmentQuestions"),
        options: v.array(schema.doc("assessmentQuestionOptions")),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const module = await ctx.db
      .query("modules")
      .withIndex("by_slug", (q) => q.eq("slug", args.moduleSlug))
      .unique();
    if (module === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That module does not exist." });
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const rows = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const questions = [];
    for (const question of rows) {
      questions.push({ question, options: await optionsFor(ctx, question._id) });
    }

    return {
      module,
      assessmentLessons: lessons.filter((lesson) => lesson.kind === "assessment"),
      questions,
    };
  },
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create or replace one question, together with all of its options.
 *
 * The one place this diverges from `objectives.ts`, and the reason is the
 * invariant: exactly one option is correct. An objective has no cross-row
 * invariant, so per-row edits are safe there. Here, per-option mutations would
 * leave reachable instants where zero or two options were marked correct — and
 * the learner query reads live data on a published module, so "reachable" means
 * a real teacher, mid-edit. One transaction makes the invariant provable.
 *
 * The cost, accepted: a stale client overwrites the whole question rather than
 * merging. The question is the unit a human edits, and a school has a handful
 * of admins.
 */
export const save = mutation({
  args: {
    moduleId: v.id("modules"),
    /** Absent creates; present replaces that question in place. */
    questionId: v.optional(v.id("assessmentQuestions")),
    kind: assessmentQuestionKind,
    prompt: v.string(),
    options: v.array(v.object({ text: v.string(), isCorrect: v.boolean() })),
  },
  returns: v.id("assessmentQuestions"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const module = await ctx.db.get("modules", args.moduleId);
    if (module === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That module no longer exists." });
    }

    // Loaded before validation so a cross-parent write is refused even when the
    // payload is also malformed.
    const existing =
      args.questionId === undefined ? null : await questionOrThrow(ctx, args.questionId);
    if (existing !== null && existing.moduleId !== module._id) {
      throw new ConvexError({
        code: "INVALID",
        message: "That question belongs to a different module.",
      });
    }

    const normalised = normaliseOrThrow(args.kind, args.prompt, args.options);

    let questionId: Id<"assessmentQuestions">;
    if (existing === null) {
      questionId = await ctx.db.insert("assessmentQuestions", {
        moduleId: module._id,
        kind: args.kind,
        prompt: normalised.prompt,
        order: await nextQuestionOrder(ctx, module._id),
        ...stamp(),
      });
    } else {
      questionId = existing._id;
      // `order` is untouched: editing a question does not move it.
      await ctx.db.patch("assessmentQuestions", questionId, {
        kind: args.kind,
        prompt: normalised.prompt,
        ...stamp(),
      });
      for (const option of await optionsFor(ctx, questionId)) {
        await ctx.db.delete("assessmentQuestionOptions", option._id);
      }
    }

    for (let i = 0; i < normalised.options.length; i++) {
      await ctx.db.insert("assessmentQuestionOptions", {
        questionId,
        text: normalised.options[i].text,
        isCorrect: normalised.options[i].isCorrect,
        order: i + 1,
      });
    }

    await ctx.db.patch("modules", module._id, stamp());
    await recordAudit(ctx, {
      actor,
      action: existing === null ? "question.add" : "question.update",
      entityTable: "assessmentQuestions",
      entityId: questionId,
      summary: normalised.prompt.slice(0, 80),
    });
    return questionId;
  },
});

export const remove = mutation({
  args: { questionId: v.id("assessmentQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const question = await questionOrThrow(ctx, args.questionId);

    // Options first: an orphaned option row points at nothing and no index can
    // ever find it again.
    for (const option of await optionsFor(ctx, question._id)) {
      await ctx.db.delete("assessmentQuestionOptions", option._id);
    }
    await ctx.db.delete("assessmentQuestions", question._id);
    // Close the gap so order stays a dense 1..N.
    await renumberQuestions(ctx, question.moduleId);

    await ctx.db.patch("modules", question.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "question.remove",
      entityTable: "assessmentQuestions",
      entityId: question._id,
      summary: question.prompt.slice(0, 80),
    });
    return null;
  },
});

/**
 * Reorder the whole list at once.
 *
 * Validating the id set against the authoritative siblings is the important
 * half: a stale client reordering while someone else adds a question would
 * otherwise drop the new row out of the ordering entirely.
 */
export const reorder = mutation({
  args: {
    moduleId: v.id("modules"),
    orderedIds: v.array(v.id("assessmentQuestions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const siblings = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", args.moduleId))
      .take(MAX_SIBLINGS);

    assertSameMembers(
      args.orderedIds,
      siblings.map((row) => row._id),
    );

    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch("assessmentQuestions", args.orderedIds[i], { order: i + 1 });
    }
    await ctx.db.patch("modules", args.moduleId, stamp());
    await recordAudit(ctx, {
      actor,
      action: "question.reorder",
      entityTable: "modules",
      entityId: args.moduleId,
    });
    return null;
  },
});
