import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  BADGES,
  XP_PER_LESSON,
  currentStreak,
  monthKeyOf,
  newlyEarnedBadges,
  xpForModule,
} from "./lib/awards";
import { requireStaff } from "./lib/authz";
import { MAX_ACTIVITY, MAX_MODULES, MAX_PHASES, MAX_STAFF } from "./lib/counts";
import { MAX_SIBLINGS } from "./lib/ordering";
import { DOWNLOAD_URL_TTL_SECONDS, r2 } from "./lib/storage";
import schema from "./schema";

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

/** Published lessons of one module, in order. Bounded: a module holds a handful. */
async function publishedLessons(
  ctx: QueryCtx,
  moduleId: Id<"modules">,
): Promise<Array<Doc<"lessons">>> {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
    .take(MAX_SIBLINGS);
  // Drafts are editorial work in progress. A learner seeing one would be asked
  // to complete something the school has not finished writing.
  return lessons.filter((lesson) => lesson.publishState === "published");
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
    heroUrl: v.union(v.string(), v.null()),
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
    let heroUrl: string | null = null;
    if (current.heroAssetId !== undefined) {
      const hero = await ctx.db.get("assets", current.heroAssetId);
      if (hero !== null && hero.r2Key !== undefined) {
        heroUrl = await r2.getUrl(hero.r2Key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
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
      heroUrl,
      previousSlug: index > 0 ? lessons[index - 1].slug : null,
      nextSlug: index < lessons.length - 1 ? lessons[index + 1].slug : null,
      position: index + 1,
      total: lessons.length,
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

    const now = Date.now();
    const existing = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId).eq("lessonId", lesson._id))
      .unique();

    // Completion is sticky. Re-opening a finished lesson is a visit, not a
    // regression, and a tracker that quietly un-completed work would be worse
    // than one that never recorded it.
    const status = args.completed || existing?.status === "completed" ? "completed" : "in_progress";

    // The two transitions worth paying for, captured BEFORE anything is
    // written. Everything below keys off these rather than off the new state,
    // which is what stops a replayed lesson paying twice.
    const lessonNewlyCompleted = status === "completed" && existing?.status !== "completed";
    const moduleWasCompleted = enrollment.status === "completed";
    const moduleFirstOpened = enrollment.startedAt === undefined;

    if (existing === null) {
      await ctx.db.insert("lessonProgress", {
        userId,
        lessonId: lesson._id,
        moduleId: module._id,
        status,
        lastViewedAt: now,
        ...(status === "completed" ? { completedAt: now } : {}),
      });
    } else {
      await ctx.db.patch("lessonProgress", existing._id, {
        status,
        lastViewedAt: now,
        ...(status === "completed" && existing.completedAt === undefined
          ? { completedAt: now }
          : {}),
      });
    }

    // Recomputed from the rows, never incremented.
    const lessons = await publishedLessons(ctx, module._id);
    const progressRows = await ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId).eq("moduleId", module._id))
      .take(MAX_SIBLINGS);
    const publishedIds = new Set(lessons.map((row) => row._id));
    const done = progressRows.filter(
      (row) => row.status === "completed" && publishedIds.has(row.lessonId),
    ).length;
    const progressPercent = lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100);
    const moduleCompleted = lessons.length > 0 && done === lessons.length;

    await ctx.db.patch("enrollments", enrollment._id, {
      progressPercent,
      status: moduleCompleted ? "completed" : "in_progress",
      lastAccessedAt: now,
      ...(enrollment.startedAt === undefined ? { startedAt: now } : {}),
      ...(moduleCompleted && enrollment.completedAt === undefined ? { completedAt: now } : {}),
    });

    // Same formula as `staff.recomputeCompliance` and the seed. If these three
    // ever disagreed, a profile would contradict its own rows.
    const allEnrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
      .take(MAX_MODULES);
    const compliancePercent =
      allEnrollments.length === 0
        ? 0
        : Math.round(
            allEnrollments.reduce((sum, row) => sum + row.progressPercent, 0) /
              allEnrollments.length,
          );
    // --- earning ---------------------------------------------------------
    //
    // Awards are the one thing here that is incremented rather than
    // recomputed, and that is deliberate: XP and CPTD points are a record of
    // what somebody was paid at the time, not a function of their current
    // state. Recomputing them would mean un-paying a teacher whose module was
    // later archived. The guards above are what keep the increment honest.
    const moduleNewlyCompleted = moduleCompleted && !moduleWasCompleted;

    const xpAwarded =
      (lessonNewlyCompleted ? XP_PER_LESSON : 0) + (moduleNewlyCompleted ? xpForModule(module) : 0);
    const cptdAwarded = moduleNewlyCompleted ? module.cptdPoints : 0;

    // The append-only history. Nothing else writes this table, so it is also
    // the only thing that makes a streak computable at all.
    const events: Array<{ kind: "module_started" | "module_completed" | "lesson_completed" }> = [];
    if (moduleFirstOpened) events.push({ kind: "module_started" });
    if (lessonNewlyCompleted) events.push({ kind: "lesson_completed" });
    if (moduleNewlyCompleted) events.push({ kind: "module_completed" });
    for (const event of events) {
      await ctx.db.insert("progressEvents", {
        userId,
        moduleId: module._id,
        ...(event.kind === "lesson_completed" ? { lessonId: lesson._id } : {}),
        kind: event.kind,
        occurredAt: now,
        monthKey: monthKeyOf(now),
      });
    }

    await ctx.db.patch("users", userId, {
      compliancePercent,
      lastActiveAt: now,
      ...(xpAwarded === 0 ? {} : { xpTotal: user.xpTotal + xpAwarded }),
      ...(cptdAwarded === 0 ? {} : { cptdPoints: user.cptdPoints + cptdAwarded }),
    });

    // --- badges -----------------------------------------------------------
    // Newest first, because a streak is about the recent tail. Without the
    // `desc` this takes the OLDEST 500 events and a long-serving user's streak
    // would be computed from history that ended months ago.
    const activity = await ctx.db
      .query("progressEvents")
      .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_ACTIVITY);
    const held = await ctx.db
      .query("badgeAwards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BADGES.length * 2);

    const completedEnrollments = allEnrollments.filter((row) => row.status === "completed");
    const scores = allEnrollments
      .map((row) => row.score)
      .filter((score): score is number => score !== undefined);

    const badgesAwarded = newlyEarnedBadges(
      {
        modulesCompleted: completedEnrollments.length,
        modulesAssigned: allEnrollments.length,
        compliancePercent,
        streakDays: currentStreak(
          activity.map((row) => row.occurredAt),
          now,
        ),
        bestScorePercent: scores.length === 0 ? null : Math.max(...scores),
      },
      new Set(held.map((row) => row.badgeKey)),
    );
    for (const badgeKey of badgesAwarded) {
      await ctx.db.insert("badgeAwards", { userId, badgeKey, awardedAt: now });
    }

    return { progressPercent, moduleCompleted, xpAwarded, cptdAwarded, badgesAwarded };
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
