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
 * The SMT compliance overview.
 *
 * This file exists because three of this screen's numbers were not derived
 * from anything. "Modules Completed" read a counter that only the seed ever
 * wrote, so it froze at its seeded value and drifted further with every real
 * completion; the six-month chart read `monthlyRollups`, which held a seeded
 * ramp anchored to the day the seed ran; and the month-over-month delta was
 * that ramp's `60 + i * 3` subtracted from a live figure, which rendered a
 * regression that never happened.
 *
 * The property worth protecting now is **agreement**: the overview counts
 * completions from `enrollments`, in the same traversal and over the same
 * scope as `reports.compliance`, so the tile and the report cannot disagree.
 * A test that only checked the tile in isolation would not have caught the
 * original bug — the tile was internally consistent, it simply described a
 * different school from the one the report described.
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
let adminId: Id<"users">;
let annId: Id<"users">;
let bobId: Id<"users">;
let operatorId: Id<"users">;
let departedId: Id<"users">;
let moduleAId: Id<"modules">;
let moduleBId: Id<"modules">;
let emptyPhaseId: Id<"phases">;

/** 2027-01-15T08:00:00Z. The six-month window is 2026-08 … 2027-01. */
const NOW = 1_800_000_000_000;
const IN_JANUARY = NOW - 3 * 86_400_000;
const IN_DECEMBER = Date.UTC(2026, 11, 20);
const IN_OCTOBER = Date.UTC(2026, 9, 3);
/** One month before the window opens. */
const BEFORE_WINDOW = Date.UTC(2026, 6, 15);

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const overview = () => asUser(adminId).query(api.dashboard.adminOverview, { now: NOW });
const report = () => asUser(adminId).query(api.reports.compliance, { now: NOW });

/** Completions, keyed by month, for the months this fixture touches. */
const trendOf = async () =>
  Object.fromEntries(
    (await overview()).completionTrend.map((p) => [p.monthKey, p.completedModules]),
  );

beforeEach(async () => {
  t = newTest();
  const ids = await t.run(async (ctx) => {
    const foundation = await ctx.db.insert("phases", {
      name: "Foundation Phase",
      order: 1,
      isActive: true,
    });
    const empty = await ctx.db.insert("phases", {
      name: "Intersen Phase",
      order: 2,
      isActive: true,
    });

    const base = {
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
      jobTitle: "Teacher",
      employmentStatus: "active" as const,
      accessRole: "staff" as const,
      phaseId: foundation,
    };

    const mkModule = async (slug: string, sequence: number) =>
      await ctx.db.insert("modules", {
        slug,
        number: `0${sequence}`,
        sequence,
        title: `Module ${sequence}`,
        description: "d",
        audience: "a",
        outcome: "o",
        category: "Core Policies" as const,
        durationMinutes: 30,
        cptdPoints: 2,
        passMark: 80,
        format: "Self-paced",
        publishState: "published" as const,
        contentUpdatedAt: NOW,
      });

    return {
      empty,
      adminRow: await ctx.db.insert("users", {
        ...base,
        firstName: "Ada",
        lastName: "Admin",
        email: "ada@cliffview.example",
        accessRole: "smt_admin" as const,
        compliancePercent: 100,
      }),
      annRow: await ctx.db.insert("users", {
        ...base,
        firstName: "Ann",
        lastName: "Abbott",
        email: "ann@cliffview.example",
        compliancePercent: 100,
      }),
      bobRow: await ctx.db.insert("users", {
        ...base,
        firstName: "Bob",
        lastName: "Baker",
        email: "bob@cliffview.example",
        compliancePercent: 50,
      }),
      operatorRow: await ctx.db.insert("users", {
        ...base,
        firstName: "System",
        lastName: "Operator",
        email: "operator@cliffview.example",
        accessRole: "super_admin" as const,
      }),
      departedRow: await ctx.db.insert("users", {
        ...base,
        firstName: "Dee",
        lastName: "Departed",
        email: "dee@cliffview.example",
        employmentStatus: "inactive" as const,
      }),
      a: await mkModule("module-a", 1),
      b: await mkModule("module-b", 2),
    };
  });

  adminId = ids.adminRow;
  annId = ids.annRow;
  bobId = ids.bobRow;
  operatorId = ids.operatorRow;
  departedId = ids.departedRow;
  moduleAId = ids.a;
  moduleBId = ids.b;
  emptyPhaseId = ids.empty;
});

async function complete(
  userId: Id<"users">,
  moduleId: Id<"modules">,
  completedAt: number | undefined,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("enrollments", {
      userId,
      moduleId,
      status: "completed",
      progressPercent: 100,
      assignedAt: BEFORE_WINDOW,
      ...(completedAt === undefined ? {} : { completedAt }),
    });
  });
}

describe("the tile and the report describe the same school", () => {
  test("Modules Completed equals the report's completed figure", async () => {
    await complete(annId, moduleAId, IN_JANUARY);
    await complete(bobId, moduleAId, IN_DECEMBER);
    await complete(annId, moduleBId, IN_OCTOBER);

    const { completedModules } = await overview();
    const { summary } = await report();

    expect(completedModules).toBe(3);
    // The assertion that matters: not the literal above, but that the two
    // screens cannot drift apart. This is what the counter broke.
    expect(completedModules).toBe(summary.completed);
  });

  test("they still agree once an operator and a departed teacher have completions", async () => {
    await complete(annId, moduleAId, IN_JANUARY);
    await complete(operatorId, moduleAId, IN_JANUARY);
    await complete(departedId, moduleBId, IN_DECEMBER);

    const { completedModules } = await overview();
    const { summary } = await report();

    // An operator login belongs to nobody and a departed teacher's record is
    // not the school's compliance. Both are out of scope for the headcount,
    // so both must be out of scope for the completion count too.
    expect(completedModules).toBe(1);
    expect(completedModules).toBe(summary.completed);
  });

  test("they agree when nothing has been completed at all", async () => {
    const { completedModules, completionTrend } = await overview();
    const { summary } = await report();

    expect(completedModules).toBe(0);
    expect(completedModules).toBe(summary.completed);
    // Zero-filled, not empty: six bars at zero is a fact, a missing chart is not.
    expect(completionTrend).toHaveLength(6);
    expect(completionTrend.every((point) => point.completedModules === 0)).toBe(true);
  });
});

describe("the six-month trend is bucketed by when the work was finished", () => {
  test("a completion lands in the month of its completedAt, not the current month", async () => {
    await complete(annId, moduleAId, IN_OCTOBER);
    await complete(bobId, moduleAId, IN_DECEMBER);
    await complete(annId, moduleBId, IN_DECEMBER);

    expect(await trendOf()).toEqual({
      "2026-08": 0,
      "2026-09": 0,
      "2026-10": 1,
      "2026-11": 0,
      "2026-12": 2,
      "2027-01": 0,
    });
  });

  test("exactly six points, oldest first", async () => {
    const { completionTrend } = await overview();
    expect(completionTrend.map((point) => point.monthKey)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  test("a completion older than the window counts all-time but sits in no bar", async () => {
    await complete(annId, moduleAId, BEFORE_WINDOW);

    const { completedModules, completionTrend } = await overview();
    // All-time is all time. Dropping it from the tile to make the chart add up
    // would be the tile lying to match the chart.
    expect(completedModules).toBe(1);
    expect(completionTrend.every((point) => point.completedModules === 0)).toBe(true);
    expect(completedModules).toBe((await report()).summary.completed);
  });

  test("a completed row with no timestamp counts all-time but sits in no bar", async () => {
    // Nothing writes this today, but `completedAt` is optional in the schema,
    // so a row without one must not be dropped from the count or crash the
    // bucketing.
    await complete(annId, moduleAId, undefined);

    const { completedModules, completionTrend } = await overview();
    expect(completedModules).toBe(1);
    expect(completionTrend.every((point) => point.completedModules === 0)).toBe(true);
    expect(completedModules).toBe((await report()).summary.completed);
  });

  test("an operator's completion is excluded from the bars too", async () => {
    await complete(operatorId, moduleAId, IN_DECEMBER);
    await complete(annId, moduleAId, IN_DECEMBER);

    expect((await trendOf())["2026-12"]).toBe(1);
  });
});

describe("a phase nobody is in", () => {
  test("reports zero staff rather than a bare 0%", async () => {
    const { phases } = await overview();
    const intersen = phases.find((phase) => phase.name === "Intersen Phase");

    // The screen needs to tell "nobody is in this phase" apart from "everybody
    // in this phase has completed nothing". Both render as 0% without this.
    expect(intersen).toBeDefined();
    expect(intersen!.staffCount).toBe(0);
    expect(intersen!.completionPercent).toBe(0);
    expect(emptyPhaseId).toBeDefined();
  });
});
