import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getActor } from "./lib/authz";

/**
 * Convex Auth wiring: email + password.
 *
 * Password rather than the passkey default because the sign-in page is already
 * an email/password form and Cliffview staff share devices, where a
 * device-bound credential is the wrong shape. Passkeys can be added later as an
 * additional provider without touching this callback.
 *
 * The whole security model of this file is one function: `createOrUpdateUser`.
 * It is the only path by which an auth account becomes a staff identity, so
 * every rule about who may sign in lives there and nowhere else.
 */

/** Roles that may never be claimed by an ordinary sign-up. */
const PRIVILEGED_ROLES = new Set<Doc<"users">["accessRole"]>(["smt_admin", "super_admin"]);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],

  callbacks: {
    /**
     * Resolve a sign-in to a pre-provisioned staff row.
     *
     * Returning an existing `_id` means Convex Auth links the account to that
     * profile instead of inserting a user, which is what lets `users` keep its
     * required fields and stay the single list of people in the school.
     *
     * Three refusals, in order:
     *
     * 1. No matching profile -> nobody can self-register into the school. A
     *    staff member must be seeded or created by an admin first.
     * 2. Inactive profile -> a departed staff member cannot sign back in.
     * 3. Privileged profile without an open claim window -> an admin account is
     *    provisioned deliberately, never by whoever gets to the address first.
     *    There is no email verification configured, so without this an admin
     *    address is a takeover path.
     */
    async createOrUpdateUser(genericCtx, args): Promise<Id<"users">> {
      // An existing link always wins: this is a returning sign-in, and the
      // account is already bound to a profile.
      if (args.existingUserId !== null) {
        return args.existingUserId;
      }

      // Convex Auth types this callback against AnyDataModel, so the ctx it
      // hands us knows nothing about our tables. One cast at the boundary buys
      // full type safety for the rest of the function.
      const ctx = genericCtx as unknown as MutationCtx;

      const email = args.profile.email;
      if (typeof email !== "string" || email.length === 0) {
        throw new ConvexError({
          code: "NO_EMAIL",
          message: "An email address is required to sign in.",
        });
      }
      const normalized = email.trim().toLowerCase();

      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", normalized))
        .unique();

      if (user === null) {
        throw new ConvexError({
          code: "NOT_PROVISIONED",
          message:
            "That email address is not registered with Cliffview Academy. Ask an administrator to add you.",
        });
      }

      if (user.employmentStatus !== "active") {
        throw new ConvexError({
          code: "INACTIVE",
          message: "This account is no longer active.",
        });
      }

      if (PRIVILEGED_ROLES.has(user.accessRole)) {
        const allowedUntil = user.adminClaimAllowedUntil ?? 0;
        if (allowedUntil < Date.now()) {
          throw new ConvexError({
            code: "ADMIN_CLAIM_CLOSED",
            message:
              "Administrator accounts must be provisioned by an operator before first sign-in.",
          });
        }
        // Single-use: close the window as soon as it is used.
        await ctx.db.patch("users", user._id, { adminClaimAllowedUntil: undefined });
      }

      return user._id;
    },
  },
});

/**
 * The signed-in staff member, as little of them as the UI needs.
 *
 * Returns null rather than throwing when unauthenticated, because the admin
 * gate and the shells call this to decide what to draw and an exception there
 * would be an error screen instead of a sign-in prompt. It deliberately exposes
 * no other person's data and no contact details.
 */
export const viewer = query({
  args: {},
  returns: v.union(
    v.object({
      name: v.string(),
      initials: v.string(),
      jobTitle: v.string(),
      accessRole: v.string(),
      isAdmin: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const actor = await getActor(ctx);
    if (actor === null) return null;
    const { user } = actor;
    return {
      name: `${user.honorific === undefined ? "" : `${user.honorific} `}${user.firstName} ${user.lastName}`.trim(),
      initials: `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase(),
      jobTitle: user.jobTitle,
      accessRole: user.accessRole,
      isAdmin: PRIVILEGED_ROLES.has(user.accessRole),
    };
  },
});

/**
 * Open a single-use window for an administrator to claim their profile.
 *
 * `internalMutation`, so it is unreachable from any client. Run it, then have
 * the administrator sign up with that email inside the window:
 *
 *   npx convex run auth:allowAdminClaim '{"email":"...","minutes":30}'
 */
export const allowAdminClaim = internalMutation({
  args: {
    email: v.string(),
    minutes: v.optional(v.number()),
  },
  returns: v.object({
    email: v.string(),
    accessRole: v.string(),
    allowedUntil: v.number(),
  }),
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .unique();
    if (user === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `No staff profile with email "${normalized}".`,
      });
    }
    if (!PRIVILEGED_ROLES.has(user.accessRole)) {
      throw new ConvexError({
        code: "NOT_PRIVILEGED",
        message: `${normalized} is not an admin profile; it can self-claim without this.`,
      });
    }

    const minutes = Math.min(Math.max(args.minutes ?? 30, 1), 24 * 60);
    const allowedUntil = Date.now() + minutes * 60 * 1000;
    await ctx.db.patch("users", user._id, { adminClaimAllowedUntil: allowedUntil });

    return { email: normalized, accessRole: user.accessRole, allowedUntil };
  },
});

/**
 * Whether a profile has an auth account yet. Read-only and internal, for
 * checking provisioning state from the CLI without exposing account data.
 */
export const claimStatus = internalQuery({
  args: { email: v.string() },
  returns: v.object({
    found: v.boolean(),
    accessRole: v.union(v.string(), v.null()),
    hasAccount: v.boolean(),
    claimWindowOpen: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .unique();
    if (user === null) {
      return { found: false, accessRole: null, hasAccount: false, claimWindowOpen: false };
    }
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id).eq("provider", "password"))
      .unique();
    return {
      found: true,
      accessRole: user.accessRole,
      hasAccount: account !== null,
      claimWindowOpen: (user.adminClaimAllowedUntil ?? 0) >= Date.now(),
    };
  },
});
