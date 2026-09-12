/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import resendComponent from "@convex-dev/resend/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Sitting an assessment, from the learner's side.
 *
 * Three properties carry this file:
 *
 * 1. **The answer key never leaves the server.** The option rows carry
 *    `isCorrect`; the learner query must not. A stored question is useless to
 *    an attacker only if the correct one is indistinguishable in the payload.
 * 2. **The pass mark is enforced, not advisory.** Failing records the attempt
 *    and completes nothing; `recordLessonProgress` refuses to complete an
 *    assessment lesson at all, because it is a public mutation and hiding a
 *    button is not a gate.
 * 3. **Awards are paid exactly once**, the same property `learn.test.ts` holds
 *    for lessons — a retake after a pass must pay nothing further.
 */

const modules = import.meta.glob("./**/*.ts");

function newTest() {
  const t = convexTest(schema, modules);
  r2Component.register(t);
  actionRetrier.register(t, "r2/actionRetrier");
  resendComponent.register(t);
  rateLimiter.register(t, "resend/rateLimiter");
  workpool.register(t, "resend/emailWorkpool");
  workpool.register(t, "resend/callbackWorkpool");
  return t;
}

let t: ReturnType<typeof newTest>;
let teacherId: Id<"users">;
let strangerId: Id<"users">;
let inactiveId: Id<"users">;
let moduleId: Id<"modules">;
let quizLessonId: Id<"lessons">;

const MODULE_SLUG = "safeguarding";
const QUIZ_SLUG = "module-assessment";
const MODULE_CPTD = 3;
/** Four questions against a 75% pass mark: 3 of 4 passes, 2 of 4 does not. */
const PASS_MARK = 75;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const teacher = () => asUser(teacherId);

/** The option ids for one question, correct one first. */
async function optionsOf(index: number) {
  return await t.run(async (ctx) => {
    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_moduleId_and_order", (q) => q.eq("moduleId", moduleId))
      .take(20);
    const options = await ctx.db
      .query("assessmentQuestionOptions")
      .withIndex("by_questionId_and_order", (q) => q.eq("questionId", questions[index]._id))
      .take(20);
    return {
      questionId: questions[index]._id,
      correct: options.find((o) => o.isCorrect)!._id,
      wrong: options.find((o) => !o.isCorrect)!._id,
    };
  });
}

/** Answer the first `rightCount` questions correctly and the rest wrong. */
async function answerWith(rightCount: number) {
  const answers = [];
  for (let i = 0; i < 4; i++) {
    const o = await optionsOf(i);
    answers.push({ questionId: o.questionId, optionId: i < rightCount ? o.correct : o.wrong });
  }
  return answers;
}

const submit = async (rightCount: number) =>
  await teacher().mutation(api.learn.submitAssessment, {
    moduleSlug: MODULE_SLUG,
    lessonSlug: QUIZ_SLUG,
    answers: await answerWith(rightCount),
  });

beforeEach(async () => {
  t = newTest();
  const ids = await t.run(async (ctx) => {
    const phaseId = await ctx.db.insert("phases", { name: "Senior", order: 1, isActive: true });
    const base = {
      phaseId,
      employmentStatus: "active" as const,
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
      jobTitle: "Teacher",
      accessRole: "staff" as const,
    };
    const teacherRow = await ctx.db.insert("users", {
      ...base,
      firstName: "Nomsa",
      lastName: "Khumalo",
      email: "nomsa@cliffview.test",
    });
    const strangerRow = await ctx.db.insert("users", {
      ...base,
      firstName: "Sam",
      lastName: "Staff",
      email: "sam@cliffview.test",
    });
    const inactiveRow = await ctx.db.insert("users", {
      ...base,
      employmentStatus: "inactive" as const,
      firstName: "Gone",
      lastName: "Away",
      email: "gone@cliffview.test",
    });

    const mod = await ctx.db.insert("modules", {
      slug: MODULE_SLUG,
      number: "02",
      sequence: 2,
      title: "Safeguarding",
      description: "d",
      audience: "a",
      outcome: "o",
      category: "Core Policies" as const,
      durationMinutes: 30,
      cptdPoints: MODULE_CPTD,
      passMark: PASS_MARK,
      format: "Self-paced",
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });

    const reading = await ctx.db.insert("lessons", {
      moduleId: mod,
      slug: "why-this-matters",
      title: "Why this matters",
      summary: "s",
      kind: "reading" as const,
      order: 1,
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });
    const quiz = await ctx.db.insert("lessons", {
      moduleId: mod,
      slug: QUIZ_SLUG,
      title: "Module assessment",
      summary: "s",
      kind: "assessment" as const,
      order: 2,
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });

    for (let i = 0; i < 4; i++) {
      const questionId = await ctx.db.insert("assessmentQuestions", {
        moduleId: mod,
        kind: "multiple_choice" as const,
        prompt: `Question ${i + 1}?`,
        order: i + 1,
        contentUpdatedAt: Date.now(),
      });
      await ctx.db.insert("assessmentQuestionOptions", {
        questionId,
        text: "Right",
        isCorrect: true,
        order: 1,
      });
      await ctx.db.insert("assessmentQuestionOptions", {
        questionId,
        text: "Wrong",
        isCorrect: false,
        order: 2,
      });
    }

    await ctx.db.insert("enrollments", {
      userId: teacherRow,
      moduleId: mod,
      status: "not_started" as const,
      progressPercent: 0,
      assignedAt: Date.now(),
    });

    return { teacherRow, strangerRow, inactiveRow, mod, quiz, reading };
  });
  teacherId = ids.teacherRow;
  strangerId = ids.strangerRow;
  inactiveId = ids.inactiveRow;
  moduleId = ids.mod;
  quizLessonId = ids.quiz;
});

const enrollment = async () =>
  await t.run(async (ctx) =>
    (await ctx.db.query("enrollments").take(10)).find((row) => row.userId === teacherId),
  );
const attempts = async () =>
  await t.run(async (ctx) => await ctx.db.query("assessmentAttempts").take(20));
const eventsOf = async (kind: string) =>
  await t.run(async (ctx) =>
    (await ctx.db.query("progressEvents").take(50)).filter((row) => row.kind === kind),
  );
const quizProgress = async () =>
  await t.run(async (ctx) =>
    (await ctx.db.query("lessonProgress").take(20)).find((row) => row.lessonId === quizLessonId),
  );

describe("the answer key stays on the server", () => {
  test("options carry an id and text, and nothing else", async () => {
    const view = await teacher().query(api.learn.assessment, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: QUIZ_SLUG,
    });
    // Asserting the exact key set, the way the leaderboard's shape is asserted,
    // so widening this return breaks the build rather than quietly leaking.
    expect(Object.keys(view.questions[0].options[0]).sort()).toEqual(["optionId", "text"]);
    expect(JSON.stringify(view)).not.toContain("isCorrect");
  });

  test("every question comes back, in its stored order", async () => {
    const view = await teacher().query(api.learn.assessment, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: QUIZ_SLUG,
    });
    expect(view.questions.map((q) => q.prompt)).toEqual([
      "Question 1?",
      "Question 2?",
      "Question 3?",
      "Question 4?",
    ]);
    expect(view.passMark).toBe(PASS_MARK);
    expect(view.bestScorePercent).toBeNull();
    expect(view.lastAttempt).toBeNull();
  });
});

describe("only what you were assigned", () => {
  test("an unassigned teacher is refused the paper", async () => {
    await expect(
      asUser(strangerId).query(api.learn.assessment, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: QUIZ_SLUG,
      }),
    ).rejects.toThrow(/not assigned/i);
  });

  test("an unassigned teacher cannot submit either", async () => {
    const answers = await answerWith(4);
    await expect(
      asUser(strangerId).mutation(api.learn.submitAssessment, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: QUIZ_SLUG,
        answers,
      }),
    ).rejects.toThrow(/not assigned/i);
  });

  test("no identity is refused", async () => {
    await expect(
      t.query(api.learn.assessment, { moduleSlug: MODULE_SLUG, lessonSlug: QUIZ_SLUG }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("an inactive account is refused", async () => {
    await expect(
      asUser(inactiveId).query(api.learn.assessment, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: QUIZ_SLUG,
      }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("an ordinary lesson is not an assessment", async () => {
    await expect(
      teacher().query(api.learn.assessment, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: "why-this-matters",
      }),
    ).rejects.toThrow(/not an assessment/i);
  });

  test("a draft assessment reads exactly like one that does not exist", async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch("lessons", quizLessonId, { publishState: "draft" });
    });
    await expect(
      teacher().query(api.learn.assessment, { moduleSlug: MODULE_SLUG, lessonSlug: QUIZ_SLUG }),
    ).rejects.toThrow(/not part of this module/i);
  });
});

describe("grading happens on the server", () => {
  test("an option belonging to another question scores wrong, it does not throw", async () => {
    const first = await optionsOf(0);
    const second = await optionsOf(1);
    const result = await teacher().mutation(api.learn.submitAssessment, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: QUIZ_SLUG,
      // The right answer, aimed at the wrong question.
      answers: [{ questionId: first.questionId, optionId: second.correct }],
    });
    expect(result.correctCount).toBe(0);
    expect(result.scorePercent).toBe(0);
  });

  test("answering only the question you know scores 1 of 4, not 100%", async () => {
    const first = await optionsOf(0);
    const result = await teacher().mutation(api.learn.submitAssessment, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: QUIZ_SLUG,
      answers: [{ questionId: first.questionId, optionId: first.correct }],
    });
    expect(result.totalCount).toBe(4);
    expect(result.correctCount).toBe(1);
    expect(result.scorePercent).toBe(25);
    expect(result.passed).toBe(false);
  });

  test("the per-question verdict says which were wrong, and never which was right", async () => {
    const result = await submit(3);
    expect(result.results.map((r) => r.correct)).toEqual([true, true, true, false]);
    expect(JSON.stringify(result)).not.toContain("isCorrect");
  });

  test("an assessment with no questions is refused, not scored 100%", async () => {
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("assessmentQuestions").take(20)) {
        await ctx.db.delete("assessmentQuestions", row._id);
      }
    });
    await expect(
      teacher().mutation(api.learn.submitAssessment, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: QUIZ_SLUG,
        answers: [],
      }),
    ).rejects.toThrow(/no questions yet/i);
  });
});

describe("failing records the attempt and completes nothing", () => {
  test("below the pass mark leaves the lesson open and pays nothing", async () => {
    const result = await submit(2);
    expect(result.scorePercent).toBe(50);
    expect(result.passed).toBe(false);
    expect(result.xpAwarded).toBe(0);
    expect(result.cptdAwarded).toBe(0);

    expect((await attempts()).map((a) => a.passed)).toEqual([false]);
    expect(await quizProgress()).toBeNull();
    expect(await eventsOf("assessment_passed")).toEqual([]);
    expect(await userRowXp()).toBe(0);
  });

  test("a failed attempt still records the score, so the profile is honest", async () => {
    await submit(2);
    expect((await enrollment())?.score).toBe(50);
  });

  test("the paper remembers the last attempt for a returning teacher", async () => {
    await submit(2);
    const view = await teacher().query(api.learn.assessment, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: QUIZ_SLUG,
    });
    expect(view.bestScorePercent).toBe(50);
    expect(view.lastAttempt).toMatchObject({ scorePercent: 50, passed: false });
    expect(view.attemptCount).toBe(1);
  });
});

const userRowXp = async () =>
  await t.run(async (ctx) => (await ctx.db.get("users", teacherId))!.xpTotal);

describe("passing completes the lesson and pays, exactly once", () => {
  test("at the pass mark the lesson completes and XP is paid", async () => {
    const result = await submit(3);
    expect(result.scorePercent).toBe(75);
    expect(result.passed).toBe(true);
    expect(result.xpAwarded).toBe(50);

    expect((await quizProgress())?.status).toBe("completed");
    expect((await eventsOf("assessment_passed")).length).toBe(1);
    expect((await enrollment())?.score).toBe(75);
  });

  test("retaking after a pass pays nothing further", async () => {
    const first = await submit(3);
    const second = await submit(4);
    expect(first.xpAwarded).toBe(50);
    expect(second.xpAwarded).toBe(0);
    expect(second.cptdAwarded).toBe(0);
    // Two attempts recorded, one completion paid.
    expect((await attempts()).length).toBe(2);
  });

  test("the best score is kept, and a worse retake does not undo it", async () => {
    await submit(4);
    expect((await enrollment())?.score).toBe(100);
    await submit(2);
    expect((await enrollment())?.score).toBe(100);
  });

  test("a failed retake does not un-complete a passed assessment", async () => {
    await submit(4);
    expect((await quizProgress())?.status).toBe("completed");
    await submit(1);
    expect((await quizProgress())?.status).toBe("completed");
  });

  test("100% earns Quiz Ace, once", async () => {
    await submit(4);
    const held = await t.run(async (ctx) => await ctx.db.query("badgeAwards").take(20));
    expect(held.filter((b) => b.badgeKey === "quiz_ace").length).toBe(1);

    await submit(4);
    const again = await t.run(async (ctx) => await ctx.db.query("badgeAwards").take(20));
    expect(again.filter((b) => b.badgeKey === "quiz_ace").length).toBe(1);
  });

  test("passing the last lesson completes the module and pays the bonus once", async () => {
    await teacher().mutation(api.learn.recordLessonProgress, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: "why-this-matters",
      completed: true,
    });
    const result = await submit(4);
    expect(result.moduleCompleted).toBe(true);
    expect(result.cptdAwarded).toBe(MODULE_CPTD);
    expect((await enrollment())?.status).toBe("completed");
  });
});

describe("the assessment cannot be marked complete by hand", () => {
  test("recordLessonProgress refuses to complete an assessment lesson", async () => {
    // Hiding the button is not a gate: this is a public mutation, and without
    // the refusal the pass mark is advisory.
    await expect(
      teacher().mutation(api.learn.recordLessonProgress, {
        moduleSlug: MODULE_SLUG,
        lessonSlug: QUIZ_SLUG,
        completed: true,
      }),
    ).rejects.toThrow(/passing it/i);
    expect(await quizProgress()).toBeNull();
  });

  test("but opening it is still a visit", async () => {
    await teacher().mutation(api.learn.recordLessonProgress, {
      moduleSlug: MODULE_SLUG,
      lessonSlug: QUIZ_SLUG,
      completed: false,
    });
    expect((await quizProgress())?.status).toBe("in_progress");
  });
});
