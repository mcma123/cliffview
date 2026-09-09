/**
 * Month-key helpers.
 *
 * `monthKey` is a sortable "YYYY-MM" string, which is what makes the six-month
 * trend a single index range scan instead of six point reads or a count over an
 * event log.
 *
 * Every function here takes an explicit timestamp. Queries must never read the
 * wall clock: a query is not rerun merely because time advanced, so a result
 * derived from `Date.now()` can go stale, and it also defeats query-cache
 * reuse. Loaders pass `now` in as an argument. `Date.now()` is fine inside
 * mutations and actions.
 */

/** "2026-05" for the month containing `ms` (UTC). */
export function monthKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}`;
}

/**
 * The `count` month keys ending with the month containing `ms`, oldest first.
 * `monthKeysBack(now, 6)` gives the trend window.
 */
export function monthKeysBack(ms: number, count: number): string[] {
  const d = new Date(ms);
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
    keys.push(monthKeyFromMs(shifted.getTime()));
  }
  return keys;
}

/** Inclusive lower bound for a range scan over `by_monthKey`. */
export function earliestMonthKey(ms: number, count: number): string {
  return monthKeysBack(ms, count)[0];
}
