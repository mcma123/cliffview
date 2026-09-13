import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The password credential, and keeping it in step with the profile it belongs to.
 *
 * Convex Auth keys a password account by the email address itself:
 * `authAccounts.providerAccountId` holds it, and every sign-in resolves through
 * the `providerAndAccountId` index before any of this app's code runs. That
 * makes the address two facts in two tables, and they have to move together.
 *
 * They did not, until this module existed. `staff.update` patched `users.email`
 * alone, which left the profile saying one thing and the credential another:
 *
 * - the **new** address failed to sign in, with the library's generic "invalid
 *   credentials" rather than any message this app writes, because
 *   `createOrUpdateUser` is never reached on that path;
 * - the **old** address kept working indefinitely, and — worse — resolved
 *   straight to `existingAccount.userId`, skipping every refusal in
 *   `createOrUpdateUser`, including the one for a deactivated account.
 *
 * So a corrected typo locked somebody out, and a deactivated person could still
 * sign in under the address they were hired with.
 */

/** The caller's password credential, or null when they have never set one. */
export async function passwordAccountFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"authAccounts"> | null> {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
    .unique();
}

/**
 * Point an existing password credential at a new address.
 *
 * Returns whether there was one to move — a teacher who has never redeemed
 * their invitation has no credential, and that is the ordinary case rather than
 * an error.
 *
 * The secret is untouched: this changes what the account is called, not the
 * password behind it, so nobody has to be told a new one.
 */
export async function rekeyPasswordAccount(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
): Promise<boolean> {
  const account = await passwordAccountFor(ctx, userId);
  if (account === null) return false;
  await ctx.db.patch("authAccounts", account._id, { providerAccountId: email });
  return true;
}
