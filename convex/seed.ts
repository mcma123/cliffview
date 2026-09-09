import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { COUNTER, MAX_MODULES, MAX_STAFF, setCounter } from "./lib/counts";
import { MAX_SIBLINGS } from "./lib/ordering";
import { monthKeysBack } from "./lib/time";
import { aiQuestions, modules, phases, trendCompletions, users } from "./seed/data";

/**
 * Seeds the production deployment.
 *
 * This is an `internalMutation`, not `npx convex import`, for three reasons:
 * the seed needs cleanup rather than transcription (splitting names, turning
 * `documentIds` arrays into join rows, deriving counters); slug-to-id
 * resolution is natural in a mutation and awkward across flat JSONL files; and
 * `--replace` on a parent table would orphan its children.
 *
 * It is idempotent. Every entity is matched on a natural key — phase name, user
 * email, module slug, (module, lesson slug), (module, asset title) — and
 * patched if present, inserted if not. Re-running in `insert-missing` mode
 * leaves counts unchanged.
 *
 * Guards, because this runs against production:
 *
 * - `internalMutation`, so it is not reachable from any client
 * - `confirm: "cliffview"` is required, so a stray `npx convex run` cannot fire
 *   it by accident
 * - `mode: "reset"` refuses to run on populated tables unless `iAmSure` is also
 *   passed
 */

const MODE = v.union(v.literal("insert-missing"), v.literal("reset"));

type SeedReport = {
  phases: number;
  users: number;
  modules: number;
  lessons: number;
  assets: number;
  lessonAssets: number;
  enrollments: number;
  aiQuestions: number;
  monthlyRollups: number;
  mode: string;
};

/** Wipe every table this seed owns, children before parents. */
async function resetAll(ctx: MutationCtx): Promise<void> {
  // Order matters: join and child rows first so nothing is briefly orphaned.
  for (const row of await ctx.db.query("lessonAssets").take(5000)) {
    await ctx.db.delete("lessonAssets", row._id);
  }
  for (const row of await ctx.db.query("aiQuestionOptions").take(5000)) {
    await ctx.db.delete("aiQuestionOptions", row._id);
  }
  for (const row of await ctx.db.query("aiReviewDecisions").take(5000)) {
    await ctx.db.delete("aiReviewDecisions", row._id);
  }
  for (const row of await ctx.db.query("aiQuestions").take(5000)) {
    await ctx.db.delete("aiQuestions", row._id);
  }
  for (const row of await ctx.db.query("enrollments").take(5000)) {
    await ctx.db.delete("enrollments", row._id);
  }
  for (const row of await ctx.db.query("lessonProgress").take(5000)) {
    await ctx.db.delete("lessonProgress", row._id);
  }
  for (const row of await ctx.db.query("lessons").take(5000)) {
    await ctx.db.delete("lessons", row._id);
  }
  for (const row of await ctx.db.query("assets").take(5000)) {
    await ctx.db.delete("assets", row._id);
  }
  for (const row of await ctx.db.query("moduleObjectives").take(5000)) {
    await ctx.db.delete("moduleObjectives", row._id);
  }
  for (const row of await ctx.db.query("modules").take(5000)) {
    await ctx.db.delete("modules", row._id);
  }
  for (const row of await ctx.db.query("users").take(5000)) {
    await ctx.db.delete("users", row._id);
  }
  for (const row of await ctx.db.query("phases").take(5000)) {
    await ctx.db.delete("phases", row._id);
  }
  for (const row of await ctx.db.query("monthlyRollups").take(5000)) {
    await ctx.db.delete("monthlyRollups", row._id);
  }
}

export const run = internalMutation({
  args: {
    confirm: v.literal("cliffview"),
    mode: MODE,
    /** Required to reset tables that already hold data. */
    iAmSure: v.optional(v.literal(true)),
  },
  returns: v.object({
    phases: v.number(),
    users: v.number(),
    modules: v.number(),
    lessons: v.number(),
    assets: v.number(),
    lessonAssets: v.number(),
    enrollments: v.number(),
    aiQuestions: v.number(),
    monthlyRollups: v.number(),
    mode: v.string(),
  }),
  handler: async (ctx, args): Promise<SeedReport> => {
    const now = Date.now();

    if (args.mode === "reset") {
      const existing = await ctx.db.query("modules").take(1);
      if (existing.length > 0 && args.iAmSure !== true) {
        throw new ConvexError({
          code: "REFUSED",
          message:
            "Tables already hold data. Re-run with iAmSure: true to wipe and reseed, or use mode: 'insert-missing'.",
        });
      }
      await resetAll(ctx);
    }

    const report: SeedReport = {
      phases: 0,
      users: 0,
      modules: 0,
      lessons: 0,
      assets: 0,
      lessonAssets: 0,
      enrollments: 0,
      aiQuestions: 0,
      monthlyRollups: 0,
      mode: args.mode,
    };

    // --- phases -------------------------------------------------------------
    const phaseIdByName = new Map<string, Id<"phases">>();
    for (const phase of phases) {
      const existing = await ctx.db
        .query("phases")
        .withIndex("by_order", (q) => q.eq("order", phase.order))
        .unique();
      if (existing === null) {
        phaseIdByName.set(
          phase.name,
          await ctx.db.insert("phases", { name: phase.name, order: phase.order, isActive: true }),
        );
        report.phases += 1;
      } else {
        await ctx.db.patch("phases", existing._id, { name: phase.name, isActive: true });
        phaseIdByName.set(phase.name, existing._id);
      }
    }

    // --- modules, assets, objectives, lessons, joins -------------------------
    const moduleIdBySlug = new Map<string, Id<"modules">>();

    for (const mod of modules) {
      const existingModule = await ctx.db
        .query("modules")
        .withIndex("by_slug", (q) => q.eq("slug", mod.slug))
        .unique();

      const moduleFields = {
        slug: mod.slug,
        number: mod.number,
        sequence: mod.sequence,
        title: mod.title,
        description: mod.description,
        audience: mod.audience,
        outcome: mod.outcome,
        category: mod.category,
        durationMinutes: mod.durationMinutes,
        cptdPoints: mod.cptdPoints,
        passMark: mod.passMark,
        format: mod.format,
        publishState: mod.publishState,
        contentUpdatedAt: now - mod.updatedAgoMs,
        ...(mod.publishState === "published" ? { publishedAt: now - mod.updatedAgoMs } : {}),
      };

      let moduleId: Id<"modules">;
      if (existingModule === null) {
        moduleId = await ctx.db.insert("modules", moduleFields);
        report.modules += 1;
      } else {
        moduleId = existingModule._id;
        await ctx.db.patch("modules", moduleId, moduleFields);
      }
      moduleIdBySlug.set(mod.slug, moduleId);

      // assets, keyed on (moduleId, title)
      const existingAssets = await ctx.db
        .query("assets")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
        .take(MAX_SIBLINGS);
      const assetIdByTitle = new Map<string, Id<"assets">>();

      for (let i = 0; i < mod.assets.length; i++) {
        const asset = mod.assets[i];
        const fields = {
          moduleId,
          title: asset.title,
          description: asset.description,
          kind: asset.kind,
          publishState: asset.publishState,
          order: i + 1,
          metaNote: asset.metaNote,
          contentUpdatedAt: now - mod.updatedAgoMs,
        };
        const match = existingAssets.find((row) => row.title === asset.title);
        if (match === undefined) {
          assetIdByTitle.set(asset.title, await ctx.db.insert("assets", fields));
          report.assets += 1;
        } else {
          await ctx.db.patch("assets", match._id, fields);
          assetIdByTitle.set(asset.title, match._id);
        }
      }

      // Featured asset, now validated to belong to this module rather than
      // silently falling back to the first resource.
      const featuredAssetId = assetIdByTitle.get(mod.featuredAssetTitle);
      if (featuredAssetId === undefined) {
        throw new ConvexError({
          code: "BAD_SEED",
          message: `Module "${mod.slug}" names a featured asset that is not in its own asset list: "${mod.featuredAssetTitle}".`,
        });
      }
      await ctx.db.patch("modules", moduleId, { featuredAssetId });

      // objectives, keyed on (moduleId, order)
      const existingObjectives = await ctx.db
        .query("moduleObjectives")
        .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
        .take(MAX_SIBLINGS);
      for (let i = 0; i < mod.objectives.length; i++) {
        const match = existingObjectives.find((row) => row.order === i + 1);
        if (match === undefined) {
          await ctx.db.insert("moduleObjectives", {
            moduleId,
            text: mod.objectives[i],
            order: i + 1,
          });
        } else {
          await ctx.db.patch("moduleObjectives", match._id, { text: mod.objectives[i] });
        }
      }

      // lessons, keyed on (moduleId, slug)
      for (let i = 0; i < mod.lessons.length; i++) {
        const lesson = mod.lessons[i];
        const heroAssetId = assetIdByTitle.get(mod.featuredAssetTitle);
        const fields = {
          moduleId,
          slug: lesson.slug,
          title: lesson.title,
          summary: lesson.summary,
          kind: lesson.kind,
          order: i + 1,
          // A lesson inherits its module's editorial state at seed time. It was
          // previously derived from one demo learner's progress flags.
          publishState: mod.publishState,
          contentUpdatedAt: now - mod.updatedAgoMs,
          ...(lesson.durationMinutes === undefined
            ? {}
            : { durationMinutes: lesson.durationMinutes }),
          ...(heroAssetId === undefined ? {} : { heroAssetId }),
          ...(lesson.heroTitleOverride === undefined
            ? {}
            : { heroTitleOverride: lesson.heroTitleOverride }),
          ...(lesson.heroDescriptionOverride === undefined
            ? {}
            : { heroDescriptionOverride: lesson.heroDescriptionOverride }),
          ...(lesson.scenarioTitle === undefined ? {} : { scenarioTitle: lesson.scenarioTitle }),
          ...(lesson.scenarioBody === undefined ? {} : { scenarioBody: lesson.scenarioBody }),
          ...(lesson.reflectionPrompt === undefined
            ? {}
            : { reflectionPrompt: lesson.reflectionPrompt }),
        };

        const existingLesson = await ctx.db
          .query("lessons")
          .withIndex("by_moduleId_and_slug", (q) =>
            q.eq("moduleId", moduleId).eq("slug", lesson.slug),
          )
          .unique();

        let lessonId: Id<"lessons">;
        if (existingLesson === null) {
          lessonId = await ctx.db.insert("lessons", fields);
          report.lessons += 1;
        } else {
          lessonId = existingLesson._id;
          await ctx.db.patch("lessons", lessonId, fields);
        }

        // lessonAssets join rows, replacing the old inline documentIds array
        const existingLinks = await ctx.db
          .query("lessonAssets")
          .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lessonId))
          .take(MAX_SIBLINGS);
        for (let a = 0; a < lesson.attachAssetTitles.length; a++) {
          const title = lesson.attachAssetTitles[a];
          const assetId = assetIdByTitle.get(title);
          if (assetId === undefined) {
            throw new ConvexError({
              code: "BAD_SEED",
              message: `Lesson "${mod.slug}/${lesson.slug}" attaches an unknown asset: "${title}".`,
            });
          }
          const match = existingLinks.find((row) => row.assetId === assetId);
          if (match === undefined) {
            await ctx.db.insert("lessonAssets", { lessonId, assetId, order: a + 1 });
            report.lessonAssets += 1;
          } else {
            await ctx.db.patch("lessonAssets", match._id, { order: a + 1 });
          }
        }
      }
    }

    // --- users and enrollments ----------------------------------------------
    let completedEnrollments = 0;

    for (const user of users) {
      const phaseId = phaseIdByName.get(user.phaseName);
      if (phaseId === undefined) {
        throw new ConvexError({
          code: "BAD_SEED",
          message: `User ${user.email} names an unknown phase: "${user.phaseName}".`,
        });
      }

      // compliancePercent is DERIVED from the enrollment rows, not asserted.
      // The old seed stored counters that contradicted their own rows.
      const totalProgress = user.enrollments.reduce((sum, e) => sum + e.progressPercent, 0);
      const compliancePercent =
        user.enrollments.length === 0 ? 0 : Math.round(totalProgress / user.enrollments.length);

      const userFields = {
        honorific: user.honorific,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        jobTitle: user.jobTitle,
        accessRole: user.accessRole,
        phaseId,
        employmentStatus: "active" as const,
        cptdPoints: user.cptdPoints,
        xpTotal: user.xpTotal,
        compliancePercent,
        lastActiveAt: now - user.lastActiveAgoMs,
      };

      const existingUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", user.email))
        .unique();

      let userId: Id<"users">;
      if (existingUser === null) {
        userId = await ctx.db.insert("users", userFields);
        report.users += 1;
      } else {
        userId = existingUser._id;
        await ctx.db.patch("users", userId, userFields);
      }

      for (const enrollment of user.enrollments) {
        const moduleId = moduleIdBySlug.get(enrollment.moduleSlug);
        if (moduleId === undefined) {
          throw new ConvexError({
            code: "BAD_SEED",
            message: `Enrollment for ${user.email} names an unknown module: "${enrollment.moduleSlug}".`,
          });
        }
        if (enrollment.status === "completed") completedEnrollments += 1;

        const lastAccessedAt =
          enrollment.lastAccessedAgoMs === undefined
            ? undefined
            : now - enrollment.lastAccessedAgoMs;

        const fields = {
          userId,
          moduleId,
          status: enrollment.status,
          progressPercent: enrollment.progressPercent,
          assignedAt: now - 120 * 24 * 60 * 60 * 1000,
          ...(lastAccessedAt === undefined ? {} : { lastAccessedAt }),
          ...(enrollment.status === "not_started" || lastAccessedAt === undefined
            ? {}
            : { startedAt: lastAccessedAt }),
          ...(enrollment.status === "completed" && lastAccessedAt !== undefined
            ? { completedAt: lastAccessedAt }
            : {}),
          ...(enrollment.score === undefined ? {} : { score: enrollment.score }),
        };

        const existing = await ctx.db
          .query("enrollments")
          .withIndex("by_userId_and_moduleId", (q) =>
            q.eq("userId", userId).eq("moduleId", moduleId),
          )
          .unique();
        if (existing === null) {
          await ctx.db.insert("enrollments", fields);
          report.enrollments += 1;
        } else {
          await ctx.db.patch("enrollments", existing._id, fields);
        }
      }
    }

    // --- AI review queue -----------------------------------------------------
    for (const question of aiQuestions) {
      const moduleId = moduleIdBySlug.get(question.moduleSlug);
      if (moduleId === undefined) {
        throw new ConvexError({
          code: "BAD_SEED",
          message: `AI question names an unknown module: "${question.moduleSlug}".`,
        });
      }

      const existing = await ctx.db
        .query("aiQuestions")
        .withIndex("by_moduleId_and_status", (q) =>
          q.eq("moduleId", moduleId).eq("status", "pending"),
        )
        .take(MAX_SIBLINGS);
      const match = existing.find((row) => row.prompt === question.prompt);

      let questionId: Id<"aiQuestions">;
      if (match === undefined) {
        questionId = await ctx.db.insert("aiQuestions", {
          moduleId,
          prompt: question.prompt,
          difficulty: question.difficulty,
          confidencePercent: question.confidencePercent,
          status: "pending",
        });
        report.aiQuestions += 1;
      } else {
        questionId = match._id;
      }

      const existingOptions = await ctx.db
        .query("aiQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", questionId))
        .take(MAX_SIBLINGS);
      for (let i = 0; i < question.options.length; i++) {
        const option = question.options[i];
        const fields = {
          questionId,
          key: option.key,
          text: option.text,
          isCorrect: option.isCorrect,
          order: i + 1,
        };
        const optionMatch = existingOptions.find((row) => row.key === option.key);
        if (optionMatch === undefined) {
          await ctx.db.insert("aiQuestionOptions", fields);
        } else {
          await ctx.db.patch("aiQuestionOptions", optionMatch._id, fields);
        }
      }
    }

    // --- analytics -----------------------------------------------------------
    // Anchored to the month the seed runs so the six-month window is always
    // populated. The final month carries the true completion count, so the
    // overview tile and the last trend bar agree.
    const monthKeys = monthKeysBack(now, trendCompletions.length);
    for (let i = 0; i < monthKeys.length; i++) {
      const monthKey = monthKeys[i];
      const isCurrent = i === monthKeys.length - 1;
      const fields = {
        monthKey,
        completedModules: isCurrent ? completedEnrollments : trendCompletions[i],
        snapshotAt: now,
        totalStaff: users.length,
        // Only past months carry a compliance snapshot: the dashboard shows a
        // month-over-month delta only when a past value exists, and inventing
        // one for the current month would recreate the fake "+5%".
        ...(isCurrent ? {} : { averageCompliancePercent: 60 + i * 3 }),
      };
      const existing = await ctx.db
        .query("monthlyRollups")
        .withIndex("by_monthKey", (q) => q.eq("monthKey", monthKey))
        .unique();
      if (existing === null) {
        await ctx.db.insert("monthlyRollups", fields);
        report.monthlyRollups += 1;
      } else {
        await ctx.db.patch("monthlyRollups", existing._id, fields);
      }
    }

    const pendingQuestions = await ctx.db
      .query("aiQuestions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(MAX_MODULES);

    await setCounter(ctx, COUNTER.completedModules, completedEnrollments);
    await setCounter(ctx, COUNTER.aiQuestionsPending, pendingQuestions.length);
    await setCounter(ctx, COUNTER.aiQuestionsApproved, 0);
    await setCounter(ctx, COUNTER.aiQuestionsRejected, 0);
    await setCounter(ctx, COUNTER.aiQuestionsEdited, 0);

    // Sanity check: a bounded read that proves the staff scan the dashboard
    // relies on returns what we just wrote.
    const activeStaff = await ctx.db
      .query("users")
      .withIndex("by_employmentStatus_and_xpTotal", (q) => q.eq("employmentStatus", "active"))
      .take(MAX_STAFF);
    if (activeStaff.length < users.length) {
      throw new ConvexError({
        code: "BAD_SEED",
        message: `Expected at least ${users.length} active staff after seeding, found ${activeStaff.length}.`,
      });
    }

    return report;
  },
});
