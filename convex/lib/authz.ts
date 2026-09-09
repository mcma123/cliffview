import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The single authorization choke point.
 *
 * Identity is always derived server-side. A user id is NEVER accepted as a
 * function argument for authorization — `getAuthUserId` reads it out of the
 * verified token, so a caller cannot claim to be someone else.
 *
 * The staff profile *is* the auth user (see the `users` note in
 * `convex/schema.ts`), so an authenticated id resolves to a profile with one
 * `get` and no join table. `convex/auth.ts` guarantees that link can only point
 * at a pre-provisioned row.
 */

export type Actor = {
  userId: Id<"users">;
  user: Doc<"users">;
};

/** Roles allowed into the admin console. */
const ADMIN_ROLES = new Set<Doc<"users">["accessRole"]>(["smt_admin", "super_admin"]);

/**
 * Resolve the calling identity to a staff record, or null when unauthenticated.
 * Read-only and safe to call from queries.
 */
export async function getActor(ctx: QueryCtx | MutationCtx): Promise<Actor | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;

  const user = await ctx.db.get("users", userId);
  if (user === null) return null;

  return { userId, user };
}

/** Any active staff member. Throws otherwise. */
export async function requireStaff(ctx: QueryCtx | MutationCtx): Promise<Actor> {
  const actor = await getActor(ctx);
  if (actor === null) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to continue." });
  }
  if (actor.user.employmentStatus !== "active") {
    throw new ConvexError({ code: "FORBIDDEN", message: "This account is not active." });
  }
  return actor;
}

/**
 * An active SMT admin. Every admin mutation calls this first, before reading or
 * writing anything.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Actor> {
  const actor = await requireStaff(ctx);
  if (!ADMIN_ROLES.has(actor.user.accessRole)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Admin access is required for this action.",
    });
  }
  return actor;
}
