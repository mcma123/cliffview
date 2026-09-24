import type { MutationCtx } from "../_generated/server";

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
    /**
     * Who acted. Widened from `Actor` to just the id because a scheduled
     * continuation carries the id across transactions and has no reason to
     * re-read the user document to write one log row. `auditLog.actorId` is
     * a plain string in the schema, so nothing is lost.
     */
    actor: { userId: string } | null;
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
    ...(args.actor === null ? {} : { actorId: args.actor.userId }),
    ...(args.summary === undefined ? {} : { summary: args.summary }),
  });
}
