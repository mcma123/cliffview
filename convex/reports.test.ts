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
 * Compliance reporting.
 *
 * The property this file exists for is that a report never overstates or
 * understates. Three ways it could:
 *
 * 1. counting people who should not be counted — operators, who belong to
 *    nobody, and departed staff, whose record is not the school's compliance;
 * 2. treating "nobody was asked" as "nobody completed" — a module with no
 *    enrollments is not 0% complete;
 * 3. treating "not yet attempted" as a score of zero, which would drag every
 *    module average down by however many people have not sat it.
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
let staffId: Id<"users">;
let inactiveAdminId: Id<"users">;
let foundationId: Id<"phases">;
let seniorId: Id<"phases">;
let moduleAId: Id<"modules">;
let moduleBId: Id<"modules">;
/** Two Foundation teachers and one Senior teacher. */
let annId: Id<"users">;
let bobId: Id<"users">;
let cathId: Id<"users">;

const NOW = 1_800_000_000_000;
const PAST = NOW - 86_400_000;
const FUTURE = NOW + 86_400_000;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const admin = () => asUser(adminId);
const report = (phaseId?: Id<"phases">) =>
  admin().query(api.reports.compliance, {
    now: NOW,
    ...(phaseId === undefined ? {} : { phaseId }),
  });

const moduleRow = async (id: Id<"modules">, phaseId?: Id<"phases">) =>
  (await report(phaseId)).modules.find((row) => row.moduleId === id)!;

beforeEach(async () => {
  t = newTest();
  const ids = await t.run(async (ctx) => {
    const foundation = await ctx.db.insert("phases", {
      name: "Foundation Phase",
      order: 1,
      isActive: true,
    });
    const senior = await ctx.db.insert("phases", {
      name: "Senior Phase",
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
      foundation,
      senior,
      adminRow: await ctx.db.insert("users", {
        ...base,
        phaseId: senior,
        firstName: "Ada",
        lastName: "Admin",
        email: "ada@cliffview.example",
        jobTitle: "Head of Department",
        accessRole: "smt_admin" as const,
        compliancePercent: 100,
      }),
      operatorRow: await ctx.db.insert("users", {
        ...base,
        phaseId: senior,
        firstName: "System",
        lastName: "Operator",
        email: "operator@cliffview.example",
        accessRole: "super_admin" as const,
        compliancePercent: 0,
      }),
      inactiveAdminRow: await ctx.db.insert("users", {
        ...base,
        phaseId: senior,
        firstName: "Gone",
        lastName: "Admin",
        email: "gone@cliffview.example",
        accessRole: "smt_admin" as const,
        employmentStatus: "inactive" as const,
      }),
      annRow: await ctx.db.insert("users", {
        ...base,
        phaseId: foundation,
        firstName: "Ann",
        lastName: "Abbott",
        email: "ann@cliffview.example",
        compliancePercent: 100,
      }),
      bobRow: await ctx.db.insert("users", {
        ...base,
        phaseId: foundation,
        firstName: "Bob",
        lastName: "Baker",
        email: "bob@cliffview.example",
        compliancePercent: 50,
      }),
      cathRow: await ctx.db.insert("users", {
        ...base,
        phaseId: senior,
        firstName: "Cath",
        lastName: "Carter",
        email: "cath@cliffview.example",
        compliancePercent: 0,
      }),
      departedRow: await ctx.db.insert("users", {
        ...base,
        phaseId: foundation,
        firstName: "Dee",
        lastName: "Departed",
        email: "dee@cliffview.example",
        employmentStatus: "inactive" as const,
        compliancePercent: 0,
      }),
      a: await mkModule("module-a", 1),
      b: await mkModule("module-b", 2),
    };
  });

  foundationId = ids.foundation;
  seniorId = ids.senior;
  adminId = ids.adminRow;
  staffId = ids.annRow;
  inactiveAdminId = ids.inactiveAdminRow;
  annId = ids.annRow;
  bobId = ids.bobRow;
  cathId = ids.cathRow;
  moduleAId = ids.a;
  moduleBId = ids.b;

  // Module A: Ann completed with 100, Bob in progress with 80, Cath not
  // started and overdue, plus a departed teacher who must not be counted.
  // Module B: nobody assigned at all.
  await t.run(async (ctx) => {
    const enrol = async (
      userId: Id<"users">,
      moduleId: Id<"modules">,
      status: "not_started" | "in_progress" | "completed",
      extra: { score?: number; dueAt?: number; progressPercent?: number } = {},
    ) =>
      await ctx.db.insert("enrollments", {
        userId,
        moduleId,
        status,
        progressPercent: extra.progressPercent ?? (status === "completed" ? 100 : 0),
        assignedAt: PAST,
        ...(extra.score === undefined ? {} : { score: extra.score }),
        ...(extra.dueAt === undefined ? {} : { dueAt: extra.dueAt }),
      });

    await enrol(annId, moduleAId, "completed", { score: 100, dueAt: PAST });
    await enrol(bobId, moduleAId, "in_progress", { score: 80, progressPercent: 50 });
    await enrol(cathId, moduleAId, "not_started", { dueAt: PAST });
    await enrol(ids.departedRow, moduleAId, "not_started", { dueAt: PAST });
  });
});

describe("only an admin may read the school's record", () => {
  test("no identity is refused", async () => {
    await expect(t.query(api.reports.compliance, { now: NOW })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused — this is the whole school's record", async () => {
    await expect(asUser(staffId).query(api.reports.compliance, { now: NOW })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("an inactive admin is refused", async () => {
    await expect(
      asUser(inactiveAdminId).query(api.reports.compliance, { now: NOW }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("an unknown phase is refused rather than silently reporting everyone", async () => {
    const strayPhase = await t.run(
      async (ctx) => await ctx.db.insert("phases", { name: "Gone", order: 9, isActive: true }),
    );
    await t.run(async (ctx) => await ctx.db.delete("phases", strayPhase));
    await expect(
      admin().query(api.reports.compliance, { now: NOW, phaseId: strayPhase }),
    ).rejects.toThrow(/does not exist/i);
  });
});

describe("who is counted", () => {
  test("the operator is left out of the headcount and the table", async () => {
    // An operator login belongs to nobody. Counting one adds a person who does
    // not exist and drags the average towards zero.
    const view = await report();
    expect(view.staff.some((row) => row.lastName === "Operator")).toBe(false);
    expect(view.summary.activeStaff).toBe(4); // Ada, Ann, Bob, Cath
  });

  test("departed staff are left out, and do not inflate a module's assigned count", async () => {
    const view = await report();
    expect(view.staff.some((row) => row.lastName === "Departed")).toBe(false);
    // Four enrollments exist on module A; only three belong to active staff.
    expect((await moduleRow(moduleAId)).assigned).toBe(3);
  });

  test("staff are listed by surname", async () => {
    const view = await report();
    expect(view.staff.map((row) => row.lastName)).toEqual(["Abbott", "Admin", "Baker", "Carter"]);
  });

  test("modules keep their sequence order", async () => {
    const view = await report();
    expect(view.modules.map((row) => row.number)).toEqual(["01", "02"]);
  });
});

describe("the arithmetic does not overstate", () => {
  test("completion is over the assigned, and rounds", async () => {
    // 1 of 3 completed.
    const row = await moduleRow(moduleAId);
    expect(row.completed).toBe(1);
    expect(row.inProgress).toBe(1);
    expect(row.notStarted).toBe(1);
    expect(row.completionPercent).toBe(33);
  });

  test("a module nobody is assigned reports null, not 0%", async () => {
    // The distinction the whole page rests on: "nobody was asked" is not
    // "nobody completed it".
    const row = await moduleRow(moduleBId);
    expect(row.assigned).toBe(0);
    expect(row.completionPercent).toBeNull();
    expect(row.averageScorePercent).toBeNull();
    expect(row.scoredCount).toBe(0);
  });

  test("the average score ignores everyone who has not been scored", async () => {
    // Ann 100 and Bob 80 are scored; Cath has no score. The mean is 90, not 60.
    const row = await moduleRow(moduleAId);
    expect(row.averageScorePercent).toBe(90);
    expect(row.scoredCount).toBe(2);
  });

  test("overdue counts an unfinished past-due assignment, and not a finished one", async () => {
    // Ann's is past due but completed; Cath's is past due and not started.
    const row = await moduleRow(moduleAId);
    expect(row.overdue).toBe(1);
    const view = await report();
    expect(view.summary.overdue).toBe(1);
    expect(view.staff.find((r) => r.userId === cathId)?.overdue).toBe(1);
    expect(view.staff.find((r) => r.userId === annId)?.overdue).toBe(0);
  });

  test("a future due date is not overdue", async () => {
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("enrollments").take(20);
      const cath = rows.find((r) => r.userId === cathId)!;
      await ctx.db.patch("enrollments", cath._id, { dueAt: FUTURE });
    });
    expect((await moduleRow(moduleAId)).overdue).toBe(0);
  });

  test("per-person totals come out of the same pass as the module ones", async () => {
    const view = await report();
    expect(view.staff.find((r) => r.userId === annId)).toMatchObject({
      assigned: 1,
      completed: 1,
    });
    expect(view.staff.find((r) => r.userId === bobId)).toMatchObject({
      assigned: 1,
      completed: 0,
    });
    // Ada was never enrolled in anything.
    expect(view.staff.find((r) => r.userId === adminId)).toMatchObject({
      assigned: 0,
      completed: 0,
    });
    expect(view.summary.assignments).toBe(3);
    expect(view.summary.completed).toBe(1);
  });
});

describe("the phase filter moves the tiles and the tables together", () => {
  test("narrowing to a phase narrows the staff list", async () => {
    const view = await report(foundationId);
    expect(view.staff.map((row) => row.lastName)).toEqual(["Abbott", "Baker"]);
    expect(view.summary.activeStaff).toBe(2);
    expect(view.scope.phaseName).toBe("Foundation Phase");
    expect(view.scope.staffCount).toBe(2);
  });

  test("a module's assigned count drops to the in-phase staff only", async () => {
    // Cath is Senior, so module A shows two assigned rather than three — and
    // her overdue row goes with her.
    const row = await moduleRow(moduleAId, foundationId);
    expect(row.assigned).toBe(2);
    expect(row.completed).toBe(1);
    expect(row.completionPercent).toBe(50);
    expect(row.overdue).toBe(0);
  });

  test("the average compliance is over the filtered staff", async () => {
    // Ann 100, Bob 50 → 75. Unfiltered it would include Ada 100 and Cath 0.
    expect((await report(foundationId)).summary.averageCompliancePercent).toBe(75);
    expect((await report()).summary.averageCompliancePercent).toBe(63);
  });

  test("a phase with nobody in it reports zero rather than throwing", async () => {
    const empty = await t.run(
      async (ctx) => await ctx.db.insert("phases", { name: "Empty", order: 3, isActive: true }),
    );
    const view = await report(empty);
    expect(view.staff).toEqual([]);
    expect(view.summary.activeStaff).toBe(0);
    expect(view.summary.averageCompliancePercent).toBe(0);
    expect(view.modules.every((row) => row.assigned === 0)).toBe(true);
  });

  test("the phase picker offers only active phases", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("phases", seniorId, { isActive: false });
    });
    const view = await report();
    expect(view.phases.map((p) => p.name)).toEqual(["Foundation Phase"]);
  });
});
