import type { Doc } from "../_generated/dataModel";

/**
 * What a piece of work is worth, and what earns a badge.
 *
 * One module, because the moment these rules live in two places the numbers
 * drift: the mutation that awards points and the query that explains them have
 * to agree, or a teacher sees a total that their own ledger contradicts.
 *
 * Nothing here reads the database or the clock. It is arithmetic and
 * predicates over facts the caller has already gathered, which is what makes
 * it testable without a Convex harness.
 */

/**
 * XP for finishing a single lesson.
 *
 * Flat rather than scaled by duration: a long lesson is not more virtuous than
 * a short one, and paying by the minute rewards padding.
 */
export const XP_PER_LESSON = 50;

/**
 * XP for finishing a whole module, on top of its lessons.
 *
 * Derived from the module's own CPTD value so the two currencies cannot
 * disagree about which modules matter. The multiplier is the only tuning knob;
 * change it here and every screen follows.
 */
export const XP_PER_CPTD_POINT = 100;

export function xpForModule(module: Pick<Doc<"modules">, "cptdPoints">): number {
  return module.cptdPoints * XP_PER_CPTD_POINT;
}

/** "YYYY-MM", the shape `progressEvents.monthKey` and `monthlyRollups` use. */
export function monthKeyOf(at: number): string {
  const date = new Date(at);
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/** Whole days since the Unix epoch, in UTC. Used only for streak arithmetic. */
function dayNumber(at: number): number {
  return Math.floor(at / 86_400_000);
}

/**
 * Consecutive days of activity ending today, or yesterday.
 *
 * Yesterday counts so that a streak does not evaporate at midnight for
 * somebody who has simply not opened the app yet today — it breaks only once
 * a full day has been missed.
 *
 * Derived from `progressEvents`, which is the only per-user activity history
 * that exists. Nothing backfills it, so every streak starts at 1 the first
 * time somebody opens a lesson; the profile says so rather than implying a
 * history it does not have.
 */
export function currentStreak(occurredAts: Array<number>, now: number): number {
  if (occurredAts.length === 0) return 0;

  const days = [...new Set(occurredAts.map(dayNumber))].sort((a, b) => b - a);
  const today = dayNumber(now);

  // A gap of more than one day between the most recent activity and today
  // means the streak is already over.
  if (days[0] < today - 1) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i - 1] - days[i] !== 1) break;
    streak += 1;
  }
  return streak;
}

/** The facts a badge predicate may look at. All real, all already computed. */
export type BadgeFacts = {
  modulesCompleted: number;
  modulesAssigned: number;
  compliancePercent: number;
  streakDays: number;
  bestScorePercent: number | null;
};

export type BadgeDefinition = {
  key: string;
  label: string;
  description: string;
  earned: (facts: BadgeFacts) => boolean;
};

/**
 * The badge catalogue.
 *
 * Every predicate is answerable from data the app actually records. The old
 * hardcoded list included "Mentor — help 3 colleagues", which no table could
 * ever answer and which would therefore have stayed locked forever while
 * looking like something you could work towards. A badge nobody can earn is
 * worse than no badge.
 *
 * Order is display order: roughly easiest first.
 */
export const BADGES: Array<BadgeDefinition> = [
  {
    key: "first_steps",
    label: "First Steps",
    description: "Finish your first module",
    earned: (f) => f.modulesCompleted >= 1,
  },
  {
    key: "streak_3",
    label: "3-Day Streak",
    description: "Train three days running",
    earned: (f) => f.streakDays >= 3,
  },
  {
    key: "quiz_ace",
    label: "Quiz Ace",
    description: "Score 100% on a module",
    earned: (f) => f.bestScorePercent !== null && f.bestScorePercent >= 100,
  },
  {
    key: "streak_7",
    label: "7-Day Streak",
    description: "Train seven days running",
    earned: (f) => f.streakDays >= 7,
  },
  {
    key: "half_way",
    label: "Half Way",
    description: "Finish half of what you have been assigned",
    earned: (f) => f.modulesAssigned > 0 && f.modulesCompleted * 2 >= f.modulesAssigned,
  },
  {
    key: "fully_compliant",
    label: "Fully Compliant",
    description: "Reach 100% compliance",
    earned: (f) => f.compliancePercent >= 100,
  },
  {
    key: "cliffview_legend",
    label: "Cliffview Legend",
    description: "Finish every module assigned to you",
    earned: (f) => f.modulesAssigned > 0 && f.modulesCompleted === f.modulesAssigned,
  },
];

/** Keys newly earned given the facts, excluding ones already held. */
export function newlyEarnedBadges(facts: BadgeFacts, held: Set<string>): Array<string> {
  return BADGES.filter((badge) => !held.has(badge.key) && badge.earned(facts)).map(
    (badge) => badge.key,
  );
}
