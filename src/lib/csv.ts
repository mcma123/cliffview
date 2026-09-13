/**
 * CSV export — the only path by which data leaves this app as a file.
 *
 * A compliance report is worth little if it cannot be attached to a submission,
 * so the tables on the Reports page download as spreadsheets. Both halves come
 * from the same view-model the screen renders, which is the one property an
 * export has to have: the file and the page can never disagree.
 */

export type CsvCell = string | number | null;

export type CsvTable = {
  headers: string[];
  rows: CsvCell[][];
};

/**
 * RFC 4180 serialisation.
 *
 * The quoting is the whole job. A module titled "Safeguarding, Reporting" or a
 * job title containing a quotation mark would otherwise split a column and
 * silently shift every field after it — a corrupted report that still opens
 * cleanly, which is the worst kind.
 *
 * `null` becomes an empty field. It means "not applicable" here — a module
 * nobody has been scored on — and writing `0` would assert a failing average
 * that nobody earned.
 */
export function toCsv(table: CsvTable): string {
  const lines = [table.headers, ...table.rows].map((row) => row.map(escapeCell).join(","));
  // A trailing newline: POSIX tools treat a file without one as truncated.
  return `${lines.join("\r\n")}\r\n`;
}

function escapeCell(cell: CsvCell): string {
  if (cell === null) return "";
  const text = String(cell);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/** `cliffview-module-coverage-2026-09-13.csv` — dated, because a report is a snapshot. */
export function csvFileName(base: string, now: number): string {
  const date = new Date(now);
  const stamp = [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
  return `cliffview-${base}-${stamp}.csv`;
}

/**
 * Hand the file to the browser.
 *
 * The BOM is not decoration: without it Excel reads a UTF-8 CSV as the local
 * codepage, and a staff list containing "Naidoo" or "van Wyk" with any accent
 * arrives mojibaked in the one document that is meant to be authoritative.
 *
 * The object URL is revoked immediately after the click. A blob URL pins its
 * blob in memory for the lifetime of the document, so exporting repeatedly
 * without this leaks the whole report each time.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
