import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./authz";

/**
 * Audit helpers.
 *
 * `contentUpdatedAt` is a real timestamp, not the prose the seed carried
 * ("Updated 2 days ago"), so lists can sort by it and the presenter renders the
 * relative label.
 */

/**
 * Fields every content write stamps. Spread into a `patch` or `insert`.
 *
 * There is no `updatedBy` here on purpose — see `auditFields` in
 * `convex/validators.ts`. Call `recordAudit` to record who acted.
 */
export function stamp(): { contentUpdatedAt: number } {
  return { contentUpdatedAt: Date.now() };
}

/** Append a row to the audit log. Never throws on a missing actor. */
export async function recordAudit(
  ctx: MutationCtx,
  args: {
    actor: Actor | null;
    action: string;
    entityTable: string;
    entityId: string;
    summary?: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLog", {
    action: args.action,
    entityTable: args.entityTable,
    entityId: args.entityId,
    at: Date.now(),
    ...(args.actor === null ? {} : { actorId: args.actor.tokenIdentifier }),
    ...(args.summary === undefined ? {} : { summary: args.summary }),
  });
}
