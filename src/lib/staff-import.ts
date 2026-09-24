/**
 * Reading a staff roster out of a spreadsheet.
 *
 * The counterpart to `csv.ts`, which is the app's only *export* path and is
 * deliberately write-only. This is the only import path, and it is deliberately
 * read-only: it turns a file into rows and decides nothing about whether those
 * rows may be created. That judgement is the server's, in
 * `convex/lib/staffImport.ts`, so the preview an admin approves and the import
 * that runs cannot disagree.
 *
 * Pure on purpose — no DOM, no React — because `vitest.config.ts` runs
 * `src/lib/**` under `edge-runtime`. The one impure part, reading the bytes out
 * of a `File`, lives in `readStaffFile` at the bottom and is the thin edge.
 */

/** One row as it appeared in the sheet, before anything judges it. */
export type ParsedStaffRow = {
  /**
   * The line the admin sees in Excel: 1 is the header, so data starts at 2.
   * Carried so every later message can say "row 12" and mean their row.
   */
  line: number;
  honorific: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  jobTitle: string;
  accessRole: string;
  phase: string;
};

export type ParseResult = {
  rows: ParsedStaffRow[];
  /** Headers that were present but not recognised. Ignored, never fatal. */
  ignoredColumns: string[];
  /** Set when the file could not be read as a sheet at all. */
  error: string | null;
};

/**
 * The columns an import understands, and the header spellings accepted for each.
 *
 * Matching is case- and punctuation-insensitive (see `headerKey`), so "First
 * Name", "firstname" and "FIRST_NAME" all land on the same field. A school's own
 * spreadsheet carries payroll numbers and phone columns this has no use for;
 * those are reported as ignored rather than refused, because refusing a file for
 * carrying extra information would make the feature useless against real data.
 */
const COLUMNS: Record<keyof Omit<ParsedStaffRow, "line">, string[]> = {
  honorific: ["honorific", "title"],
  firstName: ["firstname", "first", "givenname", "name"],
  lastName: ["lastname", "last", "surname", "familyname"],
  preferredName: ["preferredname", "knownas", "nickname"],
  email: ["email", "emailaddress", "workemail"],
  jobTitle: ["jobtitle", "job", "position", "role", "designation"],
  accessRole: ["accessrole", "access", "permission", "systemrole", "userrole"],
  phase: ["phase", "phasename", "department", "grade"],
};

/** Normalised header for matching: lowercase, letters and digits only. */
function headerKey(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Split one CSV document into rows of cells, per RFC 4180.
 *
 * Hand-rolled rather than pulled from a package: the grammar is small, the
 * whole of it is exercised by the tests beside this file, and a dependency that
 * parses untrusted text is a dependency worth not having.
 *
 * Handles quoted fields, `""` as an escaped quote, commas and newlines inside
 * quotes, and both `\n` and `\r\n`. Strips a leading BOM, which matters because
 * `downloadCsv` *writes* one — so a template this app produced would otherwise
 * come back with a first header of `\uFEFFFirst name` and match nothing.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        // A doubled quote is one literal quote; a lone one closes the field.
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair rather than emitting a blank row.
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  // The last row has no terminator unless the file ends with a newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/** A cell from any source, rendered as trimmed text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/**
 * Map a sheet's rows onto staff fields.
 *
 * Shared by both formats, because once a `.xlsx` is unzipped it is the same
 * shape a CSV parses to: a header row and rows of cells.
 */
export function rowsToStaff(table: unknown[][]): ParseResult {
  const headerRow = table.find((row) => row.some((cell) => cellText(cell).length > 0));
  if (headerRow === undefined) {
    return { rows: [], ignoredColumns: [], error: "That file has no rows in it." };
  }

  const headers = headerRow.map((cell) => headerKey(cellText(cell)));
  const indexOf: Partial<Record<keyof Omit<ParsedStaffRow, "line">, number>> = {};
  const matched = new Set<number>();

  for (const [field, spellings] of Object.entries(COLUMNS)) {
    const at = headers.findIndex((header) => spellings.includes(header));
    if (at === -1) continue;
    indexOf[field as keyof typeof indexOf] = at;
    matched.add(at);
  }

  if (indexOf.email === undefined) {
    return {
      rows: [],
      ignoredColumns: [],
      error:
        "No email column found. The first row must name the columns — download the template to see the ones this expects.",
    };
  }

  const ignoredColumns = headerRow
    .map((cell, at) => ({ label: cellText(cell), at }))
    .filter(({ label, at }) => label.length > 0 && !matched.has(at))
    .map(({ label }) => label);

  const headerAt = table.indexOf(headerRow);
  const rows: ParsedStaffRow[] = [];

  for (let i = headerAt + 1; i < table.length; i++) {
    const raw = table[i];
    // A blank line in the middle of a sheet is a spacer, not an error. Excel
    // also pads exports with trailing empty rows.
    if (raw.every((cell) => cellText(cell).length === 0)) continue;

    const at = (field: keyof typeof indexOf) => {
      const column = indexOf[field];
      return column === undefined ? "" : cellText(raw[column]);
    };

    rows.push({
      // +1 because sheets are 1-indexed, so the header is line 1.
      line: i + 1,
      honorific: at("honorific"),
      firstName: at("firstName"),
      lastName: at("lastName"),
      preferredName: at("preferredName"),
      email: at("email"),
      jobTitle: at("jobTitle"),
      accessRole: at("accessRole"),
      phase: at("phase"),
    });
  }

  return { rows, ignoredColumns, error: null };
}

/** The columns the downloadable template carries, in order. */
export const TEMPLATE_HEADERS = [
  "Honorific",
  "First name",
  "Last name",
  "Preferred name",
  "Email",
  "Job title",
  "Access role",
  "Phase",
];

/** Whether this app will try to read the file at all. */
export function isSupportedSheet(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".csv") || lower.endsWith(".xlsx");
}

/**
 * Read a picked file into rows.
 *
 * The first client-side file-content read in the codebase — everything else
 * hands an opaque `File` to R2 without looking inside it.
 *
 * `read-excel-file` is imported lazily so its unzipper and XML parser are not
 * in the bundle every admin downloads to look at the staff list; they load when
 * somebody actually picks a `.xlsx`. It replaces the more obvious `xlsx`
 * (SheetJS), whose npm package has been frozen at 0.18.5 since March 2022.
 */
export async function readStaffFile(file: File): Promise<ParseResult> {
  if (!isSupportedSheet(file.name)) {
    return { rows: [], ignoredColumns: [], error: "Only .csv and .xlsx files can be imported." };
  }

  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      return rowsToStaff(parseCsv(await file.text()));
    }
    // Two things differ from this package's older documentation, both
    // load-bearing. It publishes no "." export at all — only /browser, /node,
    // /universal and /web-worker — so the bare name fails to resolve at build
    // time. And since v9 the default export returns the *list of sheets*; it
    // is `readSheet` that returns rows, defaulting to the first one. That
    // default is what we want anyway: a workbook's later tabs are working
    // notes far more often than they are more staff.
    const { readSheet } = await import("read-excel-file/browser");
    return rowsToStaff(await readSheet(file));
  } catch (caught) {
    return {
      rows: [],
      ignoredColumns: [],
      error:
        caught instanceof Error
          ? `That file could not be read: ${caught.message}`
          : "That file could not be read.",
    };
  }
}
