import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { BADGES, currentStreak } from "./lib/awards";
import { requireStaff } from "./lib/authz";
import { MAX_ACTIVITY, MAX_ATTEMPTS, MAX_MODULES, MAX_PHASES, MAX_STAFF } from "./lib/counts";
import { MAX_OPTIONS, MAX_SIBLINGS } from "./lib/ordering";
import { applyLessonCompletion, publishedLessons } from "./lib/progress";
import { DOWNLOAD_URL_TTL_SECONDS, r2 } from "./lib/storage";
import schema from "./schema";
import { assessmentQuestionKind } from "./validators";

/**
 * The learner surface: what a signed-in teacher can see of their own training.
 *
 * Everything here is `requireStaff`, and every read is scoped to the caller's
 * own enrollments. That is the whole difference from `modules.ts`, which is
 * `requireAdmin` because it exposes drafts, archived content and the full
 * asset list. A teacher sees published content they have been assigned, and
 * their own progress — nobody else's.
 *
 * **Identity is never an argument.** `requireStaff` reads it from the verified
 * token, so a caller cannot ask for another person's training record by
 * passing their id, which is the obvious attack on a screen like this.
 *
 * **An enrollment is the entitlement.** `staff.assignModules` writes the row;
 * without one, a module is not merely hidden here, it is refused. Being
 * published is not enough on its own — that would turn the whole library into
 * a free-for-all and make the compliance numbers meaningless.
 */

/** The caller's enrollment for one module, or null. */
async function enrollmentFor(
  ctx: QueryCtx,
  userId: Id<"users">,
  moduleId: Id<"modules">,
): Promise<Doc<"enrollments"> | null> {
  return await ctx.db
    .query("enrollments")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId).eq("moduleId", moduleId))
    .unique();
}

/**
 * Resolve the module a learner asked for, refusing anything not theirs.
 *
 * One helper so the three refusals cannot drift apart between screens: unknown
 * slug, unpublished module, and not assigned to you.
 */
async function assignedModuleOrThrow(
  ctx: QueryCtx,
  userId: Id<"users">,
  slug: string,
): Promise<{ module: Doc<"modules">; enrollment: Doc<"enrollments"> }> {
  const module = await ctx.db
    .query("modules")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (module === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That module does not exist." });
  }
  if (module.publishState !== "published") {
    // Deliberately the same message as "not assigned": whether a draft module
    // exists is editorial information a learner has no business inferring.
    throw new ConvexError({
      code: "NOT_ASSIGNED",
      message: "This module is not assigned to you.",
    });
  }
  const enrollment = await enrollmentFor(ctx, userId, module._id);
  if (enrollment === null) {
    throw new ConvexError({
      code: "NOT_ASSIGNED",
      message: "This module is not assigned to you.",
    });
  }
  return { module, enrollment };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Everything the learner dashboard and module library need.
 *
 * One query for both screens because both want the same join — the caller's
 * enrollments against their modules — and splitting it would mean two round
 * trips that can disagree with each other about the same numbers.
 */
export const myModules = query({
  args: {},
  returns: v.object({
    user: v.object({
      firstName: v.string(),
      preferredName: v.union(v.string(), v.null()),
      jobTitle: v.string(),
      cptdPoints: v.number(),
      xpTotal: v.number(),
      compliancePercent: v.number(),
    }),
    modules: v.array(
      v.object({
        enrollment: schema.doc("enrollments"),
        module: schema.doc("modules"),
        lessonCount: v.number(),
        completedLessons: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { user, userId } = await requireStaff(ctx);

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
      .take(MAX_MODULES);

    const rows = [];
    for (const enrollment of enrollments) {
      const module = await ctx.db.get("modules", enrollment.moduleId);
      // An assignment to content that was archived or deleted is skipped
      // rather than rendered as a broken card.
      if (module === null || module.publishState !== "published") continue;

      const lessons = await publishedLessons(ctx, module._id);
      const progress = await ctx.db
        .query("lessonProgress")
        .withIndex("by_userId_and_moduleId", (q) =>
          q.eq("userId", userId).eq("moduleId", module._id),
        )
        .take(MAX_SIBLINGS);
      const completed = progress.filter((row) => row.status === "completed").length;

      rows.push({
        enrollment,
        module,
        lessonCount: lessons.length,
        completedLessons: completed,
      });
    }
    rows.sort((a, b) => a.module.sequence - b.module.sequence);

    return {
      user: {
        firstName: user.firstName,
        preferredName: user.preferredName ?? null,
        jobTitle: user.jobTitle,
        cptdPoints: user.cptdPoints,
        xpTotal: user.xpTotal,
        compliancePercent: user.compliancePercent,
      },
      modules: rows,
    };
  },
});

/**
 * One assigned module: its objectives, its published lessons, and my progress.
 *
 * Also its featured media, which is where an uploaded module video actually
 * lives: `modules.featuredAssetId` is a separate pointer from the per-lesson
 * attachment list, so a hero video is reachable from here and from nowhere
 * else. Missing that is the difference between a teacher seeing their video
 * and seeing an empty page.
 */
export const moduleDetail = query({
  args: { slug: v.string() },
  returns: v.object({
    module: schema.doc("modules"),
    enrollment: schema.doc("enrollments"),
    /** The module hero. Null when unset or when no file is attached to it. */
    featured: v.union(
      v.object({ asset: schema.doc("assets"), url: v.union(v.string(), v.null()) }),
      v.null(),
    ),
    objectives: v.array(schema.doc("moduleObjectives")),
    lessons: v.array(
      v.object({
        lesson: schema.doc("lessons"),
        status: v.string(),
        assetCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const { module, enrollment } = await assignedModuleOrThrow(ctx, userId, args.slug);

    const objectives = await ctx.db
      .query("moduleObjectives")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId).eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    const byLesson = new Map(progress.map((row) => [row.lessonId, row.status]));

    const lessons = [];
    for (const lesson of await publishedLessons(ctx, module._id)) {
      const links = await ctx.db
        .query("lessonAssets")
        .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", lesson._id))
        .take(MAX_SIBLINGS);
      lessons.push({
        lesson,
        status: byLesson.get(lesson._id) ?? "not_started",
        assetCount: links.length,
      });
    }

    // Resolved per read and never stored: an expiring credential, not an
    // address. See the note on `lesson` for why a learner may be handed one.
    let featured = null;
    if (module.featuredAssetId !== undefined) {
      const asset = await ctx.db.get("assets", module.featuredAssetId);
      if (asset !== null && asset.publishState === "published") {
        featured = {
          asset,
          url:
            asset.r2Key === undefined
              ? null
              : await r2.getUrl(asset.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS }),
        };
      }
    }

    return { module, enrollment, featured, objectives, lessons };
  },
});

/**
 * One lesson, with playable media.
 *
 * This is the only learner read that mints signed R2 URLs, and it is worth
 * being explicit about why that is allowed. `convex/AGENTS.md` used to say a
 * signed URL may leave a query only if that query is `requireAdmin`-gated —
 * written when nothing was gated at all and admins were the only readers. A
 * teacher plainly has to be able to watch the video they were assigned, so the
 * rule is now: a signed URL may leave a query that is gated **and scoped to
 * something the caller is entitled to**. Here that is `requireStaff` plus
 * `assignedModuleOrThrow`, so a URL is only ever minted for media inside a
 * module this person has been assigned.
 *
 * The URL is still never written to a row. It is an expiring credential, not
 * an address, and it is resolved per read.
 */
export const lesson = query({
  args: { moduleSlug: v.string(), lessonSlug: v.string() },
  returns: v.object({
    module: schema.doc("modules"),
    lesson: schema.doc("lessons"),
    status: v.string(),
    assets: v.array(
      v.object({
        asset: schema.doc("assets"),
        /** Null when the asset row has no file attached yet. */
        url: v.union(v.string(), v.null()),
      }),
    ),
    /**
     * The lesson's hero asset, or null.
     *
     * The document, not a bare URL. A URL alone cannot say what it points at,
     * so the page rendered every hero as a `<video>` — including a hero that
     * held a PDF. Its id also lets the page skip the hero block when the same
     * asset is in `assets` below, which used to render it twice.
     */
    hero: v.union(v.object({ asset: schema.doc("assets"), url: v.string() }), v.null()),
    previousSlug: v.union(v.string(), v.null()),
    nextSlug: v.union(v.string(), v.null()),
    position: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const { module } = await assignedModuleOrThrow(ctx, userId, args.moduleSlug);

    const lessons = await publishedLessons(ctx, module._id);
    const index = lessons.findIndex((row) => row.slug === args.lessonSlug);
    if (index === -1) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That lesson is not part of this module.",
      });
    }
    const current = lessons[index];

    const links = await ctx.db
      .query("lessonAssets")
      .withIndex("by_lessonId_and_order", (q) => q.eq("lessonId", current._id))
      .take(MAX_SIBLINGS);

    const assets = [];
    for (const link of links) {
      const asset = await ctx.db.get("assets", link.assetId);
      if (asset === null || asset.publishState !== "published") continue;
      assets.push({
        asset,
        url:
          asset.r2Key === undefined
            ? null
            : await r2.getUrl(asset.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS }),
      });
    }

    // Hero media is a separate pointer from the attachment list, and a lesson
    // can have one without it also being attached.
    let hero: { asset: Doc<"assets">; url: string } | null = null;
    if (current.heroAssetId !== undefined) {
      const heroAsset = await ctx.db.get("assets", current.heroAssetId);
      // Published, like every other attachment. The old version checked only
      // that a file existed, so a hero pulled back to draft stayed on screen
      // while the same asset listed below it disappeared.
      if (
        heroAsset !== null &&
        heroAsset.publishState === "published" &&
        heroAsset.r2Key !== undefined
      ) {
        hero = {
          asset: heroAsset,
          url: await r2.getUrl(heroAsset.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS }),
        };
      }
    }

    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_lessonId", (q) =>
        q.eq("userId", userId).eq("lessonId", current._id),
      )
      .unique();

    return {
      module,
      lesson: current,
      status: progress?.status ?? "not_started",
      assets,
      hero,
      previousSlug: index > 0 ? lessons[index - 1].slug : null,
      nextSlug: index < lessons.length - 1 ? lessons[index + 1].slug : null,
      position: index + 1,
      total: lessons.length,
    };
  },
});

/**
 * The assessment a learner is about to sit.
 *
 * **The answer key never leaves the server.** The option shape below is spelled
 * out field by field rather than reached for with
 * `schema.doc("assessmentQuestionOptions")`, which would happily pass
 * `isCorrect` through the validator and put the correct answer in the page
 * payload of every learner who opens the quiz. This is the same reason
 * `learn.leaderboard` is hand-shaped, and a test asserts the returned key set
 * so widening it breaks the build rather than quietly leaking.
 *
 * Questions come back in their stored order and are never shuffled: a query
 * must be deterministic, shuffling would need the wall clock that queries must
 * not read, and a live subscription would otherwise reorder the paper under
 * somebody mid-answer.
 */
export const assessment = query({
  args: { moduleSlug: v.string(), lessonSlug: v.string() },
  returns: v.object({
    module: schema.doc("modules"),
    lesson: schema.doc("lessons"),
    status: v.string(),
    questions: v.array(
      v.object({
        questionId: v.id("assessmentQuestions"),
        kind: assessmentQuestionKind,
        prompt: v.string(),
        options: v.array(
          v.object({
            optionId: v.id("assessmentQuestionOptions"),
            text: v.string(),
          }),
        ),
      }),
    ),
    passMark: v.number(),
    /** Best score so far, or null when never attempted. */
    bestScorePercent: v.union(v.number(), v.null()),
    lastAttempt: v.union(
      v.object({
        scorePercent: v.number(),
        passed: v.boolean(),
        attemptedAt: v.number(),
      }),
      v.null(),
    ),
    attemptCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const { module, enrollment } = await assignedModuleOrThrow(ctx, userId, args.moduleSlug);

    const lessons = await publishedLessons(ctx, module._id);
    const lesson = lessons.find((row) => row.slug === args.lessonSlug);
    if (lesson === undefined) {
      // Same message `learn.lesson` gives, so a draft assessment reads exactly
      // like one that does not exist.
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That lesson is not part of this module.",
      });
    }
    if (lesson.kind !== "assessment") {
      throw new ConvexError({ code: "INVALID", message: "That lesson is not an assessment." });
    }

    const questionRows = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);

    const questions = [];
    for (const question of questionRows) {
      const options = await ctx.db
        .query("assessmentQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
        .take(MAX_OPTIONS);
      questions.push({
        questionId: question._id,
        kind: question.kind,
        prompt: question.prompt,
        // Mapped by hand, so an added column on the options table cannot
        // silently start reaching the learner.
        options: options.map((option) => ({ optionId: option._id, text: option.text })),
      });
    }

    // `assessmentAttempts` grows without bound, so this read is capped like
    // every other.
    const attempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId).eq("moduleId", module._id))
      .take(MAX_ATTEMPTS);
    let lastAttempt: { scorePercent: number; passed: boolean; attemptedAt: number } | null = null;
    for (const attempt of attempts) {
      if (lastAttempt === null || attempt.attemptedAt > lastAttempt.attemptedAt) {
        lastAttempt = {
          scorePercent: attempt.scorePercent,
          passed: attempt.passed,
          attemptedAt: attempt.attemptedAt,
        };
      }
    }

    const progress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId).eq("lessonId", lesson._id))
      .unique();

    return {
      module,
      lesson,
      status: progress?.status ?? "not_started",
      questions,
      passMark: module.passMark,
      // Read from the enrollment rather than recomputed over the attempts, so
      // it cannot disagree with the number the profile ledger already shows.
      bestScorePercent: enrollment.score ?? null,
      lastAttempt,
      attemptCount: attempts.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Record that the caller opened, or finished, a lesson.
 *
 * Progress is per-learner state and lives in `lessonProgress`, never on the
 * shared content row — the rule the whole schema is built around. The
 * enrollment's `progressPercent` is then recomputed from those rows rather
 * than incremented, so it cannot drift away from the lessons behind it, and
 * `users.compliancePercent` is recomputed from the enrollments for the same
 * reason. Nothing here is a number somebody typed.
 */
export const recordLessonProgress = mutation({
  args: {
    moduleSlug: v.string(),
    lessonSlug: v.string(),
    completed: v.boolean(),
  },
  returns: v.object({
    progressPercent: v.number(),
    moduleCompleted: v.boolean(),
    /** What this call actually paid out. Zero when nothing new was finished. */
    xpAwarded: v.number(),
    cptdAwarded: v.number(),
    badgesAwarded: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { user, userId } = await requireStaff(ctx);
    const { module, enrollment } = await assignedModuleOrThrow(ctx, userId, args.moduleSlug);

    const lesson = await ctx.db
      .query("lessons")
      .withIndex("by_moduleId_and_slug", (q) =>
        q.eq("moduleId", module._id).eq("slug", args.lessonSlug),
      )
      .unique();
    if (lesson === null || lesson.publishState !== "published") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That lesson is not part of this module.",
      });
    }

    // An assessment is completed by passing it, not by asserting it. This is a
    // public mutation, so hiding the button would leave the pass mark advisory:
    // anyone could call this and take the module, its XP and its CPTD points
    // without answering a question. Opening one is still a visit, so
    // `completed: false` is deliberately untouched.
    if (lesson.kind === "assessment" && args.completed) {
      throw new ConvexError({
        code: "USE_ASSESSMENT",
        message: "Complete this assessment by passing it.",
      });
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId).eq("lessonId", lesson._id))
      .unique();

    return await applyLessonCompletion(ctx, {
      user,
      userId,
      module,
      enrollment,
      lesson,
      existingProgress: existing,
      completed: args.completed,
      now,
    });
  },
});

/**
 * Grade one attempt at a module's assessment.
 *
 * **Grading reads the database, never the client's claim about what is
 * correct.** The request carries only which option was picked; which option was
 * right is looked up here. The score is over every question in the bank, so
 * answering only the one question you happen to know scores 1/N, not 100%.
 *
 * A wrong answer is not an error. An unanswered question, or an option id that
 * belongs to a different question, simply scores zero for that question — a
 * legitimate submission and a client bug respectively, and neither deserves a
 * 500 in a teacher's face.
 *
 * Every attempt is recorded. Passing is what completes the lesson, which is why
 * `recordLessonProgress` refuses to complete an assessment lesson directly;
 * failing leaves the lesson open and the teacher can try again.
 */
export const submitAssessment = mutation({
  args: {
    moduleSlug: v.string(),
    lessonSlug: v.string(),
    answers: v.array(
      v.object({
        questionId: v.id("assessmentQuestions"),
        optionId: v.id("assessmentQuestionOptions"),
      }),
    ),
  },
  returns: v.object({
    scorePercent: v.number(),
    passMark: v.number(),
    passed: v.boolean(),
    correctCount: v.number(),
    totalCount: v.number(),
    /** Per question, right or wrong. Never which option was the right one. */
    results: v.array(v.object({ questionId: v.id("assessmentQuestions"), correct: v.boolean() })),
    bestScorePercent: v.number(),
    progressPercent: v.number(),
    moduleCompleted: v.boolean(),
    xpAwarded: v.number(),
    cptdAwarded: v.number(),
    badgesAwarded: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { user, userId } = await requireStaff(ctx);
    const { module, enrollment } = await assignedModuleOrThrow(ctx, userId, args.moduleSlug);

    const lessons = await publishedLessons(ctx, module._id);
    const lesson = lessons.find((row) => row.slug === args.lessonSlug);
    if (lesson === undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That lesson is not part of this module.",
      });
    }
    if (lesson.kind !== "assessment") {
      throw new ConvexError({ code: "INVALID", message: "That lesson is not an assessment." });
    }

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    // Never score 0/0. It would round to 100%, complete the module, and hand
    // out a Quiz Ace badge for an assessment nobody has written yet.
    if (questions.length === 0) {
      throw new ConvexError({
        code: "NOT_READY",
        message: "This assessment has no questions yet.",
      });
    }

    // Last write wins if a client sends the same question twice.
    const picked = new Map<string, string>();
    for (const answer of args.answers) picked.set(answer.questionId, answer.optionId);

    const results = [];
    let correctCount = 0;
    for (const question of questions) {
      const options = await ctx.db
        .query("assessmentQuestionOptions")
        .withIndex("by_questionId_and_order", (q) => q.eq("questionId", question._id))
        .take(MAX_OPTIONS);
      const chosen = picked.get(question._id);
      // An option from another question fails this lookup and scores wrong,
      // which is what makes a mismatched id harmless rather than fatal.
      const correct =
        chosen !== undefined && options.some((option) => option._id === chosen && option.isCorrect);
      if (correct) correctCount += 1;
      results.push({ questionId: question._id, correct });
    }

    const scorePercent = Math.round((correctCount / questions.length) * 100);
    const passed = scorePercent >= module.passMark;

    // Every transition captured before anything is written, which is the
    // contract `applyLessonCompletion` depends on.
    const existingProgress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId).eq("lessonId", lesson._id))
      .unique();
    const priorBest = enrollment.score;
    const now = Date.now();

    // Written on every attempt, pass or fail. This row is what "the attempt was
    // recorded but the lesson is not complete" actually means.
    await ctx.db.insert("assessmentAttempts", {
      userId,
      moduleId: module._id,
      lessonId: lesson._id,
      scorePercent,
      passed,
      attemptedAt: now,
    });

    // Best of, updated on every attempt rather than only on a pass. The schema
    // calls an undefined score "never attempted", which is a fact about
    // attempts: somebody who has scored 70% five times against an 80% pass mark
    // should not still read as "—" on their own profile.
    const bestScorePercent = Math.max(priorBest ?? 0, scorePercent);

    if (!passed) {
      await ctx.db.patch("enrollments", enrollment._id, {
        score: bestScorePercent,
        lastAccessedAt: now,
      });
      await ctx.db.patch("users", userId, { lastActiveAt: now });
      return {
        scorePercent,
        passMark: module.passMark,
        passed,
        correctCount,
        totalCount: questions.length,
        results,
        bestScorePercent,
        // Unchanged: a failed attempt writes no lesson progress. The route's
        // mount effect already recorded the visit.
        progressPercent: enrollment.progressPercent,
        moduleCompleted: enrollment.status === "completed",
        xpAwarded: 0,
        cptdAwarded: 0,
        badgesAwarded: [],
      };
    }

    // The new score rides in on the helper's single enrollment patch, so the
    // badge facts it reads back afterwards already see it. Patching the score
    // separately beforehand would also work, but this way Quiz Ace cannot be
    // awarded one attempt late.
    const awards = await applyLessonCompletion(ctx, {
      user,
      userId,
      module,
      enrollment,
      lesson,
      existingProgress,
      completed: true,
      now,
      extraEvents: ["assessment_passed"],
      extraEnrollmentPatch: { score: bestScorePercent },
    });

    return {
      scorePercent,
      passMark: module.passMark,
      passed,
      correctCount,
      totalCount: questions.length,
      results,
      bestScorePercent,
      ...awards,
    };
  },
});

/**
 * The signed-in teacher's own profile.
 *
 * Module-level progress only, deliberately. `lessonProgress` is empty for
 * every seeded enrollment that reports 100% complete, so a lesson counter
 * would print "0 of 18" beside "100%" and contradict itself on the same card.
 * The enrollment rows are the honest unit here.
 */
export const profile = query({
  args: { now: v.number() },
  returns: v.object({
    name: v.string(),
    initials: v.string(),
    jobTitle: v.string(),
    phaseName: v.string(),
    email: v.string(),
    joinedAt: v.number(),
    xpTotal: v.number(),
    cptdPoints: v.number(),
    compliancePercent: v.number(),
    streakDays: v.number(),
    modulesAssigned: v.number(),
    modulesCompleted: v.number(),
    badges: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        description: v.string(),
        awardedAt: v.union(v.number(), v.null()),
      }),
    ),
    /** Completed modules and what each was worth, newest first. */
    ledger: v.array(
      v.object({
        moduleId: v.id("modules"),
        title: v.string(),
        slug: v.string(),
        cptdPoints: v.number(),
        completedAt: v.union(v.number(), v.null()),
        score: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { user, userId } = await requireStaff(ctx);

    const phase = await ctx.db.get("phases", user.phaseId);

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
      .take(MAX_MODULES);

    const ledger = [];
    for (const enrollment of enrollments) {
      if (enrollment.status !== "completed") continue;
      const module = await ctx.db.get("modules", enrollment.moduleId);
      if (module === null) continue;
      ledger.push({
        moduleId: module._id,
        title: module.title,
        slug: module.slug,
        cptdPoints: module.cptdPoints,
        completedAt: enrollment.completedAt ?? null,
        score: enrollment.score ?? null,
      });
    }
    ledger.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    const activity = await ctx.db
      .query("progressEvents")
      .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_ACTIVITY);
    const streakDays = currentStreak(
      activity.map((row) => row.occurredAt),
      args.now,
    );

    const held = await ctx.db
      .query("badgeAwards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BADGES.length * 2);
    const awardedAt = new Map(held.map((row) => [row.badgeKey, row.awardedAt]));

    return {
      name: `${user.honorific === undefined ? "" : `${user.honorific} `}${user.firstName} ${user.lastName}`.trim(),
      initials: `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase(),
      jobTitle: user.jobTitle,
      phaseName: phase?.name ?? "Unassigned",
      email: user.email,
      joinedAt: user._creationTime,
      xpTotal: user.xpTotal,
      cptdPoints: user.cptdPoints,
      compliancePercent: user.compliancePercent,
      streakDays,
      modulesAssigned: enrollments.length,
      modulesCompleted: ledger.length,
      // The catalogue drives the list, so an unearned badge still shows what
      // it takes. A stored award whose key has since been retired is ignored
      // rather than rendered as a hole.
      badges: BADGES.map((badge) => ({
        key: badge.key,
        label: badge.label,
        description: badge.description,
        awardedAt: awardedAt.get(badge.key) ?? null,
      })),
      ledger,
    };
  },
});

/**
 * The staff leaderboard.
 *
 * This is the first query in the app that returns one colleague's data to
 * another, so what it does NOT return is the important part. `convex/AGENTS.md`
 * keeps the personnel file behind `requireAdmin` because it is employee PII,
 * and that stays true: no email, no `employmentStatus`, no `jobTitle`, no
 * `compliancePercent` — which is the school's performance metric and nobody's
 * business but theirs and an admin's — and no `Id<"users">`, so a row here
 * cannot be used as a key into anything else. Name, phase and XP only, which
 * is the minimum a leaderboard can be and still be one.
 *
 * `super_admin` is excluded for the same reason `dashboard.adminOverview`
 * excludes it: an operator login belongs to nobody and would appear as a
 * person the school has never employed, sitting at zero.
 */
export const leaderboard = query({
  args: { now: v.number() },
  returns: v.object({
    rows: v.array(
      v.object({
        rank: v.number(),
        name: v.string(),
        initials: v.string(),
        phaseName: v.string(),
        xpTotal: v.number(),
        isMe: v.boolean(),
      }),
    ),
    myRank: v.union(v.number(), v.null()),
    /** XP needed to pass the person above, or null when already first. */
    xpToNextRank: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);

    const active = await ctx.db
      .query("users")
      .withIndex("by_employmentStatus_and_xpTotal", (q) => q.eq("employmentStatus", "active"))
      .take(MAX_STAFF);

    const phaseRows = await ctx.db.query("phases").withIndex("by_order").take(MAX_PHASES);
    const phaseNames = new Map(phaseRows.map((phase) => [phase._id, phase.name]));

    const ranked = active
      .filter((person) => person.accessRole !== "super_admin")
      // Surname breaks a tie, so equal scores get a stable order rather than
      // one that shuffles between reads.
      .sort((a, b) => b.xpTotal - a.xpTotal || a.lastName.localeCompare(b.lastName));

    const rows = ranked.map((person, index) => ({
      rank: index + 1,
      name: `${person.honorific === undefined ? "" : `${person.honorific} `}${person.firstName} ${person.lastName}`.trim(),
      initials: `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase(),
      phaseName: phaseNames.get(person.phaseId) ?? "Unassigned",
      xpTotal: person.xpTotal,
      isMe: person._id === userId,
    }));

    const meIndex = rows.findIndex((row) => row.isMe);
    return {
      rows,
      myRank: meIndex === -1 ? null : meIndex + 1,
      xpToNextRank: meIndex <= 0 ? null : rows[meIndex - 1].xpTotal - rows[meIndex].xpTotal,
    };
  },
});

/**
 * Who is signed in, plus the few facts the learner chrome shows.
 *
 * One small query so the shell can render a real name, real initials and a
 * real streak on every page without a second round trip. `now` is an argument
 * like everywhere else; callers should pass the start of the current day
 * rather than the current millisecond, or the query key changes on every
 * render and refetches forever.
 */
export const me = query({
  args: { now: v.number() },
  returns: v.object({
    name: v.string(),
    initials: v.string(),
    jobTitle: v.string(),
    isAdmin: v.boolean(),
    streakDays: v.number(),
  }),
  handler: async (ctx, args) => {
    const { user, userId } = await requireStaff(ctx);

    const activity = await ctx.db
      .query("progressEvents")
      .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_ACTIVITY);

    return {
      name: `${user.honorific === undefined ? "" : `${user.honorific} `}${user.firstName} ${user.lastName}`.trim(),
      initials: `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase(),
      jobTitle: user.jobTitle,
      isAdmin: user.accessRole === "smt_admin" || user.accessRole === "super_admin",
      streakDays: currentStreak(
        activity.map((row) => row.occurredAt),
        args.now,
      ),
    };
  },
});
