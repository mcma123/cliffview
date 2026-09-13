import { describe, expect, test } from "vitest";

import { csvFileName, toCsv } from "./csv";

/**
 * The only place a compliance report can corrupt itself silently.
 *
 * A field carrying a comma that is not quoted does not fail — it shifts every
 * column after it by one and still opens cleanly in Excel, which is how a
 * plausible-looking spreadsheet ends up attached to a submission with the wrong
 * numbers under the wrong headings.
 */

describe("CSV serialisation", () => {
  test("plain values are written bare", () => {
    expect(toCsv({ headers: ["a", "b"], rows: [[1, "two"]] })).toBe("a,b\r\n1,two\r\n");
  });

  test("a comma is quoted, so the column does not split", () => {
    // A real module title: "Safeguarding, Reporting & Referral".
    const csv = toCsv({ headers: ["title"], rows: [["Safeguarding, Reporting"]] });
    expect(csv).toBe('title\r\n"Safeguarding, Reporting"\r\n');
  });

  test("a quote is doubled and the field wrapped", () => {
    const csv = toCsv({ headers: ["title"], rows: [['The "Big" Module']] });
    expect(csv).toBe('title\r\n"The ""Big"" Module"\r\n');
  });

  test("a newline stays inside one field", () => {
    const csv = toCsv({ headers: ["note"], rows: [["line one\nline two"]] });
    expect(csv).toBe('note\r\n"line one\nline two"\r\n');
  });

  test("null is an empty field, never the word null", () => {
    // Null means "not applicable" — a module nobody has been scored on. Writing
    // 0 would assert a failing average nobody earned; writing "null" would be
    // read as text by every spreadsheet.
    expect(toCsv({ headers: ["score"], rows: [[null]] })).toBe("score\r\n\r\n");
  });

  test("zero is preserved, and is not confused with null", () => {
    expect(toCsv({ headers: ["a", "b"], rows: [[0, null]] })).toBe("a,b\r\n0,\r\n");
  });

  test("an empty table still carries its headings", () => {
    expect(toCsv({ headers: ["a", "b"], rows: [] })).toBe("a,b\r\n");
  });
});

describe("file naming", () => {
  test("the file is dated, because a report is a snapshot", () => {
    // 13 September 2026, local time.
    const at = new Date(2026, 8, 13, 10, 30).getTime();
    expect(csvFileName("module-coverage", at)).toBe("cliffview-module-coverage-2026-09-13.csv");
  });

  test("single-digit months and days are padded", () => {
    const at = new Date(2026, 0, 5, 10, 30).getTime();
    expect(csvFileName("staff-compliance", at)).toBe("cliffview-staff-compliance-2026-01-05.csv");
  });
});
