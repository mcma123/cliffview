import { describe, expect, test } from "vitest";

import { BADGES, currentStreak, monthKeyOf, newlyEarnedBadges, xpForModule } from "./lib/awards";

/**
 * The award rules, tested as pure functions.
 *
 * These decide what a teacher is paid for their work, so they are worth
 * pinning independently of the mutation that calls them — no Convex harness,
 * no components, no database.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 11, 10, 0, 0);

const facts = (over: Partial<Parameters<typeof newlyEarnedBadges>[0]> = {}) => ({
  modulesCompleted: 0,
  modulesAssigned: 0,
  compliancePercent: 0,
  streakDays: 0,
  bestScorePercent: null,
  ...over,
});

describe("what work is worth", () => {
  test("a module pays out in proportion to its CPTD value", () => {
    expect(xpForModule({ cptdPoints: 2 })).toBe(200);
    expect(xpForModule({ cptdPoints: 0 })).toBe(0);
  });

  test("monthKey matches the YYYY-MM shape the rollups use", () => {
    expect(monthKeyOf(Date.UTC(2026, 0, 5))).toBe("2026-01");
    expect(monthKeyOf(Date.UTC(2026, 11, 31))).toBe("2026-12");
  });
});

describe("streaks", () => {
  test("no activity is no streak, not a streak of one", () => {
    expect(currentStreak([], NOW)).toBe(0);
  });

  test("today alone is a streak of one - everybody starts here", () => {
    expect(currentStreak([NOW], NOW)).toBe(1);
  });

  test("several visits in one day still count once", () => {
    expect(currentStreak([NOW, NOW - 1000, NOW - 2000], NOW)).toBe(1);
  });

  test("consecutive days accumulate", () => {
    expect(currentStreak([NOW, NOW - DAY, NOW - 2 * DAY], NOW)).toBe(3);
  });

  test("yesterday still counts, so a streak does not die at midnight", () => {
    expect(currentStreak([NOW - DAY, NOW - 2 * DAY], NOW)).toBe(2);
  });

  test("a missed day ends it", () => {
    expect(currentStreak([NOW - 2 * DAY, NOW - 3 * DAY], NOW)).toBe(0);
  });

  test("a gap in the middle stops the count there", () => {
    expect(currentStreak([NOW, NOW - DAY, NOW - 3 * DAY, NOW - 4 * DAY], NOW)).toBe(2);
  });
});

describe("badges", () => {
  test("every badge is answerable from data the app records", () => {
    // The old hardcoded list had "Mentor - help 3 colleagues", which no table
    // could ever answer, so it would have stayed locked forever while looking
    // like something you could work towards.
    for (const badge of BADGES) {
      expect(typeof badge.earned(facts())).toBe("boolean");
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
    }
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
  });

  test("finishing a first module earns First Steps", () => {
    expect(
      newlyEarnedBadges(facts({ modulesCompleted: 1, modulesAssigned: 4 }), new Set()),
    ).toContain("first_steps");
  });

  test("a badge already held is not awarded again", () => {
    const held = new Set(["first_steps"]);
    expect(
      newlyEarnedBadges(facts({ modulesCompleted: 1, modulesAssigned: 4 }), held),
    ).not.toContain("first_steps");
  });

  test("half way needs half, not one", () => {
    expect(
      newlyEarnedBadges(facts({ modulesCompleted: 1, modulesAssigned: 4 }), new Set()),
    ).not.toContain("half_way");
    expect(
      newlyEarnedBadges(facts({ modulesCompleted: 2, modulesAssigned: 4 }), new Set()),
    ).toContain("half_way");
  });

  test("nobody earns anything from an empty record", () => {
    // Guards against a predicate like `completed >= assigned` quietly being
    // true at 0 of 0 and handing a new teacher every badge on day one.
    expect(newlyEarnedBadges(facts(), new Set())).toEqual([]);
  });

  test("quiz ace needs a real perfect score", () => {
    expect(newlyEarnedBadges(facts({ bestScorePercent: 99 }), new Set())).not.toContain("quiz_ace");
    expect(newlyEarnedBadges(facts({ bestScorePercent: 100 }), new Set())).toContain("quiz_ace");
  });

  test("streak badges track the streak", () => {
    expect(newlyEarnedBadges(facts({ streakDays: 3 }), new Set())).toContain("streak_3");
    expect(newlyEarnedBadges(facts({ streakDays: 3 }), new Set())).not.toContain("streak_7");
    expect(newlyEarnedBadges(facts({ streakDays: 7 }), new Set())).toContain("streak_7");
  });
});
