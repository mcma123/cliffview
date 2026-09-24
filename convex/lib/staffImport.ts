import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { MAX_PHASES, MAX_STAFF } from "./counts";

/**
 * Judging a spreadsheet row before it becomes a person.
 *
 * Lives here, server-side, because the preview and the import must reach the
 * same verdict. If the browser decided what was importable and the mutation
 * decided again, the admin would be approving one judgement and getting
 * another — and the mutation has to re-judge anyway, since a client can send
 * whatever it likes.
 *
 * The rules mirror `staff.create`'s: `cleanProfileInput` for the three required
 * names, `cleanEmail`'s `.trim().toLowerCase()` plus an `@`, and
 * `assertAssignableRole` for the role. They are restated rather than called
 * because those throw on the first bad value — correct for one form submission,
 * useless for a file where the point is to report every bad row at once.
 */

/** One row as the sheet gave it. Matches `ParsedStaffRow` in `src/lib/staff-import.ts`. */
export const importRow = v.object({
  line: v.number(),
  honorific: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.string(),
  email: v.string(),
  jobTitle: v.string(),
  accessRole: v.string(),
  phase: v.string(),
});

export const rowVerdict = v.object({
  line: v.number(),
  name: v.string(),
  email: v.string(),
  /**
   * `ready` will be created. `skipped` is already on the system and is left
   * alone. `invalid` cannot be created and says why.
   */
  outcome: v.union(v.literal("ready"), v.literal("skipped"), v.literal("invalid")),
  reason: v.union(v.string(), v.null()),
});

export type RowVerdict = {
  line: number;
  name: string;
  email: string;
  outcome: "ready" | "skipped" | "invalid";
  reason: string | null;
  /** Only on a `ready` row: everything needed to insert it. */
  insert: {
    honorific?: string;
    firstName: string;
    lastName: string;
    preferredName?: string;
    email: string;
    jobTitle: string;
    accessRole: "staff" | "smt_admin";
    phaseId: Id<"phases">;
  } | null;
};

/** Role spellings a school might reasonably type. Never `super_admin`. */
function readRole(raw: string): "staff" | "smt_admin" | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (key.length === 0 || key === "staff" || key === "teacher") return "staff";
  if (key === "admin" || key === "smtadmin" || key === "administrator") return "smt_admin";
  return null;
}

/** The same normalisation `cleanEmail` applies, so the uniqueness probe matches. */
function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Judge every row against the database and against the rest of the file.
 *
 * Read-only, so the preview query and the import mutation can both call it and
 * the import can then insert exactly the rows it reported as ready.
 */
export async function validateImportRows(
  ctx: QueryCtx,
  rows: Array<{
    line: number;
    honorific: string;
    firstName: string;
    lastName: string;
    preferredName: string;
    email: string;
    jobTitle: string;
    accessRole: string;
    phase: string;
  }>,
): Promise<RowVerdict[]> {
  const phaseRows = await ctx.db.query("phases").withIndex("by_order").take(MAX_PHASES);
  // Matched by name because a spreadsheet carries names, not ids. Only active
  // phases are offered: `staff.create` would accept a retired one, but the
  // create form never offers it, and an import is not the place to start
  // putting new people somewhere the UI cannot show.
  const activePhases = phaseRows.filter((phase) => phase.isActive);
  const phaseByName = new Map(
    activePhases.map((phase) => [phase.name.trim().toLowerCase(), phase]),
  );
  const phaseList = activePhases.map((phase) => phase.name).join(", ");

  // Addresses already used, and the line that first claimed each one in this
  // file. `cleanEmail` only ever checks the database, so a file containing the
  // same person twice is a case nothing else in the codebase covers.
  const seenInFile = new Map<string, number>();
  const verdicts: RowVerdict[] = [];

  for (const row of rows) {
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    const jobTitle = row.jobTitle.trim();
    const email = normaliseEmail(row.email);
    const name = `${firstName} ${lastName}`.trim();

    const invalid = (reason: string): RowVerdict => ({
      line: row.line,
      name: name.length === 0 ? email : name,
      email,
      outcome: "invalid",
      reason,
      insert: null,
    });

    if (email.length === 0) {
      verdicts.push(invalid("No email address."));
      continue;
    }
    if (!email.includes("@")) {
      verdicts.push(invalid(`"${row.email.trim()}" is not an email address.`));
      continue;
    }
    if (firstName.length === 0) {
      verdicts.push(invalid("No first name."));
      continue;
    }
    if (lastName.length === 0) {
      verdicts.push(invalid("No last name."));
      continue;
    }
    if (jobTitle.length === 0) {
      verdicts.push(invalid("No job title."));
      continue;
    }

    const role = readRole(row.accessRole);
    if (role === null) {
      verdicts.push(invalid(`"${row.accessRole.trim()}" is not a role. Use staff or admin.`));
      continue;
    }

    const phaseKey = row.phase.trim().toLowerCase();
    if (phaseKey.length === 0) {
      verdicts.push(invalid(`No phase. Use one of: ${phaseList}.`));
      continue;
    }
    const phase = phaseByName.get(phaseKey);
    if (phase === undefined) {
      verdicts.push(invalid(`"${row.phase.trim()}" is not a phase. Use one of: ${phaseList}.`));
      continue;
    }

    const duplicateOf = seenInFile.get(email);
    if (duplicateOf !== undefined) {
      verdicts.push(invalid(`Same email as row ${duplicateOf}.`));
      continue;
    }

    const existing = await existingByEmail(ctx, email);
    if (existing !== null) {
      verdicts.push({
        line: row.line,
        name,
        email,
        outcome: "skipped",
        reason: "Already on the system.",
        insert: null,
      });
      // Still claimed, so a third copy of the same address in the file reports
      // as a duplicate of this line rather than as another skip.
      seenInFile.set(email, row.line);
      continue;
    }

    seenInFile.set(email, row.line);
    const honorific = row.honorific.trim();
    const preferredName = row.preferredName.trim();
    verdicts.push({
      line: row.line,
      name,
      email,
      outcome: "ready",
      reason: null,
      insert: {
        ...(honorific.length === 0 ? {} : { honorific }),
        firstName,
        lastName,
        ...(preferredName.length === 0 ? {} : { preferredName }),
        email,
        jobTitle,
        accessRole: role,
        phaseId: phase._id,
      },
    });
  }

  return verdicts;
}

/**
 * The staff row holding an address, if any.
 *
 * Deliberately not `.unique()`, which `cleanEmail` uses and which **throws**
 * when two rows already share an address. That is the right shape for a form
 * — one refusal, loudly — but here it would turn one pre-existing data problem
 * into an import that reports nothing about any of its rows.
 */
async function existingByEmail(ctx: QueryCtx, email: string): Promise<Doc<"users"> | null> {
  const matches = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(1);
  return matches[0] ?? null;
}

/** The most rows one import may carry, matching the cap on the directory itself. */
export const MAX_IMPORT_ROWS = MAX_STAFF;
