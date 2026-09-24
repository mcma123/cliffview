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

/**
 * `convexTest` plus the R2 component.
 *
 * Phase 6 added `convex/convex.config.ts` and `app.use(r2)`, so the app now has
 * a component. Without registering it here every test that reaches storage —
 * and any mutation that cascades into a blob delete — fails on a missing
 * component rather than on the thing under test.
 */
function newTest() {
  const t = convexTest(schema, modules);
  r2Component.register(t);
  // R2 uses action-retrier internally, so at runtime the nested component is
  // addressed as "r2/actionRetrier". `r2Component.register` registers it under
  // the bare name "actionRetrier", which the runtime never looks up, so a
  // mutation that deletes a blob fails on an unregistered component. Register
  // it again under the path that is actually used.
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
    const t = newTest();
    await seedFixture(t);
    await expect(
      t.mutation(api.modules.create, { title: "Sneaky", category: "Core Policies" }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("a staff identity is refused", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    await expect(
      asUser(t, staffId).mutation(api.modules.create, {
        title: "Not allowed",
        category: "Core Policies",
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    const t = newTest();
    const { inactiveAdminId } = await seedFixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.modules.create, {
        title: "Departed",
        category: "Core Policies",
      }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("a live session whose profile was deleted is refused", async () => {
    const t = newTest();
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
    const t = newTest();
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
    const t = newTest();
    await seedFixture(t);
    await expect(t.query(api.modules.listForAdmin, {})).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("the overview refuses a staff caller", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    await expect(
      asUser(t, staffId).query(api.dashboard.adminOverview, { now: Date.now() }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("viewer returns null when unauthenticated rather than throwing", async () => {
    const t = newTest();
    await seedFixture(t);
    // The admin gate uses this to decide what to draw; a throw here would be an
    // error screen instead of a sign-in prompt.
    expect(await t.query(api.auth.viewer, {})).toBeNull();
  });

  test("viewer reports the caller's own role only", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    const me = await asUser(t, staffId).query(api.auth.viewer, {});
    expect(me).toMatchObject({ isAdmin: false, jobTitle: "Teacher", initials: "SS" });
  });
});

describe("cross-parent writes are refused", () => {
  test("an asset cannot be attached to a lesson in another module", async () => {
    const t = newTest();
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
    const t = newTest();
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

describe("requireAdmin on the lesson material mutations", () => {
  /** A lesson with one attachment, created as the admin. */
  async function fixture(t: ReturnType<typeof convexTest>) {
    const ids = await seedFixture(t);
    const admin = asUser(t, ids.adminId);
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId: ids.moduleId,
      title: "Lesson",
      kind: "reading",
    });
    const assetId = await admin.mutation(api.lessons.addMaterial, {
      lessonId: lesson.lessonId,
      key: "seed-key",
      fileName: "notes.pdf",
      title: "Notes",
      kind: "document",
    });
    return { ...ids, lessonId: lesson.lessonId, assetId };
  }

  const material = (lessonId: Id<"lessons">) => ({
    lessonId,
    key: "intruder-key",
    fileName: "x.pdf",
    title: "X",
    kind: "document" as const,
  });

  test("addMaterial: no identity is refused", async () => {
    const t = newTest();
    const { lessonId } = await fixture(t);
    await expect(t.mutation(api.lessons.addMaterial, material(lessonId))).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("addMaterial: a staff identity is refused", async () => {
    const t = newTest();
    const { lessonId, staffId } = await fixture(t);
    // Uploading teaching material is an authoring act, not a learning one.
    await expect(
      asUser(t, staffId).mutation(api.lessons.addMaterial, material(lessonId)),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("addMaterial: an inactive admin is refused", async () => {
    const t = newTest();
    const { lessonId, inactiveAdminId } = await fixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.lessons.addMaterial, material(lessonId)),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("addMaterial: a lesson that no longer exists is refused", async () => {
    const t = newTest();
    const { lessonId, adminId } = await fixture(t);
    await t.run(async (ctx) => {
      await ctx.db.delete("lessons", lessonId);
    });
    await expect(
      asUser(t, adminId).mutation(api.lessons.addMaterial, material(lessonId)),
    ).rejects.toThrow(/NOT_FOUND|no longer exists/i);
  });

  test("reorderAssets: no identity is refused", async () => {
    const t = newTest();
    const { lessonId, assetId } = await fixture(t);
    await expect(
      t.mutation(api.lessons.reorderAssets, { lessonId, assetIds: [assetId] }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("reorderAssets: a staff identity is refused", async () => {
    const t = newTest();
    const { lessonId, assetId, staffId } = await fixture(t);
    await expect(
      asUser(t, staffId).mutation(api.lessons.reorderAssets, { lessonId, assetIds: [assetId] }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("reorderAssets: an inactive admin is refused", async () => {
    const t = newTest();
    const { lessonId, assetId, inactiveAdminId } = await fixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.lessons.reorderAssets, {
        lessonId,
        assetIds: [assetId],
      }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("reorderAssets: an asset from another lesson is refused", async () => {
    const t = newTest();
    const { lessonId, adminId, moduleId } = await fixture(t);
    const admin = asUser(t, adminId);
    const other = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Other Lesson",
      kind: "reading",
    });
    const foreign = await admin.mutation(api.lessons.addMaterial, {
      lessonId: other.lessonId,
      key: "other-key",
      fileName: "other.pdf",
      title: "Other",
      kind: "document",
    });

    // The cross-parent write for this mutation: renumbering a join row that
    // belongs to a different lesson.
    await expect(
      admin.mutation(api.lessons.reorderAssets, { lessonId, assetIds: [foreign] }),
    ).rejects.toThrow();
  });
});

/**
 * `assignAllStep` has no test here on purpose. It is an `internalMutation`, so
 * the runtime keeps it off the public API — but `convex-test` resolves
 * functions by path regardless of internal-ness, so a test asserting it is
 * unreachable would pass whether or not that were true. The gate that IS
 * testable is the one on the mutation that schedules it, below.
 */
describe("requireAdmin on the school-wide assignment", () => {
  test("no identity is refused", async () => {
    const t = newTest();
    await seedFixture(t);
    await expect(t.mutation(api.staff.assignAllModules, {})).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    // Assigning the whole school's training is an administrative act, and this
    // mutation takes no arguments — the only thing standing between a signed-in
    // teacher and rewriting every tracker is the gate.
    await expect(asUser(t, staffId).mutation(api.staff.assignAllModules, {})).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("an inactive admin is refused", async () => {
    const t = newTest();
    const { inactiveAdminId } = await seedFixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.staff.assignAllModules, {}),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });
});

describe("requireAdmin on the staff import", () => {
  const rows = [
    {
      line: 2,
      honorific: "",
      firstName: "Nomsa",
      lastName: "Khumalo",
      preferredName: "",
      email: "nomsa@cliffview.example",
      jobTitle: "Teacher",
      accessRole: "staff",
      phase: "Foundation Phase",
    },
  ];

  test("importStaff: no identity is refused", async () => {
    const t = newTest();
    await seedFixture(t);
    await expect(t.mutation(api.staff.importStaff, { rows })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("importStaff: a staff identity is refused", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    // A file of staff rows is a way to mint accounts. Nothing but an admin
    // gets near it.
    await expect(asUser(t, staffId).mutation(api.staff.importStaff, { rows })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("importStaff: an inactive admin is refused", async () => {
    const t = newTest();
    const { inactiveAdminId } = await seedFixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.staff.importStaff, { rows }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("importPreview: a staff identity is refused", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    // The preview reads whether an address is already on the system, which is
    // a staff-directory fact, so it is gated exactly like the import.
    await expect(asUser(t, staffId).query(api.staff.importPreview, { rows })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("importPreview: no identity is refused", async () => {
    const t = newTest();
    await seedFixture(t);
    await expect(t.query(api.staff.importPreview, { rows })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });
});

describe("the seed refuses to wipe populated tables", () => {
  test("reset without iAmSure is refused once a module exists", async () => {
    const t = newTest();
    await seedFixture(t);
    await expect(
      t.mutation(internal.seed.run, { confirm: "cliffview", mode: "reset" }),
    ).rejects.toThrow();
  });
});
