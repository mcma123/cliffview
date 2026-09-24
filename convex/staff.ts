import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { recordAudit } from "./lib/audit";
import { requireAdmin } from "./lib/authz";
import { MAX_MODULES, MAX_PHASES, MAX_STAFF } from "./lib/counts";
import {
  assignableStaff,
  enrollmentTotals,
  grantModules,
  publishedModules,
  recomputeCompliance,
} from "./lib/enrollment";
import {
  MAX_IMPORT_ROWS,
  type RowVerdict,
  importRow,
  rowVerdict,
  validateImportRows,
} from "./lib/staffImport";
import { hasPasswordAccount } from "./invites";
import { rekeyPasswordAccount } from "./lib/credentials";
import { revokeLiveInvites } from "./lib/invites";
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
    /**
     * The denominator a bulk assign would use.
     *
     * The table shows "3 / 5" per person but had no idea how many modules
     * exist, so the screen could not say what "all modules" means before an
     * admin commits to it.
     */
    publishedModuleCount: v.number(),
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

    return {
      staff,
      phases: phaseRows.filter((phase) => phase.isActive),
      publishedModuleCount: (await publishedModules(ctx)).length,
    };
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
    /**
     * Whether this person can sign in yet, and the state of their invitation.
     *
     * Derived, never stored: `hasPassword` is a lookup in `authAccounts` and
     * the label is computed in the presenter from `inviteExpiresAt` and the
     * route's `now`, because a query may not read the clock.
     */
    credential: v.object({
      hasPassword: v.boolean(),
      inviteExpiresAt: v.union(v.number(), v.null()),
      invitable: v.boolean(),
    }),
    /**
     * Every non-archived module, in sequence order, so the assign picker can
     * offer the whole catalogue without a second round trip. Already-enrolled
     * modules stay in the list: the presenter marks them assigned rather than
     * hiding them, because a picker that silently drops rows reads as a bug.
     */
    catalog: v.array(schema.doc("modules")),
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

    const catalog = await ctx.db.query("modules").withIndex("by_sequence").take(MAX_MODULES);

    const hasPassword = await hasPasswordAccount(ctx, user._id);
    const liveInvite = await ctx.db
      .query("staffInvites")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_MODULES);
    // The newest invitation that has been neither spent nor superseded. Its
    // expiry is returned raw so the presenter can decide what to call it.
    const pending = liveInvite
      .filter((row) => row.consumedAt === undefined && row.revokedAt === undefined)
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];

    return {
      credential: {
        hasPassword,
        inviteExpiresAt: pending?.expiresAt ?? null,
        // Mirrors what `invites.prepare` will allow, so the screen does not
        // offer a button the server is about to refuse.
        invitable:
          !hasPassword && user.accessRole === "staff" && user.employmentStatus === "active",
      },
      user,
      phaseName: phase?.name ?? "Unassigned",
      phases: phaseRows.filter((row) => row.isActive),
      modules,
      // Archived content is retired, so it is not offered. Drafts are kept in
      // the list on purpose — `assignModules` refuses them, and the picker
      // shows why, which beats a module quietly missing from the catalogue.
      catalog: catalog.filter((row) => row.publishState !== "archived"),
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a staff profile and invite them.
 *
 * This still does **not** create a login. `users` is both the staff list and
 * Convex Auth's user table, and `createOrUpdateUser` links an account to a row
 * that already exists — so this row is what later lets that person sign up at
 * all, and until they redeem an invitation they simply have no credentials.
 * That is the whole reason nobody can self-register into the school.
 *
 * What is new is that the invitation is now the *only* way a teacher gets a
 * password, so creating one has to send it. Delivery is scheduled rather than
 * inlined: `ctx.scheduler.runAfter` is transactional, so a rolled-back create
 * cancels the send and nobody is emailed about a profile that does not exist,
 * while a mail outage cannot roll back the profile. Hashing also needs an
 * action, which a mutation cannot be.
 *
 * Admins are deliberately not invited by email — `smt_admin` still claims its
 * password through the operator window in `internal.auth.allowAdminClaim`,
 * because a seven-day emailed link to an admin row is a takeover path.
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

    if (args.accessRole === "staff") {
      await ctx.scheduler.runAfter(0, internal.invites.deliver, {
        userId: staffId,
        invitedBy: actor.userId,
        email,
        firstName: clean.firstName!,
        invitedByName: `${actor.user.firstName} ${actor.user.lastName}`,
      });
    }

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

    // An address is two facts in two tables. `users.email` is what this app
    // resolves a sign-in against; `authAccounts.providerAccountId` is what
    // Convex Auth resolves it against, and it runs first. Moving one without
    // the other locked the person out under their new address while leaving
    // the old one working — and the old one skips every refusal in
    // `createOrUpdateUser`, including the deactivated-account one. So both move
    // here, in the same transaction as the profile write.
    //
    // Only on a real change: re-keying on a no-op edit would revoke a live
    // invitation somebody is part-way through redeeming.
    const emailChanged = email !== undefined && email !== user.email;
    if (emailChanged) {
      await rekeyPasswordAccount(ctx, user._id, email);
      // Already dead in effect — `classifyInvite` refuses a link whose address
      // no longer matches the profile — so this only makes the revocation
      // explicit and stamped rather than silent.
      await revokeLiveInvites(ctx, user._id);
    }

    // Cheap, and it means a stored compliance figure can never drift away from
    // the rows behind it without somebody noticing on the next edit.
    await recomputeCompliance(ctx, user._id);

    await recordAudit(ctx, {
      actor,
      action: "staff.update",
      entityTable: "users",
      entityId: user._id,
      summary: emailChanged
        ? `${clean.firstName ?? user.firstName} ${clean.lastName ?? user.lastName} — email ${user.email} to ${email}`
        : `${clean.firstName ?? user.firstName} ${clean.lastName ?? user.lastName}`,
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

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

/**
 * Assign modules to a staff member.
 *
 * An enrollment row *is* the assignment — there is no separate join, which is
 * why this is the only way a module reaches somebody's tracker outside the
 * seed. It is idempotent: re-assigning a module a person already has is a
 * no-op rather than a second row, so "select all" is safe to press twice and
 * cannot produce two enrollments the compliance mean would then count twice.
 *
 * Only published modules can be assigned. A draft is unfinished content, and
 * an enrollment in one both puts a person on the hook for work they cannot do
 * and makes the module undeletable — `modules.remove` refuses once anyone is
 * enrolled. Publish it first; the picker says so.
 */
export const assignModules = mutation({
  args: {
    staffId: v.id("users"),
    moduleIds: v.array(v.id("modules")),
    /** Optional deadline, stored on each new enrollment. */
    dueAt: v.optional(v.number()),
  },
  returns: v.object({
    /** New enrollment rows written. */
    assigned: v.number(),
    /** Modules the person already had, left untouched. */
    alreadyAssigned: v.number(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const user = await staffOrThrow(ctx, args.staffId);

    // Duplicates within one call would otherwise race past the existence check
    // below and write the same module twice.
    const moduleIds = [...new Set(args.moduleIds)];
    if (moduleIds.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "Pick at least one module to assign." });
    }
    if (moduleIds.length > MAX_MODULES) {
      throw new ConvexError({
        code: "INVALID",
        message: `You cannot assign more than ${MAX_MODULES} modules at once.`,
      });
    }

    // Validate the whole set before writing anything. A draft aborts the
    // transaction, so a half-applied selection is not reachable.
    for (const moduleId of moduleIds) {
      const module = await ctx.db.get("modules", moduleId);
      if (module === null) {
        throw new ConvexError({ code: "INVALID", message: "That module no longer exists." });
      }
      if (module.publishState !== "published") {
        throw new ConvexError({
          code: "NOT_PUBLISHED",
          message: `"${module.title}" is not published yet, so it cannot be assigned. Publish it first.`,
        });
      }
    }

    // The insert itself is shared with the bulk path, so there is one place a
    // row is created and one place compliance is recomputed after it. Assigning
    // work lowers compliance, because compliance is the mean of what somebody
    // has been given: a person with one finished module out of one is not as
    // compliant as the school needs once eight more land on them.
    const { assigned, alreadyAssigned } = await grantModules(
      ctx,
      user._id,
      moduleIds,
      Date.now(),
      args.dueAt,
    );

    await recordAudit(ctx, {
      actor,
      action: "staff.assignModules",
      entityTable: "users",
      entityId: user._id,
      summary: `${user.firstName} ${user.lastName}: ${assigned} assigned, ${alreadyAssigned} already had`,
    });

    return { assigned, alreadyAssigned };
  },
});

/**
 * Remove an assignment.
 *
 * Only for one nobody has touched. Once a person has opened a module the
 * enrollment is their training record, and deleting it would erase a score and
 * a completion the school may have to produce later — the same reason
 * `setEmploymentStatus` deactivates rather than deletes, and the same reason
 * `modules.remove` refuses a module with enrollments. Undoing a mis-click is
 * what this is for.
 */
export const unassignModule = mutation({
  args: { staffId: v.id("users"), moduleId: v.id("modules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const user = await staffOrThrow(ctx, args.staffId);

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_userId_and_moduleId", (q) =>
        q.eq("userId", user._id).eq("moduleId", args.moduleId),
      )
      .unique();
    if (enrollment === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That module is not assigned to this staff member.",
      });
    }

    const untouched =
      enrollment.status === "not_started" &&
      enrollment.progressPercent === 0 &&
      enrollment.score === undefined &&
      enrollment.startedAt === undefined;

    // Lesson progress is its own table, so an enrollment can read as untouched
    // while the person has in fact opened lessons. Checking both is what keeps
    // "untouched" true rather than merely plausible.
    const touchedLessons =
      untouched &&
      (
        await ctx.db
          .query("lessonProgress")
          .withIndex("by_userId_and_moduleId", (q) =>
            q.eq("userId", user._id).eq("moduleId", args.moduleId),
          )
          .take(1)
      ).length > 0;

    if (!untouched || touchedLessons) {
      throw new ConvexError({
        code: "IN_PROGRESS",
        message:
          "This staff member has already started the module, so the assignment is part of their training record and cannot be removed.",
      });
    }

    await ctx.db.delete("enrollments", enrollment._id);
    await recomputeCompliance(ctx, user._id);

    await recordAudit(ctx, {
      actor,
      action: "staff.unassignModule",
      entityTable: "users",
      entityId: user._id,
      summary: `${user.firstName} ${user.lastName}: removed ${args.moduleId}`,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// School-wide assignment
// ---------------------------------------------------------------------------

/**
 * Give every active member of staff every published module.
 *
 * The one-by-one alternative is the reason this exists: open a profile, open
 * the picker, tick, save, go back, repeat. What that produces in practice is a
 * half-assigned school, and somebody nobody got to reads as 0% compliant —
 * indistinguishable on the dashboard from somebody who has done nothing.
 *
 * **Why this schedules instead of looping.** Per person the work is one
 * existence read plus one insert per module, plus a compliance recompute that
 * re-reads their whole tracker. At the caps this file already honours —
 * `MAX_STAFF` 500 by `MAX_MODULES` 200 — that is hundreds of thousands of
 * document touches, far past one Convex transaction. It would run fine today
 * on six people and ten modules and then fail on a real secondary school, with
 * a transaction-limit error nobody could act on. So the continuation is
 * scheduled per staff member, which is bounded by the catalogue however large
 * the school gets.
 *
 * The consequence, stated rather than hidden: this is **not atomic**. A failure
 * part-way leaves earlier staff assigned and later ones not. That is safe here
 * because granting is additive and idempotent — running it again finishes the
 * job instead of doubling anything — and it is the trade the scheduler
 * guidance in `_generated/ai/guidelines.md` asks for.
 */
export const assignAllModules = mutation({
  args: {},
  returns: v.object({
    staffCount: v.number(),
    moduleCount: v.number(),
  }),
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);

    const modules = await publishedModules(ctx);
    if (modules.length === 0) {
      // A button that silently does nothing reads as broken. Name the reason.
      throw new ConvexError({
        code: "NOTHING_TO_ASSIGN",
        message: "There are no published modules yet. Publish one first.",
      });
    }

    const staff = await assignableStaff(ctx);
    if (staff.length === 0) {
      throw new ConvexError({
        code: "NOTHING_TO_ASSIGN",
        message: "There are no active staff to assign modules to.",
      });
    }

    const moduleIds = modules.map((module) => module._id);
    const staffIds = staff.map((user) => user._id);

    // One row for the decision, not one per person. A 500-strong school would
    // otherwise write 500 audit rows for a single click, burying every other
    // entry in the log.
    await recordAudit(ctx, {
      actor,
      action: "staff.assignAllModules",
      entityTable: "users",
      entityId: "all",
      summary: `${modules.length} published modules to ${staff.length} active staff`,
    });

    await ctx.scheduler.runAfter(0, internal.staff.assignAllStep, {
      moduleIds,
      staffIds,
      index: 0,
    });

    return { staffCount: staff.length, moduleCount: modules.length };
  },
});

/**
 * One staff member's share of a school-wide assignment, then the next.
 *
 * `internalMutation`, so it is unreachable from any client: it does no
 * authorization of its own, having been gated once by the mutation that
 * scheduled it, and an exposed version would let anyone assign anything.
 *
 * A person who was deleted or deactivated between one step and the next is
 * skipped rather than throwing — the alternative is a bulk action that dies
 * part-way because somebody resigned while it ran.
 */
export const assignAllStep = internalMutation({
  args: {
    moduleIds: v.array(v.id("modules")),
    staffIds: v.array(v.id("users")),
    index: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.index >= args.staffIds.length) return null;

    const user = await ctx.db.get("users", args.staffIds[args.index]);
    if (user !== null && user.employmentStatus === "active" && !isOperator(user)) {
      await grantModules(ctx, user._id, args.moduleIds, Date.now());
    }

    if (args.index + 1 < args.staffIds.length) {
      await ctx.scheduler.runAfter(0, internal.staff.assignAllStep, {
        moduleIds: args.moduleIds,
        staffIds: args.staffIds,
        index: args.index + 1,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

/** Shared by the preview and the import, so both report the same shape. */
const importReport = {
  ready: v.number(),
  skipped: v.number(),
  invalid: v.number(),
  rows: v.array(rowVerdict),
};

/**
 * Judge a parsed spreadsheet without writing anything.
 *
 * The preview table renders this, so what an admin approves is the server's own
 * verdict rather than the browser's guess. The import then re-runs the same
 * check — a query result is not a promise about a later mutation, and somebody
 * could be created in between.
 */
export const importPreview = query({
  args: { rows: v.array(importRow) },
  returns: v.object(importReport),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.rows.length > MAX_IMPORT_ROWS) {
      throw new ConvexError({
        code: "TOO_MANY_ROWS",
        message: `That file has ${args.rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
      });
    }
    return summarise(await validateImportRows(ctx, args.rows));
  },
});

/**
 * Create every valid row, skip the ones already on the system.
 *
 * **No invitations are sent.** `staff.create` schedules `invites.deliver` for
 * every `staff`-role profile it makes, with no opt-out, so reusing it would
 * mail fifty people the moment a file was imported — including whoever is
 * behind the typo in row 12. Profiles are created quietly and invited later,
 * per person, through `invites.resend`, which already exists and is already
 * audited. This is why the import inserts directly rather than calling
 * `create`; the inserted shape is otherwise identical, including the four
 * server-set constants that are earned rather than assigned.
 *
 * One transaction, no scheduler continuation. At the `MAX_IMPORT_ROWS` cap the
 * work is one index probe and one insert per row, which fits comfortably —
 * unlike `assignAllModules`, where the cross-product of staff and modules does
 * not. So this import is atomic: a refusal leaves nothing half-created.
 */
export const importStaff = mutation({
  args: { rows: v.array(importRow) },
  returns: v.object(importReport),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    if (args.rows.length > MAX_IMPORT_ROWS) {
      throw new ConvexError({
        code: "TOO_MANY_ROWS",
        message: `That file has ${args.rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
      });
    }

    // Re-judged rather than trusting what the preview returned: the rows arrive
    // from a client, and the only thing standing between this and an arbitrary
    // row of `users` is this call.
    const verdicts = await validateImportRows(ctx, args.rows);

    for (const verdict of verdicts) {
      if (verdict.insert === null) continue;
      await ctx.db.insert("users", {
        ...verdict.insert,
        employmentStatus: "active",
        // Earned, never assigned — the same rule `create` follows. A new person
        // has no enrollments, so zero is the true figure, not a placeholder.
        cptdPoints: 0,
        xpTotal: 0,
        compliancePercent: 0,
      });
    }

    const report = summarise(verdicts);
    // One row for the import, not one per person: a 200-row file would
    // otherwise bury every other entry in the audit log.
    await recordAudit(ctx, {
      actor,
      action: "staff.importStaff",
      entityTable: "users",
      entityId: "import",
      summary: `${report.ready} created, ${report.skipped} already present, ${report.invalid} rejected`,
    });
    return report;
  },
});

/** Counts plus the per-row detail the screen lists. */
function summarise(verdicts: RowVerdict[]) {
  return {
    ready: verdicts.filter((row) => row.outcome === "ready").length,
    skipped: verdicts.filter((row) => row.outcome === "skipped").length,
    invalid: verdicts.filter((row) => row.outcome === "invalid").length,
    rows: verdicts.map(({ line, name, email, outcome, reason }) => ({
      line,
      name,
      email,
      outcome,
      reason,
    })),
  };
}
