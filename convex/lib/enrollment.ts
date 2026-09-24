import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_MODULES, MAX_STAFF } from "./counts";

/**
 * Enrollment arithmetic, in one place.
 *
 * An enrollment row *is* the assignment: there is no join table, so everything
 * that puts a module on somebody's tracker goes through here. These used to be
 * private to `staff.ts`, which was fine while `staff.assignModules` was the
 * only writer. The bulk action is a second, and `lib/progress.ts` already
 * carries a third copy of the compliance formula with the note that if the
 * three ever disagreed a profile would contradict its own rows. Four copies
 * was the point to stop.
 */

/** Every enrollment for one person. Bounded: a person cannot hold more than the catalogue. */
async function enrollmentsFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Array<Doc<"enrollments">>> {
  return await ctx.db
    .query("enrollments")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
    .take(MAX_MODULES);
}

/**
 * Recompute a person's stored compliance from their enrollment rows.
 *
 * The mean of `enrollments.progressPercent`. `compliancePercent` stays a stored
 * column rather than being derived at read time because
 * `dashboard.adminOverview` also reads it; deriving it in one place and reading
 * the column in the other is how two screens come to disagree.
 */
export async function recomputeCompliance(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const enrollments = await enrollmentsFor(ctx, userId);
  const compliancePercent =
    enrollments.length === 0
      ? 0
      : Math.round(
          enrollments.reduce((sum, row) => sum + row.progressPercent, 0) / enrollments.length,
        );

  await ctx.db.patch("users", userId, { compliancePercent });
  return compliancePercent;
}

/** Enrollment rollup for one person. Bounded by the module count. */
export async function enrollmentTotals(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ assigned: number; completed: number }> {
  const enrollments = await enrollmentsFor(ctx, userId);
  return {
    assigned: enrollments.length,
    completed: enrollments.filter((row) => row.status === "completed").length,
  };
}

/**
 * Every published module, in sequence order.
 *
 * Uses `by_publishState_and_sequence`, which was declared in the schema and had
 * no reader until now. Published-only is not a preference: `assignModules`
 * throws on the first draft and aborts the whole transaction, because an
 * enrollment in unfinished content puts somebody on the hook for work they
 * cannot do and makes the module undeletable.
 */
export async function publishedModules(
  ctx: QueryCtx | MutationCtx,
): Promise<Array<Doc<"modules">>> {
  return await ctx.db
    .query("modules")
    .withIndex("by_publishState_and_sequence", (q) => q.eq("publishState", "published"))
    .take(MAX_MODULES);
}

/**
 * Everyone a school-wide assignment applies to.
 *
 * Active, and never an operator: a `super_admin` is a login, not a member of
 * staff, and `staffOrThrow` refuses one outright. This is the same scope
 * `dashboard.adminOverview` and `reports.compliance` count, so the headcount an
 * admin sees and the people a bulk assign reaches cannot disagree.
 */
export async function assignableStaff(ctx: QueryCtx | MutationCtx): Promise<Array<Doc<"users">>> {
  const active = await ctx.db
    .query("users")
    .withIndex("by_employmentStatus_and_xpTotal", (q) => q.eq("employmentStatus", "active"))
    .take(MAX_STAFF);
  return active.filter((user) => user.accessRole !== "super_admin");
}

/**
 * Give one person every module in `moduleIds` they do not already have.
 *
 * Idempotent by the natural key: one row per user and module, checked through
 * `by_userId_and_moduleId`. Re-assigning is a no-op rather than a second row,
 * which matters because `compliancePercent` is the mean over those rows and a
 * duplicate would be counted twice.
 *
 * Deliberately does **not** validate publish state. Callers pass a set already
 * filtered to published modules; re-reading every module row here would double
 * the reads in the bulk path for a check the caller has already made.
 */
export async function grantModules(
  ctx: MutationCtx,
  userId: Id<"users">,
  moduleIds: Array<Id<"modules">>,
  assignedAt: number,
  dueAt?: number,
): Promise<{ assigned: number; alreadyAssigned: number }> {
  let assigned = 0;
  let alreadyAssigned = 0;

  for (const moduleId of moduleIds) {
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId).eq("moduleId", moduleId))
      .unique();
    if (existing !== null) {
      alreadyAssigned += 1;
      continue;
    }
    await ctx.db.insert("enrollments", {
      userId,
      moduleId,
      status: "not_started",
      progressPercent: 0,
      assignedAt,
      ...(dueAt === undefined ? {} : { dueAt }),
    });
    assigned += 1;
  }

  // Unconditional, even when nothing new landed. Assigning work lowers
  // compliance, because compliance is the mean of what somebody has been
  // given — and a recompute that only runs on the happy path is a recompute
  // somebody will later find missing.
  await recomputeCompliance(ctx, userId);
  return { assigned, alreadyAssigned };
}
