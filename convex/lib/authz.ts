import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The single authorization choke point.
 *
 * Two rules, both from Convex guidance and both non-negotiable:
 *
 * - Identity is always derived server-side from `ctx.auth.getUserIdentity()`.
 *   A user id is NEVER accepted as a function argument for authorization.
 * - `identity.tokenIdentifier` is the canonical stable key, not
 *   `identity.subject`.
 *
 * Until Phase 4 wires an auth provider there is no `convex/auth.config.ts`, so
 * `getUserIdentity()` returns null and every `require*` helper here throws.
 * That is deliberate: it means no mutation can be written without an
 * authorization call, and none can be reached before the guard exists.
 */

export type Actor = {
  tokenIdentifier: string;
  user: Doc<"users">;
};

/** Roles allowed into the admin console. */
const ADMIN_ROLES = new Set<Doc<"users">["accessRole"]>(["smt_admin", "super_admin"]);

/**
 * Resolve the calling identity to a staff record, or null when unauthenticated
 * or unlinked. Read-only and safe to call from queries.
 */
export async function getActor(ctx: QueryCtx | MutationCtx): Promise<Actor | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) =>
      q.eq("authTokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (user === null) return null;

  return { tokenIdentifier: identity.tokenIdentifier, user };
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
