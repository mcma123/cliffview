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
 * The assessment question bank, admin side.
 *
 * Two properties carry this file. The first is the invariant that justifies
 * saving a question and its options in one mutation: exactly one option is
 * correct, always, with no reachable state in between. The second is the
 * publish gate, which has to hold at both doors — a module published with a
 * draft assessment lesson, then that lesson published afterwards, is the order
 * that bypasses a gate placed only on `modules.publish`.
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
let admin: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
let moduleId: Id<"modules">;
let staffId: Id<"users">;
let inactiveAdminId: Id<"users">;

const SLUG = "question-fixture";

/** A valid two-option multiple choice, so the gate is tested with good args. */
const VALID = {
  kind: "multiple_choice" as const,
  prompt: "What is the first step?",
  options: [
    { text: "Report it", isCorrect: true },
    { text: "Ignore it", isCorrect: false },
  ],
};

beforeEach(async () => {
  t = newTest();
  const ids = await t.run(async (ctx) => {
    const phaseId = await ctx.db.insert("phases", { name: "Senior", order: 1, isActive: true });
    const base = {
      phaseId,
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
      jobTitle: "Teacher",
    };
    return {
      adminId: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "active" as const,
        firstName: "Ada",
        lastName: "Admin",
        email: "ada@cliffview.example",
        jobTitle: "Head of Department",
        accessRole: "smt_admin" as const,
      }),
      staffId: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "active" as const,
        firstName: "Sam",
        lastName: "Staff",
        email: "sam@cliffview.example",
        accessRole: "staff" as const,
      }),
      inactiveAdminId: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "inactive" as const,
        firstName: "Gone",
        lastName: "Admin",
        email: "gone@cliffview.example",
        accessRole: "smt_admin" as const,
      }),
    };
  });
  staffId = ids.staffId;
  inactiveAdminId = ids.inactiveAdminId;
  admin = t.withIdentity({ subject: ids.adminId });

  const created = await admin.mutation(api.modules.create, {
    title: "Question Fixture",
    category: "Core Policies",
    description: "d",
    audience: "a",
    outcome: "o",
  });
  moduleId = created.moduleId;
});

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });

async function listQuestions() {
  const view = await admin.query(api.questions.adminList, { moduleSlug: SLUG });
  return view.questions;
}

async function addValid(prompt: string) {
  return await admin.mutation(api.questions.save, { moduleId, ...VALID, prompt });
}

describe("only an admin may touch the question bank", () => {
  // Valid args throughout: Convex validates `args` before the handler, so a
  // malformed call fails validation without reaching the gate and proves
  // nothing about it.
  test("no identity is refused", async () => {
    await expect(t.mutation(api.questions.save, { moduleId, ...VALID })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused", async () => {
    await expect(
      asUser(staffId).mutation(api.questions.save, { moduleId, ...VALID }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    await expect(
      asUser(inactiveAdminId).mutation(api.questions.save, { moduleId, ...VALID }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("remove and reorder are gated too", async () => {
    const questionId = await addValid("Gated?");
    await expect(asUser(staffId).mutation(api.questions.remove, { questionId })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
    await expect(
      asUser(staffId).mutation(api.questions.reorder, { moduleId, orderedIds: [questionId] }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("reading the bank is gated — it carries the answer key", async () => {
    await expect(
      asUser(staffId).query(api.questions.adminList, { moduleSlug: SLUG }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("a question cannot be moved into another module", async () => {
    const questionId = await addValid("Mine");
    const other = await admin.mutation(api.modules.create, {
      title: "Other Module",
      category: "Core Policies",
    });
    await expect(
      admin.mutation(api.questions.save, { moduleId: other.moduleId, questionId, ...VALID }),
    ).rejects.toThrow(/different module/i);
  });
});

describe("a stored question is always gradable", () => {
  test("no correct answer is refused", async () => {
    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which?",
        options: [
          { text: "A", isCorrect: false },
          { text: "B", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/exactly one/i);
  });

  test("two correct answers are refused", async () => {
    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which?",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
        ],
      }),
    ).rejects.toThrow(/exactly one/i);
  });

  test("an empty prompt or a blank answer is refused", async () => {
    await expect(
      admin.mutation(api.questions.save, { moduleId, ...VALID, prompt: "   " }),
    ).rejects.toThrow(/needs a prompt/i);
    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which?",
        options: [
          { text: "A", isCorrect: true },
          { text: "  ", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/needs some text/i);
  });

  test("two answers that read the same are refused", async () => {
    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which?",
        options: [
          { text: "Report it", isCorrect: true },
          { text: "report it", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/read the same/i);
  });

  test("one answer, or seven, is refused", async () => {
    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which?",
        options: [{ text: "Only", isCorrect: true }],
      }),
    ).rejects.toThrow(/at least two/i);

    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which?",
        options: Array.from({ length: 7 }, (_, i) => ({
          text: `Option ${i}`,
          isCorrect: i === 0,
        })),
      }),
    ).rejects.toThrow(/at most 6/i);
  });

  test("a true/false question needs exactly two answers", async () => {
    await expect(
      admin.mutation(api.questions.save, {
        moduleId,
        kind: "true_false",
        prompt: "Is it so?",
        options: [
          { text: "True", isCorrect: true },
          { text: "False", isCorrect: false },
          { text: "Maybe", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/exactly two/i);
  });

  test("true/false answer text is normalised, whatever was submitted", async () => {
    // The admin UI sends the labels, but a typo there must not reach a learner.
    await admin.mutation(api.questions.save, {
      moduleId,
      kind: "true_false",
      prompt: "Is it so?",
      options: [
        { text: "yes definitely", isCorrect: false },
        { text: "nope", isCorrect: true },
      ],
    });
    const [row] = await listQuestions();
    expect(row.options.map((o) => o.text)).toEqual(["True", "False"]);
    expect(row.options.map((o) => o.isCorrect)).toEqual([false, true]);
  });
});

describe("ordering and replacement", () => {
  test("questions append in order", async () => {
    for (const prompt of ["One", "Two", "Three"]) await addValid(prompt);
    const rows = await listQuestions();
    expect(rows.map((r) => r.question.prompt)).toEqual(["One", "Two", "Three"]);
    expect(rows.map((r) => r.question.order)).toEqual([1, 2, 3]);
  });

  test("re-saving keeps the position and replaces the options wholesale", async () => {
    await addValid("One");
    const questionId = await addValid("Two");
    await addValid("Three");

    await admin.mutation(api.questions.save, {
      moduleId,
      questionId,
      kind: "multiple_choice",
      prompt: "Two, rewritten",
      options: [
        { text: "X", isCorrect: false },
        { text: "Y", isCorrect: false },
        { text: "Z", isCorrect: true },
      ],
    });

    const rows = await listQuestions();
    expect(rows.map((r) => r.question.prompt)).toEqual(["One", "Two, rewritten", "Three"]);
    const edited = rows[1];
    expect(edited.options.map((o) => o.text)).toEqual(["X", "Y", "Z"]);
    expect(edited.options.map((o) => o.order)).toEqual([1, 2, 3]);

    // The old option rows are gone, not merely detached.
    const orphans = await t.run(async (ctx) => {
      const all = await ctx.db.query("assessmentQuestionOptions").take(100);
      return all.filter((o) => o.text === "Report it" && o.questionId === questionId);
    });
    expect(orphans).toEqual([]);
  });

  test("removing a question takes its options and closes the gap", async () => {
    const first = await addValid("One");
    await addValid("Two");
    await addValid("Three");

    await admin.mutation(api.questions.remove, { questionId: first });

    const rows = await listQuestions();
    expect(rows.map((r) => r.question.prompt)).toEqual(["Two", "Three"]);
    expect(rows.map((r) => r.question.order)).toEqual([1, 2]);

    const left = await t.run(async (ctx) => {
      const all = await ctx.db.query("assessmentQuestionOptions").take(100);
      return all.filter((o) => o.questionId === first);
    });
    expect(left).toEqual([]);
  });

  test("reorder rewrites the list, and refuses a stale set", async () => {
    const a = await addValid("A");
    const b = await addValid("B");
    await admin.mutation(api.questions.reorder, { moduleId, orderedIds: [b, a] });
    expect((await listQuestions()).map((r) => r.question.prompt)).toEqual(["B", "A"]);

    await expect(
      admin.mutation(api.questions.reorder, { moduleId, orderedIds: [a] }),
    ).rejects.toThrow(/STALE_ORDER|changed since/i);
  });

  test("deleting the module takes the questions and options with it", async () => {
    await addValid("One");
    await addValid("Two");
    await admin.mutation(api.modules.remove, { moduleId });

    const left = await t.run(async (ctx) => ({
      questions: (await ctx.db.query("assessmentQuestions").take(100)).length,
      options: (await ctx.db.query("assessmentQuestionOptions").take(100)).length,
    }));
    expect(left).toEqual({ questions: 0, options: 0 });
  });

  test("saving records who acted", async () => {
    await addValid("Audited");
    const entries = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(100)).filter(
        (row) => row.entityTable === "assessmentQuestions",
      ),
    );
    expect(entries.map((e) => e.action)).toEqual(["question.add"]);
  });
});

describe("a published assessment lesson needs questions", () => {
  async function addAssessmentLesson(publish: boolean) {
    const made = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Module assessment",
      kind: "assessment",
    });
    if (publish) {
      await admin.mutation(api.lessons.setPublishState, {
        lessonId: made.lessonId,
        publishState: "published",
      });
    }
    return made.lessonId;
  }

  test("publishing the module is refused while the bank is empty", async () => {
    // A question is needed first, or setPublishState itself refuses — so seed
    // one, publish the lesson, then clear the bank.
    const questionId = await addValid("Temp");
    await addAssessmentLesson(true);
    await admin.mutation(api.questions.remove, { questionId });

    await expect(admin.mutation(api.modules.publish, { moduleId })).rejects.toThrow(
      /at least one assessment question/i,
    );
  });

  test("adding a question unblocks it", async () => {
    const questionId = await addValid("Temp");
    await addAssessmentLesson(true);
    await admin.mutation(api.questions.remove, { questionId });
    await addValid("Real question");

    await admin.mutation(api.modules.publish, { moduleId });
    const view = await admin.query(api.questions.adminList, { moduleSlug: SLUG });
    expect(view.module.publishState).toBe("published");
  });

  test("a draft assessment lesson does not block publishing", async () => {
    // Nothing a learner can reach, so nothing to gate.
    await addAssessmentLesson(false);
    await admin.mutation(api.lessons.create, { moduleId, title: "Readable", kind: "reading" });
    const lessons = await admin.query(api.modules.adminDetail, { slug: SLUG });
    const reading = lessons.lessons.find(({ lesson }) => lesson.kind === "reading")!;
    await admin.mutation(api.lessons.setPublishState, {
      lessonId: reading.lesson._id,
      publishState: "published",
    });

    await admin.mutation(api.modules.publish, { moduleId });
    const view = await admin.query(api.questions.adminList, { moduleSlug: SLUG });
    expect(view.module.publishState).toBe("published");
  });

  test("the other door is shut too: publishing the lesson is refused", async () => {
    // The bypass this guards: publish the module while the assessment lesson is
    // a draft, then publish the lesson.
    await expect(addAssessmentLesson(true)).rejects.toThrow(/at least one assessment question/i);
  });

  test("the builder reports where the assessment is sat", async () => {
    await addValid("One");
    await addAssessmentLesson(true);
    const view = await admin.query(api.questions.adminList, { moduleSlug: SLUG });
    expect(view.assessmentLessons.map((l) => l.title)).toEqual(["Module assessment"]);
  });
});
