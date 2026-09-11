import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAudit } from "./audit";

/**
 * Invitation tokens: minting, hashing, and the one place an invite is spent.
 *
 * The security property this file exists to hold is that **an invitation is
 * consumed in the same transaction that creates the credential**. Validating
 * in an action and consuming in a separate mutation would leave a window where
 * the account exists and the link is still live, which is exactly the failure
 * a single-use token is meant to prevent. So `consumeInviteOrThrow` is called
 * from `createOrUpdateUser` in `convex/auth.ts`, deep inside Convex Auth's own
 * `auth:store` mutation, alongside the `authAccounts` insert.
 */

/** Seven days. One constant, so the refusal and the email copy cannot drift. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Matches Convex Auth's own default minimum. `createAccount` bypasses
 * `Password.authorize`, and therefore bypasses `validatePasswordRequirements`,
 * so the invite path has to enforce this itself or it would be the one way
 * into the school with no length rule at all.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Bounded read: nobody accumulates more than a handful of invitations. */
const MAX_INVITES_PER_USER = 50;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 32 random bytes as 64 hex characters.
 *
 * Hex rather than base64url because the value goes in a URL and hex has no
 * `+`, `/` or `=` to escape. 256 bits is also why there is no rate limiter on
 * redemption: guessing one is not a threat model, it is arithmetic.
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Lowercase hex SHA-256.
 *
 * **Actions only.** `crypto.subtle` is Web Crypto, and the Convex query and
 * mutation runtimes are not documented to expose it — Convex Auth itself
 * reaches for a pure-JS SHA-256 in its mutation path rather than this, which
 * is a strong hint. Every mutation and query in this feature therefore takes a
 * hash that an action computed, never a raw token.
 */
export async function hashInviteToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return toHex(new Uint8Array(digest));
}

/** Why an invitation cannot be redeemed, or `valid`. */
export type InviteState = "valid" | "unknown" | "expired" | "used" | "revoked" | "email_changed";

/** Classify an invitation without mutating it. `now` is passed in, never read. */
export function classifyInvite(
  invite: Doc<"staffInvites"> | null,
  user: Doc<"users"> | null,
  now: number,
): InviteState {
  // One verdict for "no such token" and "token for somebody else": telling the
  // holder which it is tells them something about a token they do not hold.
  if (invite === null || user === null || invite.userId !== user._id) return "unknown";
  if (invite.consumedAt !== undefined) return "used";
  if (invite.revokedAt !== undefined) return "revoked";
  if (invite.expiresAt < now) return "expired";
  if (invite.email !== user.email) return "email_changed";
  return "valid";
}

const MESSAGES: Record<Exclude<InviteState, "valid">, { code: string; message: string }> = {
  unknown: { code: "INVITE_INVALID", message: "This invitation link is not valid." },
  used: {
    code: "INVITE_USED",
    message: "This invitation has already been used. Sign in with the password you set.",
  },
  revoked: {
    code: "INVITE_REVOKED",
    message: "A newer invitation was sent. Please use the most recent email.",
  },
  expired: {
    code: "INVITE_EXPIRED",
    message: "This invitation has expired. Ask an administrator to send a new one.",
  },
  email_changed: {
    code: "INVITE_EMAIL_CHANGED",
    message:
      "This invitation was sent to a different address. Ask an administrator to send a new one.",
  },
};

export function inviteError(state: Exclude<InviteState, "valid">): ConvexError<{
  code: string;
  message: string;
}> {
  return new ConvexError(MESSAGES[state]);
}

/**
 * Spend an invitation, or refuse the sign-up.
 *
 * Called from `createOrUpdateUser`, so the `consumedAt` patch and the
 * `authAccounts` insert commit together. Two browsers redeeming the same link
 * cannot both win: the second conflicts on this document, retries, and finds
 * `consumedAt` already set.
 */
export async function consumeInviteOrThrow(
  ctx: MutationCtx,
  user: Doc<"users">,
  tokenHash: string,
): Promise<void> {
  const invite = await ctx.db
    .query("staffInvites")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();

  const state = classifyInvite(invite, user, Date.now());
  if (state !== "valid") throw inviteError(state);

  await ctx.db.patch("staffInvites", invite!._id, { consumedAt: Date.now() });
  // Genuinely nobody is signed in yet, which is why `recordAudit` takes a
  // nullable actor. The person is identified by the entity, not the caller.
  await recordAudit(ctx, {
    actor: null,
    action: "invite.accepted",
    entityTable: "users",
    entityId: user._id,
    summary: `${user.firstName} ${user.lastName} <${user.email}> set their password`,
  });
}

/**
 * Retire every live invitation for one person.
 *
 * Issuing a new link kills the old one, which is what somebody who clicks the
 * wrong email in their inbox expects to happen.
 */
export async function revokeLiveInvites(
  ctx: MutationCtx,
  userId: Doc<"users">["_id"],
): Promise<number> {
  const rows = await ctx.db
    .query("staffInvites")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_INVITES_PER_USER);

  let revoked = 0;
  for (const row of rows) {
    if (row.consumedAt !== undefined || row.revokedAt !== undefined) continue;
    await ctx.db.patch("staffInvites", row._id, { revokedAt: Date.now() });
    revoked += 1;
  }
  return revoked;
}
