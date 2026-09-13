import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { passwordAccountFor } from "./lib/credentials";
import { sendInvitationEmail } from "./lib/email";
import type { InviteState } from "./lib/invites";
import {
  INVITE_TTL_MS,
  MIN_PASSWORD_LENGTH,
  classifyInvite,
  generateInviteToken,
  hashInviteToken,
  inviteError,
  revokeLiveInvites,
} from "./lib/invites";

/**
 * Invitations: the only way a teacher gets a password.
 *
 * The shape here is deliberate and worth reading before changing anything.
 *
 * **Hashing happens only in actions.** `crypto.subtle` is not documented for
 * the Convex query and mutation runtimes, so every mutation and query below
 * takes a `tokenHash` that an action already computed. The raw token exists in
 * the sent email, the invitee's URL bar, and nowhere else.
 *
 * **`Password` stays uncalled in `convex/auth.ts`, and that is load-bearing.**
 * `accept` reaches Convex Auth through `createAccount`, handing it a profile
 * of `{ email, inviteTokenHash }` that we construct ourselves. A browser
 * reaches the same callback only through `auth:signIn`, where the provider's
 * own `defaultProfile` builds `{ email }` from scratch and discards every
 * other form field. So no client-reachable path can put `inviteTokenHash` into
 * that profile. Configuring `Password({ profile })` would create one, which is
 * why this feature does not.
 *
 * **The invite is spent inside `createOrUpdateUser`**, in the same transaction
 * that inserts the credential. See `convex/lib/invites.ts`.
 */

/** What `deliver` reports back about one attempt. */
type DeliveryResult = { sent: boolean; link: string | null; reason: string | null };

/** What `inspect` and `preview` report about a token. */
type InviteInspection = {
  state: string;
  email: string | null;
  firstName: string | null;
  expiresAt: number | null;
};

/** Why a staff row cannot be invited right now. */
type NotInvitable = "missing" | "operator" | "privileged" | "inactive" | "already_set_up";

const NOT_INVITABLE: Record<NotInvitable, string> = {
  missing: "That staff profile no longer exists.",
  operator: "Operator accounts are not invited by email.",
  privileged: "Administrator accounts are provisioned by an operator, not invited by email.",
  inactive: "This account is not active, so an invitation would be refused at sign-in.",
  already_set_up:
    "This person has already set a password. Sending another invitation would not change that.",
};

/** Does this person already hold a password credential? */
export async function hasPasswordAccount(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  return (await passwordAccountFor(ctx, userId)) !== null;
}

// ---------------------------------------------------------------------------
// Internal: gated checks, storage, delivery
// ---------------------------------------------------------------------------

/**
 * Admin-gated precondition check for inviting somebody.
 *
 * A query rather than part of the action because `requireAdmin` needs
 * `ctx.db`. Identity propagates from the calling action, so this is a real
 * gate and not a formality.
 */
export const prepare = internalQuery({
  args: { staffId: v.id("users") },
  returns: v.object({
    email: v.string(),
    firstName: v.string(),
    invitedByName: v.string(),
    invitedBy: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    // Thrown inline rather than through a helper: a `never`-returning arrow
    // does not narrow `user` for the checks that follow it.
    function refuse(reason: NotInvitable): never {
      throw new ConvexError({ code: "NOT_INVITABLE", message: NOT_INVITABLE[reason] });
    }

    const user = await ctx.db.get("users", args.staffId);
    if (user === null) refuse("missing");
    if (user.accessRole === "super_admin") refuse("operator");
    if (user.accessRole === "smt_admin") refuse("privileged");
    if (user.employmentStatus !== "active") refuse("inactive");
    if (await hasPasswordAccount(ctx, user._id)) refuse("already_set_up");

    return {
      email: user.email,
      firstName: user.firstName,
      invitedByName: `${actor.user.firstName} ${actor.user.lastName}`,
      invitedBy: actor.userId,
    };
  },
});

/** Store a freshly minted invitation, retiring any that are still live. */
export const issue = internalMutation({
  args: {
    userId: v.id("users"),
    invitedBy: v.id("users"),
    tokenHash: v.string(),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await revokeLiveInvites(ctx, args.userId);
    await ctx.db.insert("staffInvites", {
      userId: args.userId,
      email: args.email,
      tokenHash: args.tokenHash,
      expiresAt: Date.now() + INVITE_TTL_MS,
      invitedBy: args.invitedBy,
    });
    return null;
  },
});

/** Record what happened to a send, so "they never got it" is answerable. */
export const recordDelivery = internalMutation({
  args: { userId: v.id("users"), action: v.string(), summary: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordAudit(ctx, {
      actor: null,
      action: args.action,
      entityTable: "users",
      entityId: args.userId,
      summary: args.summary,
    });
    return null;
  },
});

/**
 * Mint, store and send one invitation.
 *
 * An action, because it both hashes and sends. Scheduled from `staff.create`
 * rather than inlined there: `ctx.scheduler.runAfter` is itself transactional,
 * so a rolled-back create cancels the job and nobody is emailed about an
 * account that does not exist, while a mail outage cannot roll back a profile.
 */
export const deliver = internalAction({
  args: {
    userId: v.id("users"),
    invitedBy: v.id("users"),
    email: v.string(),
    firstName: v.string(),
    invitedByName: v.string(),
  },
  returns: v.object({
    sent: v.boolean(),
    link: v.union(v.string(), v.null()),
    reason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<DeliveryResult> => {
    const token = generateInviteToken();
    const tokenHash = await hashInviteToken(token);

    await ctx.runMutation(internal.invites.issue, {
      userId: args.userId,
      invitedBy: args.invitedBy,
      tokenHash,
      email: args.email,
    });

    const outcome = await sendInvitationEmail(ctx, {
      to: args.email,
      firstName: args.firstName,
      invitedBy: args.invitedByName,
      token,
    });

    await ctx.runMutation(internal.invites.recordDelivery, {
      userId: args.userId,
      action: outcome.sent ? "invite.sent" : `invite.skipped:${outcome.reason}`,
      summary: args.email,
    });

    // The link comes back even when the send was skipped, so `resend` can
    // offer it for copying: an undeliverable seeded domain, or a bounce. The
    // `sent` flag comes back too, because telling an admin "invitation sent"
    // when nothing left the building is the exact false success this codebase
    // spends its comments warning about.
    return {
      sent: outcome.sent,
      link: outcome.link,
      reason: outcome.sent ? null : outcome.reason,
    };
  },
});

/** Classify a token. `now` comes from the caller; queries never read the clock. */
export const inspect = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.object({
    state: v.string(),
    email: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("staffInvites")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    const user = invite === null ? null : await ctx.db.get("users", invite.userId);

    const state = classifyInvite(invite, user, args.now);
    if (state !== "valid" || user === null || invite === null) {
      // A bad token must not confirm whose it is, so nothing comes back with it.
      return { state, email: null, firstName: null, expiresAt: null };
    }
    return {
      state,
      email: user.email,
      firstName: user.firstName,
      expiresAt: invite.expiresAt,
    };
  },
});

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * What the invite page shows before asking for a password.
 *
 * An action rather than a query because it has to hash the raw token, and
 * ungated because the token is itself the credential.
 */
export const preview = action({
  args: { token: v.string() },
  returns: v.object({
    state: v.string(),
    email: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
  }),
  // Annotated because the handler references `internal.invites`, which
  // includes this function: without it TypeScript infers `preview` from its
  // own initializer and gives up with an implicit `any`.
  handler: async (ctx, args): Promise<InviteInspection> =>
    await ctx.runQuery(internal.invites.inspect, {
      tokenHash: await hashInviteToken(args.token),
      now: Date.now(),
    }),
});

/**
 * Redeem an invitation and set the password.
 *
 * Ungated by design, and deliberately mints no session: `createAccount`
 * creates the credential and the user link without generating tokens, so the
 * teacher finishes signed out and goes to the normal sign-in page. That is the
 * requested behaviour, and it avoids a sign-in-then-sign-out dance that would
 * briefly put a real session in localStorage.
 */
export const accept = action({
  args: { token: v.string(), password: v.string(), confirmPassword: v.string() },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, args): Promise<{ email: string }> => {
    // Checked here and not only in the form: a browser is not a security
    // boundary, and a mismatch reaching `createAccount` would set a password
    // the person never typed twice.
    if (args.password !== args.confirmPassword) {
      throw new ConvexError({
        code: "PASSWORD_MISMATCH",
        message: "The two passwords do not match.",
      });
    }
    // `createAccount` bypasses `Password.authorize`, and therefore
    // `validatePasswordRequirements`. This is the only length check on this path.
    if (args.password.length < MIN_PASSWORD_LENGTH) {
      throw new ConvexError({
        code: "WEAK_PASSWORD",
        message: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    const tokenHash = await hashInviteToken(args.token);

    // Advisory: it produces the right message before anything is written, and
    // it catches the one case the transactional consume cannot, where somebody
    // already has an account and `createAccount` returns early without ever
    // reaching `createOrUpdateUser`. The authoritative check still runs there.
    const inspected: InviteInspection = await ctx.runQuery(internal.invites.inspect, {
      tokenHash,
      now: Date.now(),
    });
    if (inspected.state !== "valid" || inspected.email === null) {
      throw inviteError(inspected.state as Exclude<InviteState, "valid">);
    }
    const email = inspected.email;

    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      // The extra key is the whole mechanism: `createOrUpdateUser` reads it,
      // validates it, and spends the invite in the same transaction as the
      // account insert. The cast is unavoidable, because the library types
      // `profile` as a complete user document while our callback resolves an
      // existing row instead of inserting one. Same justification as the
      // `genericCtx as unknown as MutationCtx` cast in `convex/auth.ts`.
      profile: { email, inviteTokenHash: tokenHash } as unknown as Omit<
        Doc<"users">,
        "_id" | "_creationTime"
      >,
      // Both false, and load-bearing: `true` would let Convex Auth bind this
      // credential to any user sharing a verified email rather than to the
      // invitee named by the token.
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });

    return { email };
  },
});

/**
 * Send, or re-send, an invitation from the admin console.
 *
 * Returns the link so an admin can copy it when email is not an option: a
 * seeded `@cliffview.example` address, or a bounce. This grants an admin no
 * capability they lacked, since they can already change a colleague's email
 * address, and it is audited either way.
 */
export const resend = action({
  args: { staffId: v.id("users") },
  returns: v.object({
    email: v.string(),
    link: v.union(v.string(), v.null()),
    sent: v.boolean(),
    reason: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ email: string; link: string | null; sent: boolean; reason: string | null }> => {
    // First line, and a real gate: identity propagates into `runQuery`.
    const target = await ctx.runQuery(internal.invites.prepare, { staffId: args.staffId });

    const result: DeliveryResult = await ctx.runAction(internal.invites.deliver, {
      userId: args.staffId,
      invitedBy: target.invitedBy,
      email: target.email,
      firstName: target.firstName,
      invitedByName: target.invitedByName,
    });
    return { email: target.email, ...result };
  },
});
