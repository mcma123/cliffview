import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { STEP_ROW_BUDGET } from "./deletion";

/**
 * Permanently removing a member of staff and everything that names them.
 *
 * The module cascade in `deletion.ts` is the model: one budget of rows per
 * transaction, children before parents, and "done" decided by re-reading
 * rather than by trusting that a budget happened not to run out. The `users`
 * row is deleted by the caller only once this reports `done`, so a person can
 * never disappear ahead of rows that still point at them.
 *
 * ## Order
 *
 * Credentials and sessions go first. They are a handful of rows, so they always
 * fit in the very first transaction, which means sign-in is impossible from
 * the moment the admin presses the button even when the training history takes
 * several scheduled steps to clear.
 *
 * ## What is deliberately NOT deleted
 *
 * **`auditLog`.** It records what an administrator did, not who the subject
 * is, and it already keeps the ids of rows that are gone. A permanent delete
 * is exactly the kind of decision the log exists to remember.
 *
 * **`monthlyRollups` and `counters`.** Anonymous school-wide aggregates. A
 * past month's snapshot was true when it was taken.
 *
 * **Other people's `staffInvites.invitedBy`.** An invitation an admin sent is
 * the invitee's row, not the admin's. Nothing dereferences the field.
 */

/** Auth rows read per parent. A person has a few sessions, not thousands. */
const AUTH_CAP = 100;

type Budget = { rows: number };

function capped(budget: Budget): number {
  return Math.max(0, budget.rows);
}

export type StaffRemoval = {
  /** False when the budget ran out: the person still has rows. */
  done: boolean;
  /** Rows deleted this pass. */
  deleted: number;
};

/**
 * Delete one staff member's dependent rows, up to one step's budget.
 *
 * Does **not** delete the `users` row. The caller does that, and only when
 * this returns `done`.
 */
export async function removeStaffRecords(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<StaffRemoval> {
  const budget: Budget = { rows: STEP_ROW_BUDGET };
  const before = budget.rows;

  // --- Access: sessions, then the credential -------------------------------

  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(AUTH_CAP);
  for (const session of sessions) {
    if (budget.rows <= 0) break;
    // Tokens before the session they belong to, as Convex Auth's own
    // `deleteSession` does.
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(capped(budget));
    for (const token of tokens) {
      await ctx.db.delete("authRefreshTokens", token._id);
      budget.rows -= 1;
    }
    // Out of budget means tokens may remain; the next step resumes here.
    if (budget.rows <= 0) break;
    await ctx.db.delete("authSessions", session._id);
    budget.rows -= 1;
  }

  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(AUTH_CAP);
  for (const account of accounts) {
    if (budget.rows <= 0) break;
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(AUTH_CAP);
    for (const code of codes) {
      await ctx.db.delete("authVerificationCodes", code._id);
      budget.rows -= 1;
    }
    await ctx.db.delete("authAccounts", account._id);
    budget.rows -= 1;
  }

  const invites = await ctx.db
    .query("staffInvites")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(capped(budget));
  for (const invite of invites) {
    await ctx.db.delete("staffInvites", invite._id);
    budget.rows -= 1;
  }

  // --- Training history ----------------------------------------------------

  const progress = await ctx.db
    .query("lessonProgress")
    .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId))
    .take(capped(budget));
  for (const row of progress) {
    await ctx.db.delete("lessonProgress", row._id);
    budget.rows -= 1;
  }

  const attempts = await ctx.db
    .query("assessmentAttempts")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
    .take(capped(budget));
  for (const attempt of attempts) {
    await ctx.db.delete("assessmentAttempts", attempt._id);
    budget.rows -= 1;
  }

  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
    .take(capped(budget));
  for (const enrollment of enrollments) {
    await ctx.db.delete("enrollments", enrollment._id);
    budget.rows -= 1;
  }

  const awards = await ctx.db
    .query("badgeAwards")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(capped(budget));
  for (const award of awards) {
    await ctx.db.delete("badgeAwards", award._id);
    budget.rows -= 1;
  }

  const events = await ctx.db
    .query("progressEvents")
    .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
    .take(capped(budget));
  for (const event of events) {
    await ctx.db.delete("progressEvents", event._id);
    budget.rows -= 1;
  }

  return { done: await hasNoRecords(ctx, userId), deleted: before - budget.rows };
}

/**
 * Whether anything still names this person.
 *
 * Re-read rather than inferred, for the reason `deletion.ts` gives: a cap that
 * was hit is exactly the case this has to catch.
 */
async function hasNoRecords(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const probes = [
    ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("staffInvites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("lessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("assessmentAttempts")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("badgeAwards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("progressEvents")
      .withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId))
      .take(1),
  ];
  for (const rows of await Promise.all(probes)) {
    if (rows.length > 0) return false;
  }
  return true;
}
