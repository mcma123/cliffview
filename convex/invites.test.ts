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
import { hashInviteToken } from "./lib/invites";
import schema from "./schema";

/**
 * Invitations, and the sign-in rule they enforce.
 *
 * The single most important test in this file is "an uninvited sign-up is
 * refused". Before invitations existed, a `staff` row had no claim window and
 * no token, so whoever first submitted `flow: "signUp"` for a guessable school
 * address became that teacher. Everything else here is detail; that one is the
 * behaviour the feature exists for, and it is why the admin claim window is
 * also re-tested — closing one hole must not open another.
 *
 * Nothing in this file drains the scheduler. `sendEmail` only enqueues, so
 * delivery is a workpool action that never runs; calling
 * `finishInProgressScheduledFunctions` here would attempt a real send.
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
let adminId: Id<"users">;
let teacherId: Id<"users">;
let otherTeacherId: Id<"users">;
let inactiveAdminId: Id<"users">;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const admin = () => asUser(adminId);

const TEACHER_EMAIL = "nomsa.khumalo@cliffview.test";
const GOOD_PASSWORD = "correct horse battery";

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
    return {
      phase,
      admin: await ctx.db.insert("users", {
        ...base,
        firstName: "Ada",
        lastName: "Admin",
        email: "ada.admin@cliffview.test",
        accessRole: "smt_admin" as const,
      }),
      teacher: await ctx.db.insert("users", {
        ...base,
        firstName: "Nomsa",
        lastName: "Khumalo",
        email: TEACHER_EMAIL,
        accessRole: "staff" as const,
      }),
      other: await ctx.db.insert("users", {
        ...base,
        firstName: "Sam",
        lastName: "Staff",
        email: "sam.staff@cliffview.test",
        accessRole: "staff" as const,
      }),
      inactive: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "inactive" as const,
        firstName: "Ivy",
        lastName: "Inactive",
        email: "ivy.inactive@cliffview.test",
        accessRole: "smt_admin" as const,
      }),
    };
  });
  phaseId = ids.phase;
  adminId = ids.admin;
  teacherId = ids.teacher;
  otherTeacherId = ids.other;
  inactiveAdminId = ids.inactive;
});

/** Issue an invitation directly, returning the raw token the email would carry. */
async function issueInvite(userId: Id<"users">, email: string): Promise<string> {
  const token = `token-${Math.random().toString(36).slice(2)}-${userId}`;
  await t.mutation(internal.invites.issue, {
    userId,
    invitedBy: adminId,
    tokenHash: await hashInviteToken(token),
    email,
  });
  return token;
}

const passwordAccounts = async (userId: Id<"users">) =>
  await t.run(async (ctx) => {
    const all = await ctx.db.query("authAccounts").collect();
    return all.filter((a) => a.userId === userId && a.provider === "password");
  });

const signUp = (email: string, password: string) =>
  t.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });

// ---------------------------------------------------------------------------

describe("an invitation is required to set a first password", () => {
  test("THE HOLE IS CLOSED: an uninvited sign-up is refused, and creates nothing", async () => {
    await expect(signUp(TEACHER_EMAIL, GOOD_PASSWORD)).rejects.toThrow(
      /INVITE_REQUIRED|invitation email/i,
    );
    expect(await passwordAccounts(teacherId)).toHaveLength(0);
  });

  test("an unknown email is still refused, ahead of the invitation check", async () => {
    await expect(signUp("stranger@elsewhere.test", GOOD_PASSWORD)).rejects.toThrow(
      /NOT_PROVISIONED|not registered/i,
    );
  });

  test("a valid invitation lets exactly one account be created", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);

    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });

    expect(await passwordAccounts(teacherId)).toHaveLength(1);
    const invite = await t.run(async (ctx) => (await ctx.db.query("staffInvites").collect())[0]);
    expect(invite.consumedAt).toBeGreaterThan(0);
  });

  test("redeeming does not sign anybody in - there is no session to leak", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    const sessions = await t.run(async (ctx) => await ctx.db.query("authSessions").collect());
    expect(sessions).toHaveLength(0);
  });

  test("the admin claim window still works, untouched", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("users", adminId, { adminClaimAllowedUntil: Date.now() + 60_000 });
    });
    await signUp("ada.admin@cliffview.test", GOOD_PASSWORD);

    expect(await passwordAccounts(adminId)).toHaveLength(1);
    // Single-use: the window closes behind them.
    const after = await t.run(async (ctx) => await ctx.db.get("users", adminId));
    expect(after!.adminClaimAllowedUntil).toBeUndefined();
  });

  test("an admin with no open window is still refused", async () => {
    await expect(signUp("ada.admin@cliffview.test", GOOD_PASSWORD)).rejects.toThrow(
      /ADMIN_CLAIM_CLOSED|provisioned by an operator/i,
    );
  });
});

describe("email case and whitespace never lock somebody out", () => {
  /**
   * The bug this pins: `invites.accept` stores the account under the
   * normalised address from `users`, but Convex Auth uses the RAW submitted
   * string as `providerAccountId`. A phone keyboard capitalising the first
   * letter therefore produced `InvalidAccountId` — an opaque server error, on
   * a correct password, with no way for the person to work out why.
   */
  const signInAs = (email: string, password: string) =>
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email, password, flow: "signIn" },
    });

  test("the account is stored under the normalised address", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    const accounts = await passwordAccounts(teacherId);
    expect(accounts[0].providerAccountId).toBe(TEACHER_EMAIL);
  });

  test.each([
    ["as typed", TEACHER_EMAIL],
    ["first letter capitalised, as a phone keyboard does", "Nomsa.khumalo@cliffview.test"],
    ["shouting", TEACHER_EMAIL.toUpperCase()],
    ["with padding from a copy-paste", `  ${TEACHER_EMAIL}  `],
  ])("signs in %s", async (_label, typed) => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    await expect(signInAs(typed, GOOD_PASSWORD)).resolves.toBeDefined();
  });

  test("a wrong password is still refused, whatever the casing", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    await expect(signInAs(TEACHER_EMAIL.toUpperCase(), "not the password")).rejects.toThrow();
  });

  test("a personal address works exactly like a school one", async () => {
    // The reported symptom blamed the gmail address. There is no domain rule
    // anywhere in sign-in, and this pins that there never quietly becomes one.
    await t.run(async (ctx) => {
      await ctx.db.patch("users", teacherId, { email: "someone.personal@gmail.com" });
    });
    const token = await issueInvite(teacherId, "someone.personal@gmail.com");
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    await expect(signInAs("Someone.Personal@Gmail.com", GOOD_PASSWORD)).resolves.toBeDefined();
  });
});

describe("a token that should not work, does not", () => {
  test("a tampered token is refused", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await expect(
      t.action(api.invites.accept, {
        token: `${token}x`,
        password: GOOD_PASSWORD,
        confirmPassword: GOOD_PASSWORD,
      }),
    ).rejects.toThrow(/INVITE_INVALID|not valid/i);
    expect(await passwordAccounts(teacherId)).toHaveLength(0);
  });

  test("an expired token is refused", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("staffInvites").collect())[0];
      await ctx.db.patch("staffInvites", row._id, { expiresAt: Date.now() - 1 });
    });
    await expect(
      t.action(api.invites.accept, {
        token,
        password: GOOD_PASSWORD,
        confirmPassword: GOOD_PASSWORD,
      }),
    ).rejects.toThrow(/INVITE_EXPIRED|expired/i);
    expect(await passwordAccounts(teacherId)).toHaveLength(0);
  });

  test("a token cannot be used twice", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    await expect(
      t.action(api.invites.accept, {
        token,
        password: "a different password",
        confirmPassword: "a different password",
      }),
    ).rejects.toThrow(/INVITE_USED|already been used/i);
    // Still one account, and the original password still stands.
    expect(await passwordAccounts(teacherId)).toHaveLength(1);
  });

  test("re-inviting revokes the previous link", async () => {
    const first = await issueInvite(teacherId, TEACHER_EMAIL);
    const second = await issueInvite(teacherId, TEACHER_EMAIL);

    await expect(
      t.action(api.invites.accept, {
        token: first,
        password: GOOD_PASSWORD,
        confirmPassword: GOOD_PASSWORD,
      }),
    ).rejects.toThrow(/INVITE_REVOKED|newer invitation/i);

    await t.action(api.invites.accept, {
      token: second,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    expect(await passwordAccounts(teacherId)).toHaveLength(1);
  });

  test("correcting the email address invalidates the link already sent", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.run(async (ctx) => {
      await ctx.db.patch("users", teacherId, { email: "nomsa.k@cliffview.test" });
    });
    await expect(
      t.action(api.invites.accept, {
        token,
        password: GOOD_PASSWORD,
        confirmPassword: GOOD_PASSWORD,
      }),
    ).rejects.toThrow(/INVITE_EMAIL_CHANGED|different address/i);
  });

  test("an invitation cannot be redeemed for a different person", async () => {
    // A token whose row points at someone else than the email resolves to.
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("staffInvites").collect())[0];
      await ctx.db.patch("staffInvites", row._id, { userId: otherTeacherId });
    });
    await expect(
      t.action(api.invites.accept, {
        token,
        password: GOOD_PASSWORD,
        confirmPassword: GOOD_PASSWORD,
      }),
    ).rejects.toThrow(/INVITE_EMAIL_CHANGED|INVITE_INVALID|different address|not valid/i);
    expect(await passwordAccounts(teacherId)).toHaveLength(0);
    expect(await passwordAccounts(otherTeacherId)).toHaveLength(0);
  });

  test("an inactive profile cannot redeem, even with a good token", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.run(async (ctx) => {
      await ctx.db.patch("users", teacherId, { employmentStatus: "inactive" });
    });
    await expect(
      t.action(api.invites.accept, {
        token,
        password: GOOD_PASSWORD,
        confirmPassword: GOOD_PASSWORD,
      }),
    ).rejects.toThrow(/INACTIVE|no longer active/i);
  });
});

describe("the password the invitee chooses", () => {
  test("a mismatch is refused, and does not spend the invitation", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await expect(
      t.action(api.invites.accept, {
        token,
        password: GOOD_PASSWORD,
        confirmPassword: "something else",
      }),
    ).rejects.toThrow(/PASSWORD_MISMATCH|do not match/i);

    const invite = await t.run(async (ctx) => (await ctx.db.query("staffInvites").collect())[0]);
    expect(invite.consumedAt).toBeUndefined();
  });

  test("a short password is refused - createAccount skips the provider check", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await expect(
      t.action(api.invites.accept, { token, password: "short", confirmPassword: "short" }),
    ).rejects.toThrow(/WEAK_PASSWORD|at least 8/i);
    expect(await passwordAccounts(teacherId)).toHaveLength(0);
  });
});

describe("preview tells the invite page what to draw", () => {
  test("a valid token reports the invitee", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    const result = await t.action(api.invites.preview, { token });
    expect(result.state).toBe("valid");
    expect(result.email).toBe(TEACHER_EMAIL);
    expect(result.firstName).toBe("Nomsa");
  });

  test("an unknown token reveals nothing about anybody", async () => {
    const result = await t.action(api.invites.preview, { token: "not-a-real-token" });
    expect(result).toMatchObject({ state: "unknown", email: null, firstName: null });
  });

  test("a spent token reports used, without naming the person", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    const result = await t.action(api.invites.preview, { token });
    expect(result.state).toBe("used");
    expect(result.email).toBeNull();
  });
});

describe("resending is admin-only", () => {
  test("no identity is refused", async () => {
    await expect(t.action(api.invites.resend, { staffId: teacherId })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused", async () => {
    await expect(
      asUser(teacherId).action(api.invites.resend, { staffId: otherTeacherId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    await expect(
      asUser(inactiveAdminId).action(api.invites.resend, { staffId: teacherId }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("an admin cannot invite an operator or another admin by email", async () => {
    const { userId } = await t.mutation(internal.auth.provisionAdmin, {
      email: "operator@cliffview.test",
    });
    await expect(admin().action(api.invites.resend, { staffId: userId })).rejects.toThrow(
      /NOT_INVITABLE|not invited by email/i,
    );
    await expect(admin().action(api.invites.resend, { staffId: adminId })).rejects.toThrow(
      /NOT_INVITABLE|provisioned by an operator/i,
    );
  });

  test("an admin resending issues a fresh, live invitation", async () => {
    const result = await admin().action(api.invites.resend, { staffId: teacherId });
    expect(result.email).toBe(TEACHER_EMAIL);

    const rows = await t.run(async (ctx) => await ctx.db.query("staffInvites").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].consumedAt).toBeUndefined();
    expect(rows[0].expiresAt).toBeGreaterThan(Date.now());
  });

  test("somebody who already has a password cannot be re-invited", async () => {
    const token = await issueInvite(teacherId, TEACHER_EMAIL);
    await t.action(api.invites.accept, {
      token,
      password: GOOD_PASSWORD,
      confirmPassword: GOOD_PASSWORD,
    });
    await expect(admin().action(api.invites.resend, { staffId: teacherId })).rejects.toThrow(
      /NOT_INVITABLE|already set a password/i,
    );
  });
});

describe("creating a teacher invites them", () => {
  test("create schedules a delivery and still creates no credential", async () => {
    const staffId = await admin().mutation(api.staff.create, {
      firstName: "Thandi",
      lastName: "Mbeki",
      email: "thandi.mbeki@cliffview.test",
      jobTitle: "Teacher",
      accessRole: "staff",
      phaseId,
    });

    // An invitation is not a login: they still have no way in until they
    // redeem it.
    expect(await passwordAccounts(staffId)).toHaveLength(0);

    // Delivery is scheduled rather than inlined, so the proof is a queued job.
    // The scheduler is deliberately never drained - that would try to send.
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.some((job) => job.name.includes("invites"))).toBe(true);
  });

  test("creating an admin does not email them - operators provision those", async () => {
    await admin().mutation(api.staff.create, {
      firstName: "Hendrik",
      lastName: "van Wyk",
      email: "hendrik.vanwyk@cliffview.test",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
      phaseId,
    });
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.filter((job) => job.name.includes("invites"))).toHaveLength(0);
  });
});
