import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { MAX_MODULES, MAX_PHASES, MAX_STAFF } from "./lib/counts";
import schema from "./schema";
import { accessRole, employmentStatus } from "./validators";

/**
 * The staff directory.
 *
 * Everything here is `requireAdmin`, not `requireStaff`: these are employee
 * records — names, email addresses, employment status and compliance history —
 * and being signed in as a teacher is not the same as being allowed to read the
 * whole school's personnel file.
 *
 * Two rules carry most of the weight in this file:
 *
 * 1. **`super_admin` is an operator login, not a person.** It is filtered out of
 *    the directory and its summary, exactly as `dashboard.adminOverview` does,
 *    so the two screens cannot disagree about how many staff the school has.
 *    An operator row belongs to nobody and would drag every average.
 * 2. **Nothing derivable is stored by hand.** `compliancePercent` is recomputed
 *    from the enrollment rows rather than typed in, so a profile can never
 *    claim a number its own rows contradict.
 */

/** Roles an admin may assign through the console. */
const ASSIGNABLE_ROLES = new Set<Doc<"users">["accessRole"]>(["staff", "smt_admin"]);

/** True for rows that represent an operator login rather than a member of staff. */
function isOperator(user: Doc<"users">): boolean {
  return user.accessRole === "super_admin";
}

/**
 * Recompute a person's stored compliance from their enrollment rows.
 *
 * The mean of `enrollments.progressPercent`, which is **exactly** the formula
 * `convex/seed.ts` used. It has to be: if this disagreed with the seed, the
 * first edit to any seeded profile would silently rewrite a number that was
 * correct, and the dashboard would move for no reason a reader could see.
 *
 * `compliancePercent` stays a stored column rather than being derived at read
 * time because `dashboard.adminOverview` also reads it; deriving it in one
 * place and reading the column in the other is how two screens come to
 * disagree. One source, recomputed whenever a profile is touched.
 */
async function recomputeCompliance(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
    .take(MAX_MODULES);

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
async function enrollmentTotals(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ assigned: number; completed: number }> {
  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", userId))
    .take(MAX_MODULES);
  return {
    assigned: enrollments.length,
    completed: enrollments.filter((row) => row.status === "completed").length,
  };
}

async function staffOrThrow(ctx: MutationCtx, staffId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get("users", staffId);
  if (user === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That staff profile no longer exists." });
  }
  if (isOperator(user)) {
    // Reachable only by passing an id read from somewhere other than the
    // directory, since the directory omits operator rows.
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Operator accounts are not editable from the staff directory.",
    });
  }
  return user;
}

/**
 * Normalise and validate the editable fields shared by create and update.
 *
 * `compliancePercent`, `cptdPoints` and `xpTotal` are deliberately absent: they
 * are earned, not assigned, and a form that could type them in is a form that
 * can make the dashboard lie.
 */
function cleanProfileInput(input: {
  honorific?: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  jobTitle?: string;
}) {
  const trimmedOptional = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  };

  if (input.firstName !== undefined && input.firstName.trim().length === 0) {
    throw new ConvexError({ code: "INVALID", message: "A staff member needs a first name." });
  }
  if (input.lastName !== undefined && input.lastName.trim().length === 0) {
    throw new ConvexError({ code: "INVALID", message: "A staff member needs a last name." });
  }
  if (input.jobTitle !== undefined && input.jobTitle.trim().length === 0) {
    throw new ConvexError({ code: "INVALID", message: "A staff member needs a job title." });
  }

  return {
    honorific: trimmedOptional(input.honorific),
    firstName: input.firstName?.trim(),
    lastName: input.lastName?.trim(),
    preferredName: trimmedOptional(input.preferredName),
    jobTitle: input.jobTitle?.trim(),
  };
}

/**
 * Normalise an email and reject one already used by someone else.
 *
 * Convex has no unique constraint, so uniqueness is a mutation invariant — the
 * same pattern module slugs use. It matters more here than anywhere else:
 * `users.email` is how `createOrUpdateUser` resolves a sign-in to a profile, so
 * a duplicate would make it ambiguous which person a login belongs to, and
 * `.unique()` on that index would start throwing for everyone.
 */
async function cleanEmail(
  ctx: MutationCtx,
  email: string,
  allowFor?: Id<"users">,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0 || !normalized.includes("@")) {
    throw new ConvexError({
      code: "INVALID",
      message: "A staff member needs a valid email address.",
    });
  }
  const existing = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", normalized))
    .unique();
  if (existing !== null && existing._id !== allowFor) {
    throw new ConvexError({
      code: "DUPLICATE_EMAIL",
      message: `${normalized} is already used by another staff profile.`,
    });
  }
  return normalized;
}

function assertAssignableRole(role: Doc<"users">["accessRole"]): void {
  if (!ASSIGNABLE_ROLES.has(role)) {
    // `super_admin` is minted only by `internal.auth.provisionAdmin`, which is
    // internal precisely so that no client-reachable path can create one.
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "That role cannot be assigned from the staff directory.",
    });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The whole directory, plus the phase list the create form needs.
 *
 * Inactive staff are included on purpose: an admin has to be able to see who
 * was deactivated and put them back. The list is capped rather than paginated —
 * a primary school's staff is a few dozen people, and `MAX_STAFF` is 500.
 */
export const directory = query({
  args: {},
  returns: v.object({
    staff: v.array(
      v.object({
        user: schema.doc("users"),
        phaseName: v.string(),
        assignedModules: v.number(),
        completedModules: v.number(),
      }),
    ),
    /** Active phases, oldest-ordered, for the phase selector. */
    phases: v.array(schema.doc("phases")),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const phaseRows = await ctx.db.query("phases").withIndex("by_order").take(MAX_PHASES);
    const phaseNames = new Map(phaseRows.map((phase) => [phase._id, phase.name]));

    const users = await ctx.db.query("users").take(MAX_STAFF);

    const staff = [];
    for (const user of users) {
      if (isOperator(user)) continue;
      const totals = await enrollmentTotals(ctx, user._id);
      staff.push({
        user,
        phaseName: phaseNames.get(user.phaseId) ?? "Unassigned",
        assignedModules: totals.assigned,
        completedModules: totals.completed,
      });
    }
    // Surname order: this is a directory, and a directory people can scan beats
    // one ordered by an id nobody can see.
    staff.sort((a, b) =>
      `${a.user.lastName} ${a.user.firstName}`.localeCompare(
        `${b.user.lastName} ${b.user.firstName}`,
      ),
    );

    return { staff, phases: phaseRows.filter((phase) => phase.isActive) };
  },
});

/** One profile, with the module tracker the detail screen renders. */
export const detail = query({
  args: { staffId: v.id("users") },
  returns: v.object({
    user: schema.doc("users"),
    phaseName: v.string(),
    phases: v.array(schema.doc("phases")),
    modules: v.array(
      v.object({
        enrollment: schema.doc("enrollments"),
        module: schema.doc("modules"),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get("users", args.staffId);
    if (user === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That staff profile no longer exists.",
      });
    }
    if (isOperator(user)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Operator accounts are not listed in the staff directory.",
      });
    }

    const phase = await ctx.db.get("phases", user.phaseId);
    const phaseRows = await ctx.db.query("phases").withIndex("by_order").take(MAX_PHASES);

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) => q.eq("userId", user._id))
      .take(MAX_MODULES);

    const modules = [];
    for (const enrollment of enrollments) {
      const module = await ctx.db.get("modules", enrollment.moduleId);
      // An enrollment whose module was deleted is skipped rather than rendered
      // as a hole. `modules.remove` refuses once anyone is enrolled, so this
      // should not happen.
      if (module !== null) modules.push({ enrollment, module });
    }
    modules.sort((a, b) => a.module.sequence - b.module.sequence);

    return {
      user,
      phaseName: phase?.name ?? "Unassigned",
      phases: phaseRows.filter((row) => row.isActive),
      modules,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a staff profile.
 *
 * This does **not** create a login. `users` is both the staff list and Convex
 * Auth's user table, and `createOrUpdateUser` links an account to a row that
 * already exists — so this row is what later lets that person sign up at all,
 * and until they do they simply have no credentials. That is the whole reason
 * nobody can self-register into the school.
 */
export const create = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    jobTitle: v.string(),
    accessRole,
    phaseId: v.id("phases"),
    honorific: v.optional(v.string()),
    preferredName: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    assertAssignableRole(args.accessRole);

    const phase = await ctx.db.get("phases", args.phaseId);
    if (phase === null) {
      throw new ConvexError({ code: "INVALID", message: "That phase does not exist." });
    }

    const clean = cleanProfileInput(args);
    const email = await cleanEmail(ctx, args.email);

    const staffId = await ctx.db.insert("users", {
      firstName: clean.firstName!,
      lastName: clean.lastName!,
      jobTitle: clean.jobTitle!,
      ...(clean.honorific === undefined ? {} : { honorific: clean.honorific }),
      ...(clean.preferredName === undefined ? {} : { preferredName: clean.preferredName }),
      email,
      accessRole: args.accessRole,
      phaseId: phase._id,
      employmentStatus: "active",
      // Earned, never assigned. A new person has no enrollments, so zero is the
      // true figure rather than a placeholder.
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
    });

    await recordAudit(ctx, {
      actor,
      action: "staff.create",
      entityTable: "users",
      entityId: staffId,
      summary: `${clean.firstName} ${clean.lastName} <${email}>`,
    });
    return staffId;
  },
});

/** Edit a staff profile. Every field optional; absent means "leave it alone". */
export const update = mutation({
  args: {
    staffId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    accessRole: v.optional(accessRole),
    phaseId: v.optional(v.id("phases")),
    honorific: v.optional(v.string()),
    preferredName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const user = await staffOrThrow(ctx, args.staffId);

    if (args.accessRole !== undefined) {
      assertAssignableRole(args.accessRole);
      // Nobody edits their own role. Otherwise an admin can demote themselves
      // out of the console and, if they were the last one, lock the school out
      // of its own admin surface.
      if (user._id === actor.userId && args.accessRole !== user.accessRole) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "You cannot change your own access role. Ask another administrator.",
        });
      }
    }

    if (args.phaseId !== undefined) {
      const phase = await ctx.db.get("phases", args.phaseId);
      if (phase === null) {
        throw new ConvexError({ code: "INVALID", message: "That phase does not exist." });
      }
    }

    const clean = cleanProfileInput(args);
    const email =
      args.email === undefined ? undefined : await cleanEmail(ctx, args.email, user._id);

    await ctx.db.patch("users", user._id, {
      ...(clean.firstName === undefined ? {} : { firstName: clean.firstName }),
      ...(clean.lastName === undefined ? {} : { lastName: clean.lastName }),
      ...(clean.jobTitle === undefined ? {} : { jobTitle: clean.jobTitle }),
      // These two clear when sent empty, which is how a mistyped honorific gets
      // removed rather than being stuck forever.
      ...(args.honorific === undefined ? {} : { honorific: clean.honorific }),
      ...(args.preferredName === undefined ? {} : { preferredName: clean.preferredName }),
      ...(email === undefined ? {} : { email }),
      ...(args.accessRole === undefined ? {} : { accessRole: args.accessRole }),
      ...(args.phaseId === undefined ? {} : { phaseId: args.phaseId }),
    });

    // Cheap, and it means a stored compliance figure can never drift away from
    // the rows behind it without somebody noticing on the next edit.
    await recomputeCompliance(ctx, user._id);

    await recordAudit(ctx, {
      actor,
      action: "staff.update",
      entityTable: "users",
      entityId: user._id,
      summary: `${clean.firstName ?? user.firstName} ${clean.lastName ?? user.lastName}`,
    });
    return null;
  },
});

/**
 * Deactivate or reinstate a staff member.
 *
 * This is the delete. A `users` row is referenced by enrollments, lesson
 * progress, assessment attempts and the audit log, and it is the identity a
 * Convex Auth account is bound to, so removing it would orphan a person's
 * entire training history and leave a live session pointing at nothing.
 * `employmentStatus: "inactive"` is already the modelled answer:
 * `requireStaff` refuses an inactive account and so does `createOrUpdateUser`,
 * which means deactivation immediately ends access without destroying the
 * record the school may need to produce later.
 */
export const setEmploymentStatus = mutation({
  args: { staffId: v.id("users"), employmentStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const user = await staffOrThrow(ctx, args.staffId);

    if (user._id === actor.userId && args.employmentStatus !== "active") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot deactivate your own account.",
      });
    }

    if (user.employmentStatus === args.employmentStatus) return null;

    await ctx.db.patch("users", user._id, { employmentStatus: args.employmentStatus });
    await recordAudit(ctx, {
      actor,
      action: `staff.${args.employmentStatus}`,
      entityTable: "users",
      entityId: user._id,
      summary: `${user.firstName} ${user.lastName}`,
    });
    return null;
  },
});
