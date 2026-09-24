/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import resendComponent from "@convex-dev/resend/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The AI review queue.
 *
 * The property that matters: **a generated question is a draft, and approving
 * it is the only way it reaches a learner.** Everything else here protects that
 * boundary — the queue is admin-only, approval runs the same validation a
 * hand-typed question passes, and a rejected question writes nothing into the
 * assessment bank.
 *
 * The model call itself is not tested here. It is a `fetch` to OpenRouter
 * inside a Node action; exercising it would either mock the network (testing
 * the mock) or spend real money on every `npm test`. What *is* tested is
 * everything on either side of it: what gets stored, and what that storage is
 * allowed to become.
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
let adminId: Id<"users">;
let staffId: Id<"users">;
let inactiveAdminId: Id<"users">;
let moduleId: Id<"modules">;
let generationId: Id<"aiGenerations">;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const admin = () => asUser(adminId);

/** A well-formed generated question: exactly one correct answer of three. */
const GOOD = {
  prompt: "A parent posts a complaint on Facebook. What comes first?",
  difficulty: "Medium" as const,
  confidencePercent: 88,
  options: [
    { text: "Report it and document it", isCorrect: true },
    { text: "Reply publicly", isCorrect: false },
    { text: "Ignore it", isCorrect: false },
  ],
};

const record = (questions: Array<typeof GOOD>) =>
  t.mutation(internal.aiReviewQueue.recordQuestions, { generationId, moduleId, questions });

const pendingQuestion = async () => {
  const view = await admin().query(api.aiReviewQueue.queue, {});
  return view.questions[0];
};

/** One named pending card. The queue is newest-first, so position is not a name. */
const pendingNamed = async (prompt: string) => {
  const view = await admin().query(api.aiReviewQueue.queue, {});
  const row = view.questions.find((entry) => entry.question.prompt === prompt);
  if (row === undefined) throw new Error(`No pending question: ${prompt}`);
  return row;
};

const assessmentRows = async () =>
  await t.run(async (ctx) => ({
    questions: await ctx.db.query("assessmentQuestions").take(50),
    options: await ctx.db.query("assessmentQuestionOptions").take(50),
  }));

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
    const mod = await ctx.db.insert("modules", {
      slug: "safeguarding",
      number: "01",
      sequence: 1,
      title: "Safeguarding",
      description: "d",
      audience: "a",
      outcome: "o",
      category: "Core Policies" as const,
      durationMinutes: 30,
      cptdPoints: 2,
      passMark: 80,
      format: "Self-paced",
      publishState: "published" as const,
      contentUpdatedAt: Date.now(),
    });
    return {
      adminRow: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "active" as const,
        firstName: "Ada",
        lastName: "Admin",
        email: "ada@cliffview.example",
        jobTitle: "Head of Department",
        accessRole: "smt_admin" as const,
      }),
      staffRow: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "active" as const,
        firstName: "Sam",
        lastName: "Staff",
        email: "sam@cliffview.example",
        accessRole: "staff" as const,
      }),
      inactiveAdminRow: await ctx.db.insert("users", {
        ...base,
        employmentStatus: "inactive" as const,
        firstName: "Gone",
        lastName: "Admin",
        email: "gone@cliffview.example",
        accessRole: "smt_admin" as const,
      }),
      mod,
      gen: await ctx.db.insert("aiGenerations", {
        status: "running" as const,
        moduleId: mod,
        startedAt: Date.now(),
        questionCount: 0,
      }),
    };
  });
  adminId = ids.adminRow;
  staffId = ids.staffRow;
  inactiveAdminId = ids.inactiveAdminRow;
  moduleId = ids.mod;
  generationId = ids.gen;
});

describe("the queue is the school's, not a teacher's", () => {
  test("no identity is refused", async () => {
    await expect(t.query(api.aiReviewQueue.queue, {})).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("a staff identity is refused", async () => {
    await expect(asUser(staffId).query(api.aiReviewQueue.queue, {})).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("an inactive admin is refused", async () => {
    await expect(asUser(inactiveAdminId).query(api.aiReviewQueue.queue, {})).rejects.toThrow(
      /FORBIDDEN|not active/i,
    );
  });

  test("deciding is admin-only too", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await expect(
      asUser(staffId).mutation(api.aiReviewQueue.setDecision, {
        questionId: row.question._id,
        decision: "approved",
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("discarding a draft is admin-only", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await expect(
      asUser(staffId).mutation(api.aiReviewQueue.discardQuestion, {
        questionId: row.question._id,
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
    await expect(
      t.mutation(api.aiReviewQueue.discardQuestion, { questionId: row.question._id }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("clearing the reviewed drafts is admin-only", async () => {
    await expect(asUser(staffId).mutation(api.aiReviewQueue.clearReviewed, {})).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
    await expect(
      asUser(inactiveAdminId).mutation(api.aiReviewQueue.clearReviewed, {}),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
    await expect(t.mutation(api.aiReviewQueue.clearReviewed, {})).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("generating is gated at the internal query the action calls first", async () => {
    const assetId = await t.run(
      async (ctx) =>
        await ctx.db.insert("assets", {
          moduleId,
          title: "Policy",
          description: "d",
          kind: "document" as const,
          publishState: "published" as const,
          order: 1,
          r2Key: "some-key",
          contentUpdatedAt: Date.now(),
        }),
    );
    // The action has no ctx.db, so this query IS the gate. If it ever stopped
    // calling requireAdmin, generation would be open to any signed-in teacher.
    await expect(
      asUser(staffId).query(internal.aiReviewQueue.sourceAsset, { assetId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });
});

describe("what the generate screen can offer", () => {
  /** An asset row the way `assets.create` leaves it: titled, with no file. */
  const placeholder = async (kind: "document" | "worksheet" | "video", order: number) =>
    await t.run(
      async (ctx) =>
        await ctx.db.insert("assets", {
          moduleId,
          title: `${kind} ${order}`,
          description: "",
          kind,
          publishState: "draft" as const,
          order,
          contentUpdatedAt: Date.now(),
        }),
    );

  const attach = async (assetId: Id<"assets">, r2Key: string) =>
    await t.run(
      async (ctx) => await ctx.db.patch("assets", assetId, { r2Key, fileName: `${r2Key}.pdf` }),
    );

  test("every module is offered to upload into, even one with no assets", async () => {
    const view = await admin().query(api.aiReviewQueue.queue, {});
    expect(view.modules).toEqual([{ id: moduleId, title: "Safeguarding" }]);
  });

  test("a placeholder with no file is not readable", async () => {
    await placeholder("document", 1);
    const view = await admin().query(api.aiReviewQueue.queue, {});
    expect(view.sources).toHaveLength(0);
  });

  test("attaching a file is what makes a document readable", async () => {
    const assetId = await placeholder("document", 1);
    await attach(assetId, "k1");

    const view = await admin().query(api.aiReviewQueue.queue, {});
    expect(view.sources).toHaveLength(1);
    expect(view.sources[0]).toMatchObject({ assetId, moduleTitle: "Safeguarding" });
  });

  test("a video with a file is still not a document", async () => {
    await attach(await placeholder("video", 1), "k2");
    await attach(await placeholder("worksheet", 2), "k3");

    const view = await admin().query(api.aiReviewQueue.queue, {});
    expect(view.sources.map((s) => s.title)).toEqual(["worksheet 2"]);
  });

  test("a document with no file cannot be read, even asked for by id", async () => {
    const assetId = await placeholder("document", 1);
    await expect(admin().query(internal.aiReviewQueue.sourceAsset, { assetId })).rejects.toThrow(
      /no file attached/i,
    );
  });
});

describe("what a generation stores", () => {
  test("questions land pending, never in the assessment bank", async () => {
    await record([GOOD]);

    const row = await pendingQuestion();
    expect(row.question.status).toBe("pending");
    expect(row.moduleTitle).toBe("Safeguarding");
    expect(row.options).toHaveLength(3);

    // The boundary this whole design rests on.
    expect((await assessmentRows()).questions).toHaveLength(0);
  });

  test("confidence is clamped to a percentage", async () => {
    // A model is free to return 140. A meter cannot render it.
    await record([{ ...GOOD, confidencePercent: 140 }]);
    expect((await pendingQuestion()).question.confidencePercent).toBe(100);
  });

  test("the generation is marked complete with its count", async () => {
    await record([GOOD, { ...GOOD, prompt: "Second question?" }]);
    const gen = await t.run(async (ctx) => await ctx.db.get("aiGenerations", generationId));
    expect(gen).toMatchObject({ status: "complete", questionCount: 2 });
  });

  test("a failed run records why, rather than sitting on running forever", async () => {
    await t.mutation(internal.aiReviewQueue.failGeneration, {
      generationId,
      errorMessage: "OpenRouter refused the request (402).",
    });
    const gen = await t.run(async (ctx) => await ctx.db.get("aiGenerations", generationId));
    expect(gen?.status).toBe("failed");
    expect(gen?.errorMessage).toContain("402");
  });

  test("the pending counter moves with the rows it counts", async () => {
    await record([GOOD, { ...GOOD, prompt: "Second?" }]);
    const counter = await t.run(async (ctx) =>
      (await ctx.db.query("counters").take(10)).find((c) => c.name === "ai_questions_pending"),
    );
    expect(counter?.value).toBe(2);
  });
});

describe("approving is the only path to a learner", () => {
  test("approving copies the question into the module's bank", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();

    const result = await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "approved",
    });
    expect(result.assessmentQuestionId).not.toBeNull();

    const bank = await assessmentRows();
    expect(bank.questions).toHaveLength(1);
    expect(bank.questions[0]).toMatchObject({ moduleId, kind: "multiple_choice" });
    expect(bank.options).toHaveLength(3);
    expect(bank.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  test("the approved question is gradable through the learner surface", async () => {
    // The real proof: it is not just stored, it works.
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "approved",
    });

    const view = await admin().query(api.questions.adminList, { moduleSlug: "safeguarding" });
    expect(view.questions).toHaveLength(1);
    expect(view.questions[0].options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  test("rejecting writes nothing into the bank", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    const result = await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "rejected",
    });

    expect(result.assessmentQuestionId).toBeNull();
    expect((await assessmentRows()).questions).toHaveLength(0);
  });

  test("an edited prompt is what gets stored and what gets graded", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "edited",
      editedPrompt: "  Rewritten by a human.  ",
    });

    const bank = await assessmentRows();
    expect(bank.questions[0].prompt).toBe("Rewritten by a human.");
    // And the draft carries the correction too, so the queue stops showing the
    // sentence the reviewer already rejected.
    const after = await t.run(async (ctx) => await ctx.db.get("aiQuestions", row.question._id));
    expect(after?.prompt).toBe("Rewritten by a human.");
  });

  test("the decision is recorded with the reviewer's note", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "rejected",
      note: "Not in the policy.",
    });

    const decisions = await t.run(async (ctx) => await ctx.db.query("aiReviewDecisions").take(10));
    expect(decisions.map((d) => d.decision)).toEqual(["rejected"]);
    expect(decisions[0].note).toBe("Not in the policy.");
  });

  test("a question the model got wrong cannot be approved", async () => {
    // Two correct answers is ungradable. The generator filters these out, but
    // approval runs the same gate a hand-typed question passes — a model earns
    // no exemption just because a person clicked approve.
    await t.run(async (ctx) => {
      const questionId = await ctx.db.insert("aiQuestions", {
        moduleId,
        generationId,
        prompt: "Which of these?",
        difficulty: "Easy" as const,
        confidencePercent: 50,
        status: "pending" as const,
      });
      for (const [i, text] of ["A", "B"].entries()) {
        await ctx.db.insert("aiQuestionOptions", {
          questionId,
          key: text,
          text: `Answer ${text}`,
          isCorrect: true,
          order: i + 1,
        });
      }
    });

    const row = await pendingQuestion();
    await expect(
      admin().mutation(api.aiReviewQueue.setDecision, {
        questionId: row.question._id,
        decision: "approved",
      }),
    ).rejects.toThrow(/exactly one/i);

    expect((await assessmentRows()).questions).toHaveLength(0);
  });

  test("the counters follow the decision", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "approved",
    });

    const counters = await t.run(async (ctx) => await ctx.db.query("counters").take(10));
    const value = (name: string) => counters.find((c) => c.name === name)?.value;
    expect(value("ai_questions_pending")).toBe(0);
    expect(value("ai_questions_approved")).toBe(1);
  });
});

describe("the queue is the work left, not the history", () => {
  /** A second run, so "filter by source" has two things to tell apart. */
  const secondRun = async (sourceFileName: string) =>
    await t.run(
      async (ctx) =>
        await ctx.db.insert("aiGenerations", {
          status: "complete" as const,
          moduleId,
          sourceFileName,
          startedAt: Date.now() + 1,
          completedAt: Date.now() + 2,
          questionCount: 0,
        }),
    );

  const prompts = async (runId?: Id<"aiGenerations">) => {
    const view = await admin().query(
      api.aiReviewQueue.queue,
      runId === undefined ? {} : { generationId: runId },
    );
    return view.questions.map((row) => row.question.prompt);
  };

  test("a decided question leaves the list", async () => {
    // The reported bug: the screen showed every question ever generated,
    // because `queue` read `by_status` with no equality bound at all.
    await record([GOOD, { ...GOOD, prompt: "Second question?" }]);
    const row = await pendingNamed(GOOD.prompt);
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "approved",
    });

    expect(await prompts()).toEqual(["Second question?"]);
  });

  test("a queue full of decided drafts cannot crowd out a new one", async () => {
    // The `.take(MAX_QUEUE)` truncates before any sort can run, so an
    // unfiltered read would eventually stop reaching pending rows entirely.
    await t.run(async (ctx) => {
      for (let i = 0; i < 220; i++) {
        await ctx.db.insert("aiQuestions", {
          moduleId,
          generationId,
          prompt: `Old question ${i}`,
          difficulty: "Easy" as const,
          confidencePercent: 50,
          status: "approved" as const,
        });
      }
    });
    await record([GOOD]);

    expect(await prompts()).toEqual([GOOD.prompt]);
  });

  test("filtering by run shows that upload's drafts and no other's", async () => {
    await record([GOOD]);
    const other = await secondRun("Communication-Mastery-Notes.pdf");
    await t.mutation(internal.aiReviewQueue.recordQuestions, {
      generationId: other,
      moduleId,
      questions: [{ ...GOOD, prompt: "From the newer PDF?" }],
    });

    expect(await prompts(other)).toEqual(["From the newer PDF?"]);
    expect(await prompts(generationId)).toEqual([GOOD.prompt]);
    // Unfiltered still shows both, newest first.
    expect(await prompts()).toEqual(["From the newer PDF?", GOOD.prompt]);
  });

  test("each card names the document it came from", async () => {
    const other = await secondRun("Communication-Mastery-Notes.pdf");
    await t.mutation(internal.aiReviewQueue.recordQuestions, {
      generationId: other,
      moduleId,
      questions: [GOOD],
    });

    const view = await admin().query(api.aiReviewQueue.queue, {});
    expect(view.questions[0].sourceFileName).toBe("Communication-Mastery-Notes.pdf");
  });

  test("the filter counts only what is still pending in each run", async () => {
    await record([GOOD, { ...GOOD, prompt: "Second question?" }]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "rejected",
    });

    const view = await admin().query(api.aiReviewQueue.queue, {});
    const run = view.generations.find((entry) => entry.run._id === generationId);
    expect(run?.pendingCount).toBe(1);
    expect(view.pendingCount).toBe(1);
    expect(view.reviewedCount).toBe(1);
    expect(view.decisions.rejected).toBe(1);
  });
});

describe("a draft is decided once", () => {
  const approve = async (questionId: Id<"aiQuestions">) =>
    await admin().mutation(api.aiReviewQueue.setDecision, { questionId, decision: "approved" });

  test("approving twice is refused, and the bank keeps one copy", async () => {
    // The fault that put five identical questions in front of a teacher on
    // production: nothing checked the draft's status, so every re-approval
    // inserted the question again.
    await record([GOOD]);
    const row = await pendingQuestion();
    await approve(row.question._id);

    await expect(approve(row.question._id)).rejects.toThrow(/already approved/i);
    expect((await assessmentRows()).questions).toHaveLength(1);
  });

  test("rejecting an approved question is refused too", async () => {
    // Worse than a duplicate: it used to flip the draft to rejected and leave
    // the real question on the module, with nothing pointing at it.
    await record([GOOD]);
    const row = await pendingQuestion();
    await approve(row.question._id);

    await expect(
      admin().mutation(api.aiReviewQueue.setDecision, {
        questionId: row.question._id,
        decision: "rejected",
      }),
    ).rejects.toThrow(/already approved/i);

    const after = await t.run(async (ctx) => await ctx.db.get("aiQuestions", row.question._id));
    expect(after?.status).toBe("approved");
    expect((await assessmentRows()).questions).toHaveLength(1);
  });

  test("an approval remembers the question it created", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    const { assessmentQuestionId } = await approve(row.question._id);

    const after = await t.run(async (ctx) => await ctx.db.get("aiQuestions", row.question._id));
    expect(after?.assessmentQuestionId).toBe(assessmentQuestionId);
  });

  test("a rejection leaves no assessment question to point at", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "rejected",
    });

    const after = await t.run(async (ctx) => await ctx.db.get("aiQuestions", row.question._id));
    expect(after?.assessmentQuestionId).toBeUndefined();
  });
});

describe("clearing drafts out", () => {
  const counter = async (name: string) =>
    await t.run(
      async (ctx) => (await ctx.db.query("counters").take(10)).find((c) => c.name === name)?.value,
    );

  test("discarding removes the draft and its options", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.discardQuestion, { questionId: row.question._id });

    const left = await t.run(async (ctx) => ({
      questions: await ctx.db.query("aiQuestions").take(10),
      options: await ctx.db.query("aiQuestionOptions").take(10),
    }));
    expect(left.questions).toHaveLength(0);
    expect(left.options).toHaveLength(0);
  });

  test("discarding a pending draft takes it off the pending count", async () => {
    await record([GOOD]);
    const row = await pendingQuestion();
    expect(await counter("ai_questions_pending")).toBe(1);

    await admin().mutation(api.aiReviewQueue.discardQuestion, { questionId: row.question._id });
    expect(await counter("ai_questions_pending")).toBe(0);
  });

  test("discarding a decided draft does not un-count the decision", async () => {
    // The pending counter is a row count. The approved counter is a tally of
    // judgements made, and tidying the paperwork does not un-make one.
    await record([GOOD]);
    const row = await pendingQuestion();
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "approved",
    });

    await admin().mutation(api.aiReviewQueue.discardQuestion, { questionId: row.question._id });
    expect(await counter("ai_questions_pending")).toBe(0);
    expect(await counter("ai_questions_approved")).toBe(1);
  });

  test("clearing reviewed keeps the pending work and the approved questions", async () => {
    await record([GOOD, { ...GOOD, prompt: "Second question?" }]);
    const row = await pendingNamed(GOOD.prompt);
    await admin().mutation(api.aiReviewQueue.setDecision, {
      questionId: row.question._id,
      decision: "approved",
    });

    const { removed } = await admin().mutation(api.aiReviewQueue.clearReviewed, {});
    expect(removed).toBe(1);

    const view = await admin().query(api.aiReviewQueue.queue, {});
    expect(view.questions.map((q) => q.question.prompt)).toEqual(["Second question?"]);
    // Nothing left to clear, but the approval still counts as having happened.
    expect(view.reviewedCount).toBe(0);
    expect(view.decisions.approved).toBe(1);

    // The point of the whole feature: the teacher's question survives the
    // clean-up of the draft that produced it.
    expect((await assessmentRows()).questions).toHaveLength(1);
  });

  test("clearing reviewed with nothing decided removes nothing", async () => {
    await record([GOOD]);
    const { removed } = await admin().mutation(api.aiReviewQueue.clearReviewed, {});
    expect(removed).toBe(0);
    expect(await counter("ai_questions_pending")).toBe(1);
  });
});
