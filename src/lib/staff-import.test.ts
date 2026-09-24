import { describe, expect, test } from "vitest";

import { parseCsv, rowsToStaff } from "./staff-import";

/**
 * Reading a school's own spreadsheet.
 *
 * Worth testing because the input is the one thing here nobody controls: a real
 * roster arrives with quoted job titles, surnames carrying commas, blank spacer
 * rows, and a byte-order mark this app's own export puts there. Every case
 * below is one of those, not a synthetic grammar exercise.
 */

describe("CSV parsing", () => {
  test("a quoted field keeps its comma instead of splitting the row", () => {
    const rows = parseCsv('a,"Safeguarding, Reporting & Referral",c');
    expect(rows).toEqual([["a", "Safeguarding, Reporting & Referral", "c"]]);
  });

  test("a doubled quote is one literal quote", () => {
    const rows = parseCsv('name,note\nAda,"she said ""hello"" once"');
    expect(rows[1]).toEqual(["Ada", 'she said "hello" once']);
  });

  test("a newline inside quotes stays in the field", () => {
    const rows = parseCsv('name,address\nAda,"12 Long Street\nCape Town"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("12 Long Street\nCape Town");
  });

  test("CRLF is one row break, not two", () => {
    // What Excel writes, and what this app's own `toCsv` writes.
    const rows = parseCsv("a,b\r\nc,d\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  test("a leading BOM is stripped, so a round-tripped template still matches", () => {
    // `downloadCsv` prepends \uFEFF. Without stripping it the first header
    // would read "\uFEFFEmail" and match no column at all.
    const rows = parseCsv("\uFEFFEmail,First name\nada@x.co.za,Ada");
    expect(rows[0][0]).toBe("Email");
  });

  test("an empty field is empty, never the string undefined", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });

  test("a trailing newline does not invent a blank row", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
  });
});

describe("mapping a sheet onto staff", () => {
  const header = ["First Name", "Last Name", "Email", "Job Title", "Phase"];

  test("headers match whatever the school called them", () => {
    // Case, spacing and punctuation all differ from the template's spelling.
    const result = rowsToStaff([
      ["FIRST_NAME", "surname", "E-mail Address", "Position", "Department"],
      ["Ada", "Abbott", "ada@x.co.za", "Teacher", "Foundation Phase"],
    ]);
    expect(result.error).toBeNull();
    expect(result.rows[0]).toMatchObject({
      firstName: "Ada",
      lastName: "Abbott",
      email: "ada@x.co.za",
      jobTitle: "Teacher",
      phase: "Foundation Phase",
    });
  });

  test("the line number is the one the admin sees in Excel", () => {
    const result = rowsToStaff([
      header,
      ["Ada", "Abbott", "ada@x.co.za", "Teacher", "Foundation"],
      ["Bob", "Baker", "bob@x.co.za", "Teacher", "Senior"],
    ]);
    // Header is line 1, so the first person is line 2.
    expect(result.rows.map((row) => row.line)).toEqual([2, 3]);
  });

  test("columns the school keeps for itself are ignored, not fatal", () => {
    const result = rowsToStaff([
      [...header, "Payroll number", "Cell"],
      ["Ada", "Abbott", "ada@x.co.za", "Teacher", "Foundation", "884412", "082 000 0000"],
    ]);
    expect(result.error).toBeNull();
    expect(result.ignoredColumns).toEqual(["Payroll number", "Cell"]);
    expect(result.rows).toHaveLength(1);
  });

  test("blank spacer rows are skipped", () => {
    const result = rowsToStaff([
      header,
      ["Ada", "Abbott", "ada@x.co.za", "Teacher", "Foundation"],
      ["", "", "", "", ""],
      ["Bob", "Baker", "bob@x.co.za", "Teacher", "Senior"],
    ]);
    expect(result.rows.map((row) => row.firstName)).toEqual(["Ada", "Bob"]);
    // The gap does not renumber anybody: Bob is still on line 4.
    expect(result.rows[1].line).toBe(4);
  });

  test("a ragged row missing trailing cells reads as empty, not as a crash", () => {
    const result = rowsToStaff([header, ["Ada", "Abbott", "ada@x.co.za"]]);
    expect(result.rows[0].jobTitle).toBe("");
    expect(result.rows[0].phase).toBe("");
  });

  test("cells are trimmed, because a spreadsheet is full of stray spaces", () => {
    const result = rowsToStaff([header, ["  Ada ", "Abbott", " ada@x.co.za ", "Teacher", "F"]]);
    expect(result.rows[0].firstName).toBe("Ada");
    expect(result.rows[0].email).toBe("ada@x.co.za");
  });

  test("a file with no email column is refused, and says how to fix it", () => {
    const result = rowsToStaff([
      ["First Name", "Last Name"],
      ["Ada", "Abbott"],
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.error).toMatch(/email column/i);
  });

  test("an empty file is refused rather than importing nothing silently", () => {
    expect(rowsToStaff([]).error).toMatch(/no rows/i);
    expect(rowsToStaff([["", ""]]).error).toMatch(/no rows/i);
  });

  test("numbers and dates from a spreadsheet become text", () => {
    // read-excel-file returns typed cells: a job title of "2024" comes back as
    // a number, and a stray date cell as a Date.
    const result = rowsToStaff([
      ["Email", "Job Title"],
      ["ada@x.co.za", 2024],
    ]);
    expect(result.rows[0].jobTitle).toBe("2024");
  });
});
