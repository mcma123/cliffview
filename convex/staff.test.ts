/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import resendComponent from "@convex-dev/resend/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Staff directory reads and writes.
 *
 * `users` is both the staff list and Convex Auth's user table, so a mutation
 * here can hand somebody a way into the school or take it away. Four things get
 * the most attention:
 *
 * - the four authz negatives on every entry point, because this is employee PII
 * - email uniqueness, since `users.email` is how a sign-in resolves to a person
 *   and a duplicate makes that ambiguous
 * - the two lockout guards: nobody edits their own role or deactivates
 *   themselves
 * - that a profile's compliance is never a number somebody typed
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

// `typeof newTest`, not `typeof convexTest`: the latter loses the schema
// generic, and with it every index name inside `t.run`.
let t: ReturnType<typeof newTest>;
let phaseId: Id<"phases">;
let otherPhaseId: Id<"phases">;
let adminId: Id<"users">;
let staffId: Id<"users">;
let inactiveAdminId: Id<"users">;
let moduleId: Id<"modules">;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const admin = () => asUser(adminId);

beforeEach(async () => {
  t = newTest();
  const ids = await t.run(async (ctx) => {
    const foundation = await ctx.db.insert("phases", {
      name: "Foundation Phase",
      order: 1,
      isActive: true,
    });
    const retired = await ctx.db.insert("phases", {
      name: "Retired Phase",
      order: 9,
      isActive: false,
    });
    const intersen = await ctx.db.insert("phases", {
      name: "Intersen Phase",
      order: 2,
      isActive: true,
    });

    const base = {
      phaseId: foundation,
      employmentStatus: "active" as const,
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
      jobTitle: "Teacher",
    };
    const admin = await ctx.db.insert("users", {
      ...base,
      firstName: "Ada",
      lastName: "Admin",
      email: "ada.admin@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });
    const staff = await ctx.db.insert("users", {
      ...base,
      firstName: "Sam",
      lastName: "Staff",
      email: "sam.staff@cliffview.example",
      accessRole: "staff",
    });
    const inactive = await ctx.db.insert("users", {
      ...base,
      employmentStatus: "inactive" as const,
      firstName: "Ivy",
      lastName: "Inactive",
      email: "ivy.inactive@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });

    const mod = await ctx.db.insert("modules", {
      slug: "staff-fixture",
      number: "01",
      sequence: 1,
      title: "Staff Fixture",
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

    return { foundation, intersen, retired, admin, staff, inactive, mod };
  });
  phaseId = ids.foundation;
  otherPhaseId = ids.intersen;
  adminId = ids.admin;
  staffId = ids.staff;
  inactiveAdminId = ids.inactive;
  moduleId = ids.mod;
});

const newProfile = {
  firstName: "Nomsa",
  lastName: "Khumalo",
  email: "nomsa.khumalo@cliffview.example",
  jobTitle: "Teacher",
  accessRole: "staff" as const,
};

describe("the directory is admin-only", () => {
  test("no identity is refused", async () => {
    await expect(t.query(api.staff.directory, {})).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("a staff identity is refused - this is employee PII", async () => {
    await expect(asUser(staffId).query(api.staff.directory, {})).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("an inactive admin is refused", async () => {
    await expect(asUser(inactiveAdminId).query(api.staff.directory, {})).rejects.toThrow(
      /FORBIDDEN|not active/i,
    );
  });

  test("a staff identity cannot read one profile either", async () => {
    await expect(asUser(staffId).query(api.staff.detail, { staffId: adminId })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });
});

describe("create", () => {
  test("no identity is refused", async () => {
    await expect(t.mutation(api.staff.create, { ...newProfile, phaseId })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused", async () => {
    await expect(
      asUser(staffId).mutation(api.staff.create, { ...newProfile, phaseId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    await expect(
      asUser(inactiveAdminId).mutation(api.staff.create, { ...newProfile, phaseId }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("an admin creates an active profile with no earned numbers", async () => {
    const id = await admin().mutation(api.staff.create, {
      ...newProfile,
      phaseId,
      honorific: "  Ms.  ",
    });
    const user = await t.run(async (ctx) => await ctx.db.get("users", id));
    expect(user).toMatchObject({
      firstName: "Nomsa",
      lastName: "Khumalo",
      email: "nomsa.khumalo@cliffview.example",
      accessRole: "staff",
      employmentStatus: "active",
      // Earned from enrollment rows, never assigned. A new person has none, so
      // zero is the true figure rather than a placeholder.
      compliancePercent: 0,
      cptdPoints: 0,
      xpTotal: 0,
    });
    // Whitespace is trimmed rather than stored, or the honorific renders with
    // a gap before the name.
    expect(user?.honorific).toBe("Ms.");
  });

  test("creating a profile does not create a login", async () => {
    const id = await admin().mutation(api.staff.create, { ...newProfile, phaseId });
    // Filtered in JS rather than through `userIdAndProvider`: inside `t.run`
    // the ctx types `authAccounts` without the indexes `authTables` declares.
    const accounts = await t.run(async (ctx) => await ctx.db.query("authAccounts").collect());
    // They set their own password at first sign-in. This is what stops an admin
    // from ever knowing another person's credentials.
    expect(accounts.filter((account) => account.userId === id)).toHaveLength(0);
  });

  test("a duplicate email is refused, case and whitespace insensitively", async () => {
    await expect(
      admin().mutation(api.staff.create, {
        ...newProfile,
        email: "  SAM.STAFF@Cliffview.Example ",
        phaseId,
      }),
    ).rejects.toThrow(/DUPLICATE_EMAIL|already used/i);
  });

  test("an address with no domain is refused", async () => {
    await expect(
      admin().mutation(api.staff.create, { ...newProfile, email: "nomsa", phaseId }),
    ).rejects.toThrow(/INVALID|valid email/i);
  });

  test("a blank name is refused", async () => {
    await expect(
      admin().mutation(api.staff.create, { ...newProfile, firstName: "   ", phaseId }),
    ).rejects.toThrow(/INVALID|first name/i);
  });

  test("super_admin cannot be assigned from the directory", async () => {
    // An operator login is minted only by internal.auth.provisionAdmin, which
    // is internal precisely so no client-reachable path can create one.
    await expect(
      admin().mutation(api.staff.create, {
        ...newProfile,
        accessRole: "super_admin",
        phaseId,
      }),
    ).rejects.toThrow(/FORBIDDEN|cannot be assigned/i);
  });

  test("a phase that does not exist is refused", async () => {
    const deadPhase = await t.run(async (ctx) => {
      const id = await ctx.db.insert("phases", { name: "Gone", order: 99, isActive: true });
      await ctx.db.delete("phases", id);
      return id;
    });
    await expect(
      admin().mutation(api.staff.create, { ...newProfile, phaseId: deadPhase }),
    ).rejects.toThrow(/INVALID|phase/i);
  });
});

describe("update", () => {
  test("a staff identity is refused", async () => {
    await expect(
      asUser(staffId).mutation(api.staff.update, { staffId: adminId, jobTitle: "Boss" }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an admin edits names, email, job title and phase", async () => {
    await admin().mutation(api.staff.update, {
      staffId,
      firstName: "Samuel",
      lastName: "Staffordshire",
      email: "Samuel.Staffordshire@Cliffview.Example",
      jobTitle: "Senior Teacher",
      phaseId: otherPhaseId,
    });
    const user = await t.run(async (ctx) => await ctx.db.get("users", staffId));
    expect(user).toMatchObject({
      firstName: "Samuel",
      lastName: "Staffordshire",
      // Lowercased, because that is how createOrUpdateUser looks a person up.
      email: "samuel.staffordshire@cliffview.example",
      jobTitle: "Senior Teacher",
      phaseId: otherPhaseId,
    });
  });

  test("an empty honorific clears it rather than storing a blank", async () => {
    const read = async () => (await t.run(async (ctx) => await ctx.db.get("users", staffId)))!;

    await admin().mutation(api.staff.update, { staffId, honorific: "Mr." });
    expect((await read()).honorific).toBe("Mr.");

    await admin().mutation(api.staff.update, { staffId, honorific: "" });
    // Asserted as nullish rather than strictly undefined: a cleared optional
    // field reads back as null under convex-test, and the guarantee that
    // matters is that no honorific is stored to be rendered - which is why
    // `formatStaffName` treats null and undefined alike.
    expect((await read()).honorific ?? null).toBeNull();
  });

  test("keeping your own email is not a duplicate", async () => {
    await expect(
      admin().mutation(api.staff.update, {
        staffId,
        email: "sam.staff@cliffview.example",
      }),
    ).resolves.toBeNull();
  });

  test("taking somebody else's email is refused", async () => {
    await expect(
      admin().mutation(api.staff.update, {
        staffId,
        email: "ada.admin@cliffview.example",
      }),
    ).rejects.toThrow(/DUPLICATE_EMAIL|already used/i);
  });

  test("an admin cannot change their own access role", async () => {
    // Otherwise an admin can demote themselves out of the console, and if they
    // were the last one the school loses its own admin surface.
    await expect(
      admin().mutation(api.staff.update, { staffId: adminId, accessRole: "staff" }),
    ).rejects.toThrow(/FORBIDDEN|your own access role/i);
  });

  test("an admin can change somebody else's role, but never to super_admin", async () => {
    await admin().mutation(api.staff.update, { staffId, accessRole: "smt_admin" });
    expect(await t.run(async (ctx) => (await ctx.db.get("users", staffId))!.accessRole)).toBe(
      "smt_admin",
    );

    await expect(
      admin().mutation(api.staff.update, { staffId, accessRole: "super_admin" }),
    ).rejects.toThrow(/FORBIDDEN|cannot be assigned/i);
  });

  test("saving recomputes compliance from the enrollment rows", async () => {
    // The mean of progressPercent, which is exactly the formula convex/seed.ts
    // used. If they disagreed, the first edit of any seeded profile would
    // silently rewrite a number that was already correct.
    await t.run(async (ctx) => {
      await ctx.db.patch("users", staffId, { compliancePercent: 99 });
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId,
        status: "in_progress",
        progressPercent: 40,
        assignedAt: Date.now(),
      });
    });

    await admin().mutation(api.staff.update, { staffId, jobTitle: "Teacher" });

    expect(
      await t.run(async (ctx) => (await ctx.db.get("users", staffId))!.compliancePercent),
    ).toBe(40);
  });

  test("somebody with no enrollments recomputes to zero, not to a stale figure", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("users", staffId, { compliancePercent: 77 });
    });
    await admin().mutation(api.staff.update, { staffId, jobTitle: "Teacher" });
    expect(
      await t.run(async (ctx) => (await ctx.db.get("users", staffId))!.compliancePercent),
    ).toBe(0);
  });
});

describe("deactivation is the delete", () => {
  test("a staff identity is refused", async () => {
    await expect(
      asUser(staffId).mutation(api.staff.setEmploymentStatus, {
        staffId: adminId,
        employmentStatus: "inactive",
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("deactivating keeps the row and its history", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId,
        status: "completed",
        progressPercent: 100,
        assignedAt: Date.now(),
      });
    });

    await admin().mutation(api.staff.setEmploymentStatus, {
      staffId,
      employmentStatus: "inactive",
    });

    const user = await t.run(async (ctx) => await ctx.db.get("users", staffId));
    // The person is still there. Enrollments, progress and the audit log all
    // reference this row, and a live Convex Auth account is bound to it.
    expect(user).not.toBeNull();
    expect(user?.employmentStatus).toBe("inactive");
    const enrollments = await t.run(async (ctx) => await ctx.db.query("enrollments").collect());
    expect(enrollments).toHaveLength(1);
  });

  test("an admin cannot deactivate themselves", async () => {
    await expect(
      admin().mutation(api.staff.setEmploymentStatus, {
        staffId: adminId,
        employmentStatus: "inactive",
      }),
    ).rejects.toThrow(/FORBIDDEN|your own account/i);
  });

  test("reinstating restores access", async () => {
    await admin().mutation(api.staff.setEmploymentStatus, {
      staffId: inactiveAdminId,
      employmentStatus: "active",
    });
    expect(
      await t.run(async (ctx) => (await ctx.db.get("users", inactiveAdminId))!.employmentStatus),
    ).toBe("active");
  });
});

describe("operator accounts are not staff", () => {
  test("the directory omits them and the summary does not count them", async () => {
    const before = await admin().query(api.staff.directory, {});
    expect(before.staff).toHaveLength(3);

    await t.mutation(internal.auth.provisionAdmin, { email: "admin@cliffview.example" });

    const after = await admin().query(api.staff.directory, {});
    // Still three. An operator login belongs to nobody and would show up as a
    // person the school has never employed.
    expect(after.staff).toHaveLength(3);
    expect(after.staff.map((row) => row.user.email)).not.toContain("admin@cliffview.example");
  });

  test("they cannot be opened or edited through the directory", async () => {
    const { userId } = await t.mutation(internal.auth.provisionAdmin, {
      email: "admin@cliffview.example",
    });

    await expect(admin().query(api.staff.detail, { staffId: userId })).rejects.toThrow(
      /FORBIDDEN|not listed/i,
    );
    await expect(
      admin().mutation(api.staff.update, { staffId: userId, jobTitle: "Nice try" }),
    ).rejects.toThrow(/FORBIDDEN|not editable/i);
    await expect(
      admin().mutation(api.staff.setEmploymentStatus, {
        staffId: userId,
        employmentStatus: "inactive",
      }),
    ).rejects.toThrow(/FORBIDDEN|not editable/i);
  });
});

describe("the directory read", () => {
  test("includes inactive staff, so they can be found and reinstated", async () => {
    const result = await admin().query(api.staff.directory, {});
    expect(result.staff.map((row) => row.user.email)).toContain("ivy.inactive@cliffview.example");
  });

  test("offers only active phases for the selector", async () => {
    const result = await admin().query(api.staff.directory, {});
    const names = result.phases.map((phase) => phase.name);
    expect(names).toContain("Foundation Phase");
    expect(names).not.toContain("Retired Phase");
  });

  test("reports real enrollment counts per person", async () => {
    await t.run(async (ctx) => {
      const second = await ctx.db.insert("modules", {
        slug: "second",
        number: "02",
        sequence: 2,
        title: "Second",
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
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId,
        status: "completed",
        progressPercent: 100,
        assignedAt: Date.now(),
      });
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId: second,
        status: "in_progress",
        progressPercent: 50,
        assignedAt: Date.now(),
      });
    });

    const result = await admin().query(api.staff.directory, {});
    const sam = result.staff.find((row) => row.user.email === "sam.staff@cliffview.example");
    expect(sam).toMatchObject({ assignedModules: 2, completedModules: 1 });
  });

  test("detail joins the enrollments to their modules", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId,
        status: "in_progress",
        progressPercent: 30,
        assignedAt: Date.now(),
        score: 65,
      });
    });

    const result = await admin().query(api.staff.detail, { staffId });
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].module.title).toBe("Staff Fixture");
    expect(result.modules[0].enrollment.score).toBe(65);
    expect(result.phaseName).toBe("Foundation Phase");
  });
});

describe("assigning modules", () => {
  /** A published module, since only published content can be assigned. */
  async function publishedModule(slug: string, sequence: number) {
    return await t.run(
      async (ctx) =>
        await ctx.db.insert("modules", {
          slug,
          number: `0${sequence}`,
          sequence,
          title: `Module ${slug}`,
          description: "d",
          audience: "a",
          outcome: "o",
          category: "Core Policies" as const,
          durationMinutes: 10,
          cptdPoints: 1,
          passMark: 80,
          format: "Self-paced",
          publishState: "published" as const,
          contentUpdatedAt: Date.now(),
        }),
    );
  }

  const enrollmentsOf = async (userId: Id<"users">) =>
    await t.run(
      async (ctx) =>
        await ctx.db
          .query("enrollments")
          .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
          .collect(),
    );

  test("no identity is refused", async () => {
    const published = await publishedModule("assign-a", 2);
    await expect(
      t.mutation(api.staff.assignModules, { staffId, moduleIds: [published] }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("a staff identity is refused - assigning work is an admin act", async () => {
    const published = await publishedModule("assign-a", 2);
    await expect(
      asUser(staffId).mutation(api.staff.assignModules, { staffId, moduleIds: [published] }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    const published = await publishedModule("assign-a", 2);
    await expect(
      asUser(inactiveAdminId).mutation(api.staff.assignModules, {
        staffId,
        moduleIds: [published],
      }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("an admin assigns modules, and they start at nothing earned", async () => {
    const first = await publishedModule("assign-a", 2);
    const second = await publishedModule("assign-b", 3);

    const result = await admin().mutation(api.staff.assignModules, {
      staffId,
      moduleIds: [first, second],
    });
    expect(result).toEqual({ assigned: 2, alreadyAssigned: 0 });

    const rows = await enrollmentsOf(staffId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("not_started");
      expect(row.progressPercent).toBe(0);
      expect(row.score).toBeUndefined();
      expect(row.assignedAt).toBeGreaterThan(0);
    }
  });

  test("re-assigning is a no-op, not a second row", async () => {
    const first = await publishedModule("assign-a", 2);
    await admin().mutation(api.staff.assignModules, { staffId, moduleIds: [first] });

    const again = await admin().mutation(api.staff.assignModules, {
      staffId,
      moduleIds: [first],
    });
    expect(again).toEqual({ assigned: 0, alreadyAssigned: 1 });
    expect(await enrollmentsOf(staffId)).toHaveLength(1);
  });

  test("a module repeated within one call is written once", async () => {
    const first = await publishedModule("assign-a", 2);
    const result = await admin().mutation(api.staff.assignModules, {
      staffId,
      moduleIds: [first, first, first],
    });
    expect(result).toEqual({ assigned: 1, alreadyAssigned: 0 });
    expect(await enrollmentsOf(staffId)).toHaveLength(1);
  });

  test("a draft module cannot be assigned - it is unfinished content", async () => {
    await expect(
      admin().mutation(api.staff.assignModules, { staffId, moduleIds: [moduleId] }),
    ).rejects.toThrow(/NOT_PUBLISHED|not published/i);
    expect(await enrollmentsOf(staffId)).toHaveLength(0);
  });

  test("one draft in the batch assigns nothing at all", async () => {
    const published = await publishedModule("assign-a", 2);
    await expect(
      admin().mutation(api.staff.assignModules, { staffId, moduleIds: [published, moduleId] }),
    ).rejects.toThrow(/NOT_PUBLISHED|not published/i);
    // The mutation is a transaction, so the published one rolls back with it.
    expect(await enrollmentsOf(staffId)).toHaveLength(0);
  });

  test("an empty selection is refused", async () => {
    await expect(
      admin().mutation(api.staff.assignModules, { staffId, moduleIds: [] }),
    ).rejects.toThrow(/INVALID|at least one/i);
  });

  test("an operator account cannot be assigned modules", async () => {
    const published = await publishedModule("assign-a", 2);
    const { userId } = await t.mutation(internal.auth.provisionAdmin, {
      email: "admin@cliffview.example",
    });
    await expect(
      admin().mutation(api.staff.assignModules, { staffId: userId, moduleIds: [published] }),
    ).rejects.toThrow(/FORBIDDEN|not editable/i);
  });

  test("compliance is recomputed, so new work lowers it", async () => {
    const done = await publishedModule("assign-a", 2);
    await t.run(async (ctx) => {
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId: done,
        status: "completed",
        progressPercent: 100,
        assignedAt: Date.now(),
      });
      await ctx.db.patch("users", staffId, { compliancePercent: 100 });
    });

    const extra = await publishedModule("assign-b", 3);
    await admin().mutation(api.staff.assignModules, { staffId, moduleIds: [extra] });

    // One at 100, one at 0. A person who has finished one of two is not 100%.
    expect(
      await t.run(async (ctx) => (await ctx.db.get("users", staffId))!.compliancePercent),
    ).toBe(50);
  });

  test("a due date is stored when one is given", async () => {
    const published = await publishedModule("assign-a", 2);
    const dueAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await admin().mutation(api.staff.assignModules, {
      staffId,
      moduleIds: [published],
      dueAt,
    });
    expect((await enrollmentsOf(staffId))[0].dueAt).toBe(dueAt);
  });

  test("the detail read offers the catalogue, minus archived content", async () => {
    await publishedModule("assign-a", 2);
    await t.run(async (ctx) => {
      await ctx.db.insert("modules", {
        slug: "retired",
        number: "09",
        sequence: 9,
        title: "Retired",
        description: "d",
        audience: "a",
        outcome: "o",
        category: "Core Policies" as const,
        durationMinutes: 10,
        cptdPoints: 1,
        passMark: 80,
        format: "Self-paced",
        publishState: "archived" as const,
        contentUpdatedAt: Date.now(),
      });
    });

    const result = await admin().query(api.staff.detail, { staffId });
    const slugs = result.catalog.map((row) => row.slug);
    expect(slugs).toContain("assign-a");
    // Drafts stay listed; the picker disables them and says why.
    expect(slugs).toContain("staff-fixture");
    expect(slugs).not.toContain("retired");
  });
});

describe("unassigning a module", () => {
  let assignedModuleId: Id<"modules">;

  beforeEach(async () => {
    assignedModuleId = await t.run(
      async (ctx) =>
        await ctx.db.insert("modules", {
          slug: "unassign-me",
          number: "02",
          sequence: 2,
          title: "Unassign Me",
          description: "d",
          audience: "a",
          outcome: "o",
          category: "Core Policies" as const,
          durationMinutes: 10,
          cptdPoints: 1,
          passMark: 80,
          format: "Self-paced",
          publishState: "published" as const,
          contentUpdatedAt: Date.now(),
        }),
    );
    await admin().mutation(api.staff.assignModules, {
      staffId,
      moduleIds: [assignedModuleId],
    });
  });

  const remaining = async () =>
    await t.run(
      async (ctx) =>
        await ctx.db
          .query("enrollments")
          .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", staffId))
          .collect(),
    );

  test("a staff identity is refused", async () => {
    await expect(
      asUser(staffId).mutation(api.staff.unassignModule, {
        staffId,
        moduleId: assignedModuleId,
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an untouched assignment can be taken back", async () => {
    await admin().mutation(api.staff.unassignModule, { staffId, moduleId: assignedModuleId });
    expect(await remaining()).toHaveLength(0);
  });

  test("one that was never assigned reports so", async () => {
    await expect(admin().mutation(api.staff.unassignModule, { staffId, moduleId })).rejects.toThrow(
      /NOT_FOUND|not assigned/i,
    );
  });

  test("a started module is training record, and stays", async () => {
    await t.run(async (ctx) => {
      const row = (await ctx.db
        .query("enrollments")
        .withIndex("by_userId_and_moduleId", (q) =>
          q.eq("userId", staffId).eq("moduleId", assignedModuleId),
        )
        .unique())!;
      await ctx.db.patch("enrollments", row._id, {
        status: "in_progress",
        progressPercent: 40,
        startedAt: Date.now(),
      });
    });

    await expect(
      admin().mutation(api.staff.unassignModule, { staffId, moduleId: assignedModuleId }),
    ).rejects.toThrow(/IN_PROGRESS|already started/i);
    expect(await remaining()).toHaveLength(1);
  });

  test("lesson progress counts as started, even with the enrollment untouched", async () => {
    await t.run(async (ctx) => {
      const lessonId = await ctx.db.insert("lessons", {
        moduleId: assignedModuleId,
        slug: "intro",
        title: "Intro",
        kind: "reading" as const,
        order: 1,
        durationMinutes: 5,
        summary: "s",
        publishState: "published" as const,
        contentUpdatedAt: Date.now(),
      });
      await ctx.db.insert("lessonProgress", {
        userId: staffId,
        lessonId,
        moduleId: assignedModuleId,
        status: "in_progress" as const,
        lastViewedAt: Date.now(),
      });
    });

    await expect(
      admin().mutation(api.staff.unassignModule, { staffId, moduleId: assignedModuleId }),
    ).rejects.toThrow(/IN_PROGRESS|already started/i);
    expect(await remaining()).toHaveLength(1);
  });
});
