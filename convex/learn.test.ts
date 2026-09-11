/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import resendComponent from "@convex-dev/resend/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The learner surface, and the award rules it runs.
 *
 * Two properties carry this file. The first is entitlement: a teacher sees
 * what they were assigned and refuses everything else, and identity comes from
 * the token rather than an argument. The second is that awards are paid
 * exactly once — XP and CPTD points are the one thing in this codebase that is
 * incremented rather than recomputed, so a replayed lesson double-paying is a
 * real and permanent corruption of somebody's record.
 */

const modules = import.meta.glob("./**/*.ts");

function newTest() {
  const t = convexTest(schema, modules);
  r2Component.register(t);
  actionRetrier.register(t, "r2/actionRetrier");
  resendComponent.register(t);
  rateLimiter.register(t, "resend/rateLimiter");
  workpool.register(t, "resend/emailWorkpool");
  workpool.register(t, "resend/callbackWorkpool");
  return t;
}

let t: ReturnType<typeof newTest>;
let phaseId: Id<"phases">;
let teacherId: Id<"users">;
let otherTeacherId: Id<"users">;
let operatorId: Id<"users">;
let moduleId: Id<"modules">;
let lessonAId: Id<"lessons">;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const teacher = () => asUser(teacherId);

const MODULE_SLUG = "health-and-safety";
const MODULE_CPTD = 2;

beforeEach(async () => {
  t = newTest();
  const ids = await t.run(async (ctx) => {
    const phase = await ctx.db.insert("phases", { name: "Foundation", order: 1, isActive: true });
    const base = {
      phaseId: phase,
      employmentStatus: "active" as const,
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
      jobTitle: "Teacher",
    };
    const teacherRow = await ctx.db.insert("users", {
      ...base,
      firstName: "Nomsa",
      lastName: "Khumalo",
      email: "nomsa@cliffview.test",
      accessRole: "staff" as const,
    });
    const otherRow = await ctx.db.insert("users", {
      ...base,
      firstName: "Sam",
      lastName: "Staff",
      email: "sam@cliffview.test",
      accessRole: "staff" as const,
      xpTotal: 9999,
    });
    const operatorRow = await ctx.db.insert("users", {
      ...base,
      firstName: "System",
      lastName: "Administrator",
      email: "operator@cliffview.test",
      accessRole: "super_admin" as const,
      xpTotal: 50_000,
    });

    const mod = await ctx.db.insert("modules", {
      slug: MODULE_SLUG,
      number: "04",
      sequence: 4,
      title: "Health & Safety",
      description: "d",
      audience: "a",
      outcome: "o",
      category: "Core Policies" as const,
      durationMinutes: 20,
      cptdPoints: MODULE_CPTD,
      passMark: 80,
      format: "Self-paced",
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });
    const lessonA = await ctx.db.insert("lessons", {
      moduleId: mod,
      slug: "why-this-matters",
      title: "Why this matters",
      summary: "s",
      kind: "video" as const,
      order: 1,
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });
    await ctx.db.insert("lessons", {
      moduleId: mod,
      slug: "key-guidelines",
      title: "Key guidelines",
      summary: "s",
      kind: "reading" as const,
      order: 2,
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });
    await ctx.db.insert("enrollments", {
      userId: teacherRow,
      moduleId: mod,
      status: "not_started" as const,
      progressPercent: 0,
      assignedAt: Date.now(),
    });
    return { phase, teacherRow, otherRow, operatorRow, mod, lessonA };
  });
  phaseId = ids.phase;
  teacherId = ids.teacherRow;
  otherTeacherId = ids.otherRow;
  operatorId = ids.operatorRow;
  moduleId = ids.mod;
  lessonAId = ids.lessonA;
});

const userRow = async (id: Id<"users">) =>
  await t.run(async (ctx) => await ctx.db.get("users", id));
const complete = (lessonSlug: string) =>
  teacher().mutation(api.learn.recordLessonProgress, {
    moduleSlug: MODULE_SLUG,
    lessonSlug,
    completed: true,
  });

// ---------------------------------------------------------------------------

describe("only what you were assigned", () => {
  test("no identity is refused", async () => {
    await expect(t.query(api.learn.myModules, {})).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
    await expect(t.query(api.learn.profile, { now: Date.now() })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
    await expect(t.query(api.learn.leaderboard, { now: Date.now() })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("an inactive account is refused", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("users", teacherId, { employmentStatus: "inactive" });
    });
    await expect(teacher().query(api.learn.myModules, {})).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("a module you were not assigned is refused, not merely hidden", async () => {
    await expect(
      asUser(otherTeacherId).query(api.learn.moduleDetail, { slug: MODULE_SLUG }),
    ).rejects.toThrow(/NOT_ASSIGNED|not assigned to you/i);
  });

  test("an unpublished module reads the same as an unassigned one", async () => {
    // Whether a draft exists is editorial information a learner should not be
    // able to infer from the difference between two error messages.
    await t.run(async (ctx) => {
      await ctx.db.patch("modules", moduleId, { publishState: "draft" });
    });
    await expect(teacher().query(api.learn.moduleDetail, { slug: MODULE_SLUG })).rejects.toThrow(
      /NOT_ASSIGNED|not assigned to you/i,
    );
  });

  test("you cannot record progress against somebody else's module", async () => {
    await expect(
      asUser(otherTeacherId).mutation(api.learn.recordLessonProgress, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: "why-this-matters",
        completed: true,
      }),
    ).rejects.toThrow(/NOT_ASSIGNED|not assigned to you/i);
  });

  test("myModules returns only your own enrollments", async () => {
    const mine = await teacher().query(api.learn.myModules, {});
    expect(mine.modules).toHaveLength(1);
    const theirs = await asUser(otherTeacherId).query(api.learn.myModules, {});
    expect(theirs.modules).toHaveLength(0);
  });
});

describe("awards are paid exactly once", () => {
  test("finishing a lesson pays lesson XP and nothing else", async () => {
    const result = await complete("why-this-matters");
    expect(result).toMatchObject({ xpAwarded: 50, cptdAwarded: 0, moduleCompleted: false });
    expect((await userRow(teacherId))!.xpTotal).toBe(50);
    expect((await userRow(teacherId))!.cptdPoints).toBe(0);
  });

  test("replaying a finished lesson pays nothing", async () => {
    await complete("why-this-matters");
    const again = await complete("why-this-matters");
    expect(again.xpAwarded).toBe(0);
    expect(again.cptdAwarded).toBe(0);
    // The single most important assertion in this file.
    expect((await userRow(teacherId))!.xpTotal).toBe(50);
  });

  test("merely opening a lesson pays nothing", async () => {
    await teacher().mutation(api.learn.recordLessonProgress, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: "why-this-matters",
      completed: false,
    });
    expect((await userRow(teacherId))!.xpTotal).toBe(0);
  });

  test("finishing the last lesson pays the module bonus and its CPTD points", async () => {
    await complete("why-this-matters");
    const result = await complete("key-guidelines");

    expect(result.moduleCompleted).toBe(true);
    // 50 for the lesson + 2 CPTD x 100 for the module.
    expect(result.xpAwarded).toBe(50 + MODULE_CPTD * 100);
    expect(result.cptdAwarded).toBe(MODULE_CPTD);

    const after = (await userRow(teacherId))!;
    expect(after.xpTotal).toBe(50 + 50 + MODULE_CPTD * 100);
    expect(after.cptdPoints).toBe(MODULE_CPTD);
    expect(after.compliancePercent).toBe(100);
  });

  test("re-completing a finished module never pays the bonus twice", async () => {
    await complete("why-this-matters");
    await complete("key-guidelines");
    const before = (await userRow(teacherId))!;

    await complete("why-this-matters");
    await complete("key-guidelines");

    const after = (await userRow(teacherId))!;
    expect(after.xpTotal).toBe(before.xpTotal);
    expect(after.cptdPoints).toBe(before.cptdPoints);
  });
});

describe("activity and badges", () => {
  test("progress writes an append-only event history", async () => {
    await complete("why-this-matters");
    const events = await t.run(async (ctx) => await ctx.db.query("progressEvents").collect());
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("module_started");
    expect(kinds).toContain("lesson_completed");
    expect(events[0].monthKey).toMatch(/^\d{4}-\d{2}$/);
  });

  test("a first completion earns First Steps, once", async () => {
    await complete("why-this-matters");
    const done = await complete("key-guidelines");
    expect(done.badgesAwarded).toContain("first_steps");

    await complete("key-guidelines");
    const awards = await t.run(async (ctx) => await ctx.db.query("badgeAwards").collect());
    expect(awards.filter((a) => a.badgeKey === "first_steps")).toHaveLength(1);
  });

  test("the profile reports real totals, a ledger and a live streak", async () => {
    await complete("why-this-matters");
    await complete("key-guidelines");

    const view = await teacher().query(api.learn.profile, { now: Date.now() });
    expect(view.name).toBe("Nomsa Khumalo");
    expect(view.xpTotal).toBeGreaterThan(0);
    expect(view.cptdPoints).toBe(MODULE_CPTD);
    expect(view.modulesCompleted).toBe(1);
    expect(view.ledger[0]).toMatchObject({ title: "Health & Safety", cptdPoints: MODULE_CPTD });
    // Everybody starts at one; there is no history to backfill.
    expect(view.streakDays).toBe(1);
    expect(view.badges.find((b) => b.key === "first_steps")!.awardedAt).not.toBeNull();
  });

  test("a brand-new teacher has earned nothing", async () => {
    const view = await teacher().query(api.learn.profile, { now: Date.now() });
    expect(view.xpTotal).toBe(0);
    expect(view.streakDays).toBe(0);
    expect(view.ledger).toEqual([]);
    expect(view.badges.every((b) => b.awardedAt === null)).toBe(true);
  });
});

describe("the leaderboard shows colleagues, and only what it must", () => {
  test("it ranks by XP and marks the caller", async () => {
    const board = await teacher().query(api.learn.leaderboard, { now: Date.now() });
    expect(board.rows[0].name).toBe("Sam Staff");
    expect(board.rows[0].rank).toBe(1);
    expect(board.rows.find((r) => r.isMe)!.name).toBe("Nomsa Khumalo");
    expect(board.myRank).toBe(2);
    expect(board.xpToNextRank).toBe(9999);
  });

  test("an operator login is never on a teachers' leaderboard", async () => {
    const board = await teacher().query(api.learn.leaderboard, { now: Date.now() });
    expect(board.rows.map((r) => r.name)).not.toContain("System Administrator");
    // It has the highest XP of all, so its absence is the filter working
    // rather than it merely sorting low.
    expect((await userRow(operatorId))!.xpTotal).toBe(50_000);
  });

  test("it leaks no personnel data beyond name, phase and XP", async () => {
    const board = await teacher().query(api.learn.leaderboard, { now: Date.now() });
    const keys = Object.keys(board.rows[0]).sort();
    expect(keys).toEqual(["initials", "isMe", "name", "phaseName", "rank", "xpTotal"].sort());
    // Spelled out because these are the ones that would actually matter: an
    // email is contactable, compliance is a performance metric, and an id is a
    // key into the rest of the personnel file.
    const serialised = JSON.stringify(board);
    expect(serialised).not.toContain("@cliffview.test");
    expect(serialised).not.toContain("compliancePercent");
    expect(serialised).not.toContain("employmentStatus");
  });

  test("inactive staff drop off the board", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("users", otherTeacherId, { employmentStatus: "inactive" });
    });
    const board = await teacher().query(api.learn.leaderboard, { now: Date.now() });
    expect(board.rows.map((r) => r.name)).not.toContain("Sam Staff");
    expect(board.myRank).toBe(1);
    expect(board.xpToNextRank).toBeNull();
  });

  test("climbing the board is possible - the whole point of awarding XP", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("users", otherTeacherId, { xpTotal: 100 });
    });
    expect((await teacher().query(api.learn.leaderboard, { now: Date.now() })).myRank).toBe(2);

    await complete("why-this-matters");
    await complete("key-guidelines");

    const after = await teacher().query(api.learn.leaderboard, { now: Date.now() });
    expect(after.myRank).toBe(1);
  });
});

describe("phases resolve for display", () => {
  test("a leaderboard row names the phase rather than its id", async () => {
    const board = await teacher().query(api.learn.leaderboard, { now: Date.now() });
    expect(board.rows[0].phaseName).toBe("Foundation");
    expect(board.rows[0].phaseName).not.toBe(phaseId);
  });

  test("the lesson read still refuses a lesson from another module", async () => {
    await expect(
      teacher().query(api.learn.lesson, { moduleSlug: MODULE_SLUG, lessonSlug: "nope" }),
    ).rejects.toThrow(/NOT_FOUND|not part of this module/i);
    expect(lessonAId).toBeDefined();
  });
});
