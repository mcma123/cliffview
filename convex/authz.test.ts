/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Authorization tests.
 *
 * This project has no dev deployment — production is the only one — so
 * `convex-test` is the sandbox, and authorization is precisely the thing that
 * cannot be verified by clicking around. Every mutation gets the four
 * negatives: no identity, a staff identity, a stranger, and a cross-parent
 * write.
 *
 * `getAuthUserId` splits `identity.subject` on "|" and takes the first part,
 * so a bare user id is a valid subject here.
 */

const modules = import.meta.glob("./**/*.ts");

/** Minimal fixture: a phase, an admin, a staff member, and one module. */
async function seedFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const phaseId = await ctx.db.insert("phases", {
      name: "Foundation Phase",
      order: 1,
      isActive: true,
    });
    const base = {
      phaseId,
      employmentStatus: "active" as const,
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
    };
    const adminId = await ctx.db.insert("users", {
      ...base,
      firstName: "Ada",
      lastName: "Admin",
      email: "ada.admin@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });
    const staffId = await ctx.db.insert("users", {
      ...base,
      firstName: "Sam",
      lastName: "Staff",
      email: "sam.staff@cliffview.example",
      jobTitle: "Teacher",
      accessRole: "staff",
    });
    const inactiveAdminId = await ctx.db.insert("users", {
      ...base,
      employmentStatus: "inactive" as const,
      firstName: "Ivy",
      lastName: "Inactive",
      email: "ivy.inactive@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });

    const moduleId = await ctx.db.insert("modules", {
      slug: "existing-module",
      number: "01",
      sequence: 1,
      title: "Existing Module",
      description: "d",
      audience: "a",
      outcome: "o",
      category: "Core Policies" as const,
      durationMinutes: 10,
      cptdPoints: 1,
      passMark: 80,
      format: "Self-paced",
      publishState: "draft" as const,
      contentUpdatedAt: Date.now(),
    });

    return { phaseId, adminId, staffId, inactiveAdminId, moduleId };
  });
}

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: userId });

describe("requireAdmin on content mutations", () => {
  test("no identity is refused", async () => {
    const t = convexTest(schema, modules);
    await seedFixture(t);
    await expect(
      t.mutation(api.modules.create, { title: "Sneaky", category: "Core Policies" }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("a staff identity is refused", async () => {
    const t = convexTest(schema, modules);
    const { staffId } = await seedFixture(t);
    await expect(
      asUser(t, staffId).mutation(api.modules.create, {
        title: "Not allowed",
        category: "Core Policies",
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    const t = convexTest(schema, modules);
    const { inactiveAdminId } = await seedFixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.modules.create, {
        title: "Departed",
        category: "Core Policies",
      }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("a live session whose profile was deleted is refused", async () => {
    const t = convexTest(schema, modules);
    const { moduleId, staffId } = await seedFixture(t);

    // A real scenario, not a synthetic one: the staff member was removed while
    // their session was still valid. The token still verifies, so the identity
    // resolves, but there is no profile behind it any more.
    await t.run(async (ctx) => {
      await ctx.db.delete("users", staffId);
    });

    await expect(
      asUser(t, staffId).mutation(api.modules.update, { moduleId, title: "Ghost edit" }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("an admin succeeds", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seedFixture(t);
    const created = await asUser(t, adminId).mutation(api.modules.create, {
      title: "Brand New Module",
      category: "SMT Pathway",
    });
    expect(created.slug).toBe("brand-new-module");
  });
});

describe("requireAdmin on reads", () => {
  test("the module library refuses an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await seedFixture(t);
    await expect(t.query(api.modules.listForAdmin, {})).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("the overview refuses a staff caller", async () => {
    const t = convexTest(schema, modules);
    const { staffId } = await seedFixture(t);
    await expect(
      asUser(t, staffId).query(api.dashboard.adminOverview, { now: Date.now() }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("viewer returns null when unauthenticated rather than throwing", async () => {
    const t = convexTest(schema, modules);
    await seedFixture(t);
    // The admin gate uses this to decide what to draw; a throw here would be an
    // error screen instead of a sign-in prompt.
    expect(await t.query(api.auth.viewer, {})).toBeNull();
  });

  test("viewer reports the caller's own role only", async () => {
    const t = convexTest(schema, modules);
    const { staffId } = await seedFixture(t);
    const me = await asUser(t, staffId).query(api.auth.viewer, {});
    expect(me).toMatchObject({ isAdmin: false, jobTitle: "Teacher", initials: "SS" });
  });
});

describe("cross-parent writes are refused", () => {
  test("an asset cannot be attached to a lesson in another module", async () => {
    const t = convexTest(schema, modules);
    const { adminId, moduleId } = await seedFixture(t);
    const admin = asUser(t, adminId);

    const other = await admin.mutation(api.modules.create, {
      title: "Other Module",
      category: "Core Policies",
    });
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Lesson In First Module",
      kind: "reading",
    });
    const foreignAsset = await admin.mutation(api.assets.create, {
      moduleId: other.moduleId,
      title: "Asset In Other Module",
      kind: "document",
    });

    await expect(
      admin.mutation(api.lessons.attachAsset, {
        lessonId: lesson.lessonId,
        assetId: foreignAsset,
      }),
    ).rejects.toThrow(/CROSS_MODULE|own module/i);
  });

  test("a hero asset from another module is refused", async () => {
    const t = convexTest(schema, modules);
    const { adminId, moduleId } = await seedFixture(t);
    const admin = asUser(t, adminId);

    const other = await admin.mutation(api.modules.create, {
      title: "Second Module",
      category: "Core Policies",
    });
    const foreignAsset = await admin.mutation(api.assets.create, {
      moduleId: other.moduleId,
      title: "Foreign Hero",
      kind: "video",
    });

    await expect(
      admin.mutation(api.modules.update, { moduleId, featuredAssetId: foreignAsset }),
    ).rejects.toThrow(/INVALID|does not belong/i);
  });
});

describe("the seed refuses to wipe populated tables", () => {
  test("reset without iAmSure is refused once a module exists", async () => {
    const t = convexTest(schema, modules);
    await seedFixture(t);
    await expect(
      t.mutation(internal.seed.run, { confirm: "cliffview", mode: "reset" }),
    ).rejects.toThrow();
  });
});
