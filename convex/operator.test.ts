/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import resendComponent from "@convex-dev/resend/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The operator account.
 *
 * `internal.auth.provisionAdmin` is the only function in the codebase that can
 * mint an administrator, so it gets the same scrutiny as a mutation: that
 * re-running it does not duplicate a person, and — the part that is easy to get
 * wrong — that adding a login which belongs to nobody does not corrupt the
 * numbers on the dashboard.
 *
 * There is deliberately no test here that it is unreachable from a client.
 * convex-test does not enforce the public/internal split: it resolves an
 * internalMutation through `api` and runs it, so any such assertion would pass
 * for the wrong reason or fail while the product is correct. Visibility is
 * proven against the deployment instead, with `npx convex function-spec`, which
 * reports each function's real `visibility.kind`.
 */

const modules = import.meta.glob("./**/*.ts");

function newTest() {
  const t = convexTest(schema, modules);
  r2Component.register(t);
  actionRetrier.register(t, "r2/actionRetrier");
  // Same lesson, three more times. Resend nests a rate limiter and two
  // workpools, and at runtime each is addressed by its path under the
  // parent, while `@convex-dev/resend/test` registers only the parent.
  // Without these, any mutation that queues an email dies on an
  // unregistered component.
  resendComponent.register(t);
  rateLimiter.register(t, "resend/rateLimiter");
  workpool.register(t, "resend/emailWorkpool");
  workpool.register(t, "resend/callbackWorkpool");
  return t;
}

/** Two phases and four active staff, matching the shape of the real seed. */
async function seedSchool(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const foundation = await ctx.db.insert("phases", {
      name: "Foundation Phase",
      order: 1,
      isActive: true,
    });
    const intersen = await ctx.db.insert("phases", {
      name: "Intersen Phase",
      order: 2,
      isActive: true,
    });

    const base = {
      employmentStatus: "active" as const,
      cptdPoints: 0,
      xpTotal: 0,
      jobTitle: "Teacher",
    };
    // Compliance values chosen so the average is a whole number and any
    // accidental inclusion of a 0% operator is unmistakable: 25+40+100+75 = 240,
    // over 4 is 60. Over 5 it would be 48.
    await ctx.db.insert("users", {
      ...base,
      firstName: "Thabo",
      lastName: "Pillay",
      email: "thabo@cliffview.example",
      accessRole: "staff",
      phaseId: foundation,
      compliancePercent: 25,
    });
    await ctx.db.insert("users", {
      ...base,
      firstName: "Zanele",
      lastName: "Dlamini",
      email: "zanele@cliffview.example",
      accessRole: "staff",
      phaseId: intersen,
      compliancePercent: 40,
    });
    await ctx.db.insert("users", {
      ...base,
      firstName: "Hendrik",
      lastName: "van Wyk",
      email: "hendrik@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
      phaseId: foundation,
      compliancePercent: 100,
    });
    await ctx.db.insert("users", {
      ...base,
      firstName: "Priya",
      lastName: "Naidoo",
      email: "priya@cliffview.example",
      accessRole: "staff",
      phaseId: intersen,
      compliancePercent: 75,
    });

    return { foundation, intersen };
  });
}

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: userId });

describe("provisionAdmin", () => {
  test("creates a super_admin operator with an open claim window", async () => {
    const t = newTest();
    await seedSchool(t);

    const result = await t.mutation(internal.auth.provisionAdmin, {
      email: "admin@cliffview.example",
    });

    expect(result.created).toBe(true);
    expect(result.accessRole).toBe("super_admin");
    // No password yet — the row exists, the credential does not.
    expect(result.hasPassword).toBe(false);
    expect(result.allowedUntil).toBeGreaterThan(Date.now());

    const user = await t.run(async (ctx) => await ctx.db.get("users", result.userId));
    expect(user).toMatchObject({
      email: "admin@cliffview.example",
      accessRole: "super_admin",
      employmentStatus: "active",
      compliancePercent: 0,
    });
  });

  test("re-running repairs the row instead of creating a second one", async () => {
    const t = newTest();
    await seedSchool(t);

    const first = await t.mutation(internal.auth.provisionAdmin, {
      email: "admin@cliffview.example",
    });
    // Simulate the account having been demoted and deactivated.
    await t.run(async (ctx) => {
      await ctx.db.patch("users", first.userId, {
        accessRole: "staff",
        employmentStatus: "inactive",
        adminClaimAllowedUntil: undefined,
      });
    });

    const second = await t.mutation(internal.auth.provisionAdmin, {
      email: "admin@cliffview.example",
    });

    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);

    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", "admin@cliffview.example"))
          .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accessRole: "super_admin", employmentStatus: "active" });
    expect(rows[0].adminClaimAllowedUntil ?? 0).toBeGreaterThan(Date.now());
  });

  test("normalises the email and refuses one without a domain", async () => {
    const t = newTest();
    await seedSchool(t);

    const result = await t.mutation(internal.auth.provisionAdmin, {
      email: "  ADMIN@Cliffview.Example  ",
    });
    expect(result.email).toBe("admin@cliffview.example");

    // A bare username would silently create an account nobody could sign in to,
    // because Convex Auth looks up the full address.
    await expect(t.mutation(internal.auth.provisionAdmin, { email: "admin" })).rejects.toThrow(
      /INVALID|full email/i,
    );
  });

  test("refuses to run before the school is seeded", async () => {
    const t = newTest();
    // No phases: `users.phaseId` is required, so there is nothing to point at.
    await expect(
      t.mutation(internal.auth.provisionAdmin, { email: "admin@cliffview.example" }),
    ).rejects.toThrow(/INVALID|phases/i);
  });
});

describe("the operator account does not corrupt the dashboard", () => {
  test("headcount and compliance are identical before and after provisioning", async () => {
    const t = newTest();
    await seedSchool(t);

    const hendrik = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", "hendrik@cliffview.example"))
          .unique())!._id,
    );
    const now = Date.now();

    const before = await asUser(t, hendrik).query(api.dashboard.adminOverview, { now });
    expect(before.totalStaff).toBe(4);
    expect(before.averageCompliancePercent).toBe(60);

    await t.mutation(internal.auth.provisionAdmin, { email: "admin@cliffview.example" });

    const after = await asUser(t, hendrik).query(api.dashboard.adminOverview, { now });
    // An operator is a login, not a person on the staff list. Counting one
    // would report 5 staff and drag the average to 48%, two tiles nobody could
    // reconcile against the four names in the directory.
    expect(after.totalStaff).toBe(4);
    expect(after.averageCompliancePercent).toBe(60);
  });

  test("the operator is left out of its placeholder phase's average too", async () => {
    const t = newTest();
    const { foundation } = await seedSchool(t);
    const now = Date.now();

    await t.mutation(internal.auth.provisionAdmin, { email: "admin@cliffview.example" });

    const operatorId = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", "admin@cliffview.example"))
          .unique())!._id,
    );
    // provisionAdmin parks the operator in the first phase because phaseId is
    // required; that is only defensible while the phase averages exclude it.
    const parkedIn = await t.run(async (ctx) => (await ctx.db.get("users", operatorId))!.phaseId);
    expect(parkedIn).toBe(foundation);

    const overview = await asUser(t, operatorId).query(api.dashboard.adminOverview, { now });
    const foundationRow = overview.phases.find((p) => p.name === "Foundation Phase");
    // Thabo at 25 and Hendrik at 100 -> 2 staff, 63 (rounded from 62.5). With
    // the operator counted it would be 3 staff and 42.
    expect(foundationRow?.staffCount).toBe(2);
    expect(foundationRow?.completionPercent).toBe(63);
  });

  test("a super_admin passes the admin gate", async () => {
    const t = newTest();
    await seedSchool(t);
    const { userId } = await t.mutation(internal.auth.provisionAdmin, {
      email: "admin@cliffview.example",
    });

    // The whole reason for the account: it must be able to read admin surfaces.
    const viewer = await asUser(t, userId).query(api.auth.viewer, {});
    expect(viewer).toMatchObject({ isAdmin: true, jobTitle: "System Administrator" });

    const library = await asUser(t, userId).query(api.modules.listForAdmin, {});
    expect(Array.isArray(library)).toBe(true);
  });
});
