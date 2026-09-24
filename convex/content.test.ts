/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import resendComponent from "@convex-dev/resend/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Behaviour tests for the content mutations.
 *
 * These cover the invariants that the old UI only pretended to have: dense
 * ordering, a publish gate that actually checks, a join that cannot dangle, and
 * slug uniqueness. Each one corresponds to a defect the plan set out to fix.
 */

const modules = import.meta.glob("./**/*.ts");

/**
 * `convexTest` plus the R2 component.
 *
 * Phase 6 added `convex/convex.config.ts` and `app.use(r2)`, so the app now has
 * a component. Without registering it here every test that reaches storage —
 * and any mutation that cascades into a blob delete — fails on a missing
 * component rather than on the thing under test.
 */
function newTest() {
  const t = convexTest(schema, modules);
  r2Component.register(t);
  // R2 uses action-retrier internally, so at runtime the nested component is
  // addressed as "r2/actionRetrier". `r2Component.register` registers it under
  // the bare name "actionRetrier", which the runtime never looks up, so a
  // mutation that deletes a blob fails on an unregistered component. Register
  // it again under the path that is actually used.
  actionRetrier.register(t, "r2/actionRetrier");
  // Same lesson, three more times. Resend nests a rate limiter and two
  // workpools, and at runtime each is addressed by its path under the
  // parent, while `@convex-dev/resend/test` registers only the parent.
  // Without these, any mutation that queues an email dies on an
  // unregistered component.
  resendComponent.register(t);
  rateLimiter.register(t, "resend/rateLimiter");
  workpool.register(t, "resend/emailWorkpool");
  workpool.register(t, "resend/callbackWorkpool");
  return t;
}

let t: ReturnType<typeof convexTest>;
let admin: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
let moduleId: Id<"modules">;

beforeEach(async () => {
  t = newTest();
  const adminId = await t.run(async (ctx) => {
    const phaseId = await ctx.db.insert("phases", { name: "Senior", order: 1, isActive: true });
    return await ctx.db.insert("users", {
      phaseId,
      employmentStatus: "active",
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
      firstName: "Ada",
      lastName: "Admin",
      email: "ada@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });
  });
  admin = t.withIdentity({ subject: adminId });
  const created = await admin.mutation(api.modules.create, {
    title: "Ordering Fixture",
    category: "Core Policies",
    description: "d",
    audience: "a",
    outcome: "o",
  });
  moduleId = created.moduleId;
});

async function lessonOrder(): Promise<string[]> {
  const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
  return detail.lessons.map(({ lesson }) => lesson.title);
}

describe("lesson ordering", () => {
  test("new lessons append, and move swaps neighbours", async () => {
    for (const title of ["First", "Second", "Third"]) {
      await admin.mutation(api.lessons.create, { moduleId, title, kind: "reading" });
    }
    expect(await lessonOrder()).toEqual(["First", "Second", "Third"]);

    const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
    const third = detail.lessons[2].lesson._id;
    await admin.mutation(api.lessons.move, { lessonId: third, direction: "up" });
    expect(await lessonOrder()).toEqual(["First", "Third", "Second"]);
  });

  test("moving past the end is a no-op, not an error", async () => {
    const only = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Only",
      kind: "reading",
    });
    await admin.mutation(api.lessons.move, { lessonId: only.lessonId, direction: "up" });
    await admin.mutation(api.lessons.move, { lessonId: only.lessonId, direction: "down" });
    expect(await lessonOrder()).toEqual(["Only"]);
  });

  test("deleting a lesson closes the gap so order stays dense", async () => {
    const ids: Id<"lessons">[] = [];
    for (const title of ["A", "B", "C"]) {
      const made = await admin.mutation(api.lessons.create, { moduleId, title, kind: "reading" });
      ids.push(made.lessonId);
    }
    await admin.mutation(api.lessons.remove, { lessonId: ids[0] });

    const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
    expect(detail.lessons.map(({ lesson }) => lesson.order)).toEqual([1, 2]);
  });

  test("a stale reorder is rejected rather than dropping the new lesson", async () => {
    const a = await admin.mutation(api.lessons.create, { moduleId, title: "A", kind: "reading" });
    const b = await admin.mutation(api.lessons.create, { moduleId, title: "B", kind: "reading" });
    // Someone else adds a lesson after this client loaded the list.
    await admin.mutation(api.lessons.create, { moduleId, title: "C", kind: "reading" });

    await expect(
      admin.mutation(api.lessons.reorder, {
        moduleId,
        orderedIds: [b.lessonId, a.lessonId],
      }),
    ).rejects.toThrow(/STALE_ORDER|changed since/i);
  });
});

describe("the numbers on a module", () => {
  // `cptdPoints` is multiplied into XP and **incremented** onto users.xpTotal,
  // and awards are never recomputed — so a negative one would subtract from a
  // teacher's total permanently. These are the guards on that.
  test("a negative CPTD value is refused on create and on update", async () => {
    await expect(
      admin.mutation(api.modules.create, {
        title: "Negative Points",
        category: "Core Policies",
        cptdPoints: -3,
      }),
    ).rejects.toThrow(/whole number, zero or more/i);

    await expect(admin.mutation(api.modules.update, { moduleId, cptdPoints: -1 })).rejects.toThrow(
      /whole number, zero or more/i,
    );
  });

  test("a fractional CPTD value is refused — it would pay fractional XP", async () => {
    await expect(admin.mutation(api.modules.update, { moduleId, cptdPoints: 2.5 })).rejects.toThrow(
      /whole number/i,
    );
  });

  test("a negative duration is refused", async () => {
    await expect(
      admin.mutation(api.modules.update, { moduleId, durationMinutes: -10 }),
    ).rejects.toThrow(/whole number, zero or more/i);
  });

  test("a pass mark outside 0-100 is refused, on create as well as update", async () => {
    await expect(admin.mutation(api.modules.update, { moduleId, passMark: 101 })).rejects.toThrow(
      /between 0 and 100/i,
    );
    await expect(admin.mutation(api.modules.update, { moduleId, passMark: -1 })).rejects.toThrow(
      /between 0 and 100/i,
    );
    await expect(
      admin.mutation(api.modules.create, {
        title: "Bad Mark",
        category: "Core Policies",
        passMark: 150,
      }),
    ).rejects.toThrow(/between 0 and 100/i);
  });

  test("valid numbers round-trip through the editor", async () => {
    await admin.mutation(api.modules.update, {
      moduleId,
      category: "SMT Pathway",
      durationMinutes: 45,
      cptdPoints: 4,
      passMark: 70,
    });
    const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
    expect(detail.module).toMatchObject({
      category: "SMT Pathway",
      durationMinutes: 45,
      cptdPoints: 4,
      passMark: 70,
    });
  });

  test("create stores what it was given rather than the fallbacks", async () => {
    // The gap this closes: the console sent none of these, so every module it
    // made sat on 0 CPTD points and a pass mark nobody chose.
    const made = await admin.mutation(api.modules.create, {
      title: "Fully Specified",
      category: "Staff Development",
      durationMinutes: 25,
      cptdPoints: 3,
      passMark: 60,
    });
    const detail = await admin.query(api.modules.adminDetail, { slug: made.slug });
    expect(detail.module).toMatchObject({ durationMinutes: 25, cptdPoints: 3, passMark: 60 });
  });
});

describe("the publish gate", () => {
  test("a module with no published lesson cannot be published", async () => {
    await admin.mutation(api.lessons.create, { moduleId, title: "Draft only", kind: "reading" });
    await expect(admin.mutation(api.modules.publish, { moduleId })).rejects.toThrow(
      /NOT_READY|at least one lesson/i,
    );
  });

  test("empty copy blocks publishing", async () => {
    const bare = await admin.mutation(api.modules.create, {
      title: "Bare",
      category: "Core Policies",
    });
    await expect(admin.mutation(api.modules.publish, { moduleId: bare.moduleId })).rejects.toThrow(
      /NOT_READY/i,
    );
  });

  test("a complete module with a published lesson publishes", async () => {
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Ready",
      kind: "reading",
    });
    await admin.mutation(api.lessons.setPublishState, {
      lessonId: lesson.lessonId,
      publishState: "published",
    });
    await admin.mutation(api.modules.publish, { moduleId });

    const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
    expect(detail.module.publishState).toBe("published");
    expect(detail.module.publishedAt).toBeTypeOf("number");
  });

  test("setPublishState cannot be used to skip the gate", async () => {
    await expect(
      admin.mutation(api.modules.setPublishState, { moduleId, publishState: "published" }),
    ).rejects.toThrow(/USE_PUBLISH/i);
  });
});

describe("the lesson-asset join", () => {
  test("an empty join reports zero, not every non-video asset", async () => {
    // The defect this replaces: the old resolver fell back to all non-video
    // assets, so a brand-new lesson claimed three attachments.
    await admin.mutation(api.assets.create, { moduleId, title: "Doc", kind: "document" });
    await admin.mutation(api.assets.create, { moduleId, title: "Sheet", kind: "worksheet" });
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Fresh",
      kind: "reading",
    });

    const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
    const row = detail.lessons.find(({ lesson: l }) => l._id === lesson.lessonId);
    expect(row?.attachedAssetIds).toEqual([]);
  });

  test("attaching is idempotent", async () => {
    const assetId = await admin.mutation(api.assets.create, {
      moduleId,
      title: "Doc",
      kind: "document",
    });
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "L",
      kind: "reading",
    });
    await admin.mutation(api.lessons.attachAsset, { lessonId: lesson.lessonId, assetId });
    await admin.mutation(api.lessons.attachAsset, { lessonId: lesson.lessonId, assetId });

    const detail = await admin.query(api.lessons.adminDetail, {
      moduleSlug: "ordering-fixture",
      lessonSlug: "l",
    });
    expect(detail.linkedAssets).toHaveLength(1);
  });

  test("deleting an asset clears its join rows and hero references", async () => {
    const assetId = await admin.mutation(api.assets.create, {
      moduleId,
      title: "Hero",
      kind: "video",
    });
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "L",
      kind: "video",
    });
    await admin.mutation(api.lessons.attachAsset, { lessonId: lesson.lessonId, assetId });
    await admin.mutation(api.modules.update, { moduleId, featuredAssetId: assetId });

    await admin.mutation(api.assets.remove, { assetId });

    const detail = await admin.query(api.modules.adminDetail, { slug: "ordering-fixture" });
    expect(detail.featuredAsset).toBeNull();
    expect(detail.assets).toHaveLength(0);
    const lessonDetail = await admin.query(api.lessons.adminDetail, {
      moduleSlug: "ordering-fixture",
      lessonSlug: "l",
    });
    expect(lessonDetail.linkedAssets).toHaveLength(0);
  });
});

describe("adding material to a lesson", () => {
  async function lesson(title = "L") {
    return await admin.mutation(api.lessons.create, { moduleId, title, kind: "reading" });
  }

  test("one call uploads, attaches and publishes", async () => {
    const l = await lesson();
    const assetId = await admin.mutation(api.lessons.addMaterial, {
      lessonId: l.lessonId,
      key: "r2-key-video",
      fileName: "intro.mp4",
      title: "Intro",
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: 1024,
    });

    const detail = await admin.query(api.lessons.adminDetail, {
      moduleSlug: "ordering-fixture",
      lessonSlug: "l",
    });
    expect(detail.linkedAssets).toHaveLength(1);
    expect(detail.linkedAssets[0]._id).toBe(assetId);
    // Published, not draft. `learn.lesson` skips anything unpublished, so a
    // draft here is a file the admin uploaded and cannot see on the staff side.
    expect(detail.linkedAssets[0].publishState).toBe("published");
    expect(detail.linkedAssets[0].r2Key).toBe("r2-key-video");
    expect(detail.linkedAssets[0].fileName).toBe("intro.mp4");
  });

  test("several files land in the order they were added", async () => {
    const l = await lesson();
    for (const [i, name] of ["a.mp4", "b.pdf", "c.docx"].entries()) {
      await admin.mutation(api.lessons.addMaterial, {
        lessonId: l.lessonId,
        key: `r2-key-${i}`,
        fileName: name,
        title: name,
        kind: "document",
      });
    }

    const detail = await admin.query(api.lessons.adminDetail, {
      moduleSlug: "ordering-fixture",
      lessonSlug: "l",
    });
    expect(detail.linkedAssets.map((a) => a.title)).toEqual(["a.mp4", "b.pdf", "c.docx"]);
  });

  test("a key another asset already holds is refused", async () => {
    const l = await lesson();
    await admin.mutation(api.lessons.addMaterial, {
      lessonId: l.lessonId,
      key: "shared-key",
      fileName: "first.pdf",
      title: "First",
      kind: "document",
    });

    // Two assets sharing one blob would mean deleting either breaks the other.
    await expect(
      admin.mutation(api.lessons.addMaterial, {
        lessonId: l.lessonId,
        key: "shared-key",
        fileName: "second.pdf",
        title: "Second",
        kind: "document",
      }),
    ).rejects.toThrow(/INVALID|already attached/i);
  });

  test("a file over the size cap is refused", async () => {
    const l = await lesson();
    await expect(
      admin.mutation(api.lessons.addMaterial, {
        lessonId: l.lessonId,
        key: "too-big",
        fileName: "huge.mp4",
        title: "Huge",
        kind: "video",
        sizeBytes: 201 * 1024 * 1024,
      }),
    ).rejects.toThrow(/INVALID|larger than/i);
  });

  test("a blank title is refused", async () => {
    const l = await lesson();
    await expect(
      admin.mutation(api.lessons.addMaterial, {
        lessonId: l.lessonId,
        key: "k",
        fileName: "x.pdf",
        title: "   ",
        kind: "document",
      }),
    ).rejects.toThrow(/INVALID|needs a title/i);
  });
});

describe("reordering a lesson's material", () => {
  async function threeMaterials() {
    const l = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "L",
      kind: "reading",
    });
    const ids = [];
    for (const [i, name] of ["one", "two", "three"].entries()) {
      ids.push(
        await admin.mutation(api.lessons.addMaterial, {
          lessonId: l.lessonId,
          key: `key-${i}`,
          fileName: `${name}.pdf`,
          title: name,
          kind: "document",
        }),
      );
    }
    return { lessonId: l.lessonId, ids };
  }

  const titles = async () =>
    (
      await admin.query(api.lessons.adminDetail, {
        moduleSlug: "ordering-fixture",
        lessonSlug: "l",
      })
    ).linkedAssets.map((a) => a.title);

  test("the order a learner reads top to bottom is the order given", async () => {
    const { lessonId, ids } = await threeMaterials();
    expect(await titles()).toEqual(["one", "two", "three"]);

    await admin.mutation(api.lessons.reorderAssets, {
      lessonId,
      assetIds: [ids[2], ids[0], ids[1]],
    });

    expect(await titles()).toEqual(["three", "one", "two"]);
  });

  test("a partial set is refused rather than renumbering some rows", async () => {
    const { lessonId, ids } = await threeMaterials();
    await expect(
      admin.mutation(api.lessons.reorderAssets, { lessonId, assetIds: [ids[0], ids[1]] }),
    ).rejects.toThrow();
    // Nothing moved.
    expect(await titles()).toEqual(["one", "two", "three"]);
  });

  test("an asset that is not attached to this lesson is refused", async () => {
    const { lessonId, ids } = await threeMaterials();
    const stray = await admin.mutation(api.assets.create, {
      moduleId,
      title: "Stray",
      kind: "document",
    });
    await expect(
      admin.mutation(api.lessons.reorderAssets, {
        lessonId,
        assetIds: [ids[0], ids[1], stray],
      }),
    ).rejects.toThrow();
  });
});

describe("slugs", () => {
  test("a duplicate module title gets a distinct slug", async () => {
    const again = await admin.mutation(api.modules.create, {
      title: "Ordering Fixture",
      category: "Core Policies",
    });
    expect(again.slug).toBe("ordering-fixture-2");
  });

  test("lesson slugs only need to be unique within their module", async () => {
    const other = await admin.mutation(api.modules.create, {
      title: "Other",
      category: "Core Policies",
    });
    const first = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Why This Matters",
      kind: "video",
    });
    const second = await admin.mutation(api.lessons.create, {
      moduleId: other.moduleId,
      title: "Why This Matters",
      kind: "video",
    });
    // Same slug in two modules is correct: it is what keeps existing learner
    // URLs working across the seeded content.
    expect(first.slug).toBe("why-this-matters");
    expect(second.slug).toBe("why-this-matters");
  });
});

/**
 * Deleting a module.
 *
 * The property under test is that a delete leaves nothing behind that no index
 * can name again — and, just as importantly, that it leaves alone the things
 * that are not the module's to destroy: a teacher's streak, their XP, and the
 * badges they earned along the way.
 *
 * ⚠️ Every fixture here uses assets with **no `r2Key`**, and creates people by
 * inserting rows rather than through `staff.create`. `deleteObject` only
 * enqueues a scheduled action and `staff.create` schedules a real email, so a
 * test that drains the scheduler with either present would make live calls
 * against the production bucket and the mail provider. See `convex/AGENTS.md`.
 */
describe("deleting a module", () => {
  /** A second module, so "the rest of the library is untouched" is testable. */
  async function secondModule(): Promise<Id<"modules">> {
    const created = await admin.mutation(api.modules.create, {
      title: "Survivor",
      category: "Core Policies",
      description: "d",
      audience: "a",
      outcome: "o",
    });
    return created.moduleId;
  }

  async function staffMember(): Promise<Id<"users">> {
    return await t.run(async (ctx) => {
      const phase = await ctx.db.query("phases").take(1);
      return await ctx.db.insert("users", {
        phaseId: phase[0]._id,
        employmentStatus: "active",
        cptdPoints: 12,
        xpTotal: 340,
        compliancePercent: 50,
        firstName: "Sam",
        lastName: "Staff",
        email: "sam@cliffview.example",
        jobTitle: "Teacher",
        accessRole: "staff",
      });
    });
  }

  const enrol = async (userId: Id<"users">, target: Id<"modules">, progressPercent: number) =>
    await t.run(
      async (ctx) =>
        await ctx.db.insert("enrollments", {
          userId,
          moduleId: target,
          status: progressPercent === 100 ? "completed" : "in_progress",
          progressPercent,
          assignedAt: Date.now(),
          ...(progressPercent === 100 ? { completedAt: Date.now() } : {}),
        }),
    );

  const rows = async (table: "lessons" | "assets" | "assessmentQuestions" | "enrollments") =>
    await t.run(async (ctx) => await ctx.db.query(table).take(50));

  const counter = async (name: string) =>
    await t.run(
      async (ctx) => (await ctx.db.query("counters").take(10)).find((c) => c.name === name)?.value,
    );

  test("a module with enrollments cannot be deleted", async () => {
    // Unchanged from before the opt-in existed, and now pinning the default:
    // the refusal is what happens when nobody asked for anything else.
    const userId = await staffMember();
    await enrol(userId, moduleId, 50);

    await expect(admin.mutation(api.modules.remove, { moduleId })).rejects.toThrow(
      /IN_USE|Archive it instead/i,
    );
  });

  test("opting in without typing the name is refused, and deletes nothing", async () => {
    const userId = await staffMember();
    await enrol(userId, moduleId, 50);

    await expect(
      admin.mutation(api.modules.remove, { moduleId, deleteEnrollments: true }),
    ).rejects.toThrow(/CONFIRM_REQUIRED|Type the module/i);

    await expect(
      admin.mutation(api.modules.remove, {
        moduleId,
        deleteEnrollments: true,
        confirm: "some-other-module",
      }),
    ).rejects.toThrow(/CONFIRM_REQUIRED|Type the module/i);

    // The assertion that matters: a gate which throws *after* deleting is not
    // a gate. Both the module and the enrolment survive.
    expect(await rows("enrollments")).toHaveLength(1);
    expect(await rows("lessons")).toHaveLength(0);
    const still = await t.run(async (ctx) => await ctx.db.get("modules", moduleId));
    expect(still).not.toBeNull();
  });

  test("the whole cascade goes, and nothing outside the module moves", async () => {
    const userId = await staffMember();
    const survivor = await secondModule();

    // Module content: a lesson with an attached asset, an objective, a
    // question, and AI drafts in two different states.
    const lesson = await admin.mutation(api.lessons.create, {
      moduleId,
      title: "Only lesson",
      kind: "reading",
    });
    const assetId = await t.run(
      async (ctx) =>
        await ctx.db.insert("assets", {
          moduleId,
          title: "Notes",
          description: "",
          kind: "document",
          publishState: "draft",
          order: 1,
          contentUpdatedAt: Date.now(),
          // No r2Key on purpose — see the note above this describe block.
        }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("lessonAssets", {
        lessonId: lesson.lessonId,
        assetId,
        order: 1,
      });
      await ctx.db.insert("moduleObjectives", { moduleId, text: "Know the policy", order: 1 });

      const questionId = await ctx.db.insert("assessmentQuestions", {
        moduleId,
        kind: "multiple_choice",
        prompt: "Which one?",
        order: 1,
        contentUpdatedAt: Date.now(),
      });
      await ctx.db.insert("assessmentQuestionOptions", {
        questionId,
        text: "This one",
        isCorrect: true,
        order: 1,
      });

      const generationId = await ctx.db.insert("aiGenerations", {
        status: "complete",
        moduleId,
        startedAt: Date.now(),
        questionCount: 2,
      });
      for (const status of ["pending", "approved"] as const) {
        const draftId = await ctx.db.insert("aiQuestions", {
          moduleId,
          generationId,
          prompt: `A ${status} draft`,
          difficulty: "Easy",
          confidencePercent: 70,
          status,
        });
        await ctx.db.insert("aiQuestionOptions", {
          questionId: draftId,
          key: "A",
          text: "An answer",
          isCorrect: true,
          order: 1,
        });
        await ctx.db.insert("aiReviewDecisions", {
          questionId: draftId,
          decision: "approved",
          reviewerId: "someone",
          decidedAt: Date.now(),
        });
      }
      // The pending counter as `recordQuestions` would have left it.
      await ctx.db.insert("counters", { name: "ai_questions_pending", value: 1 });

      // Learner state against the module being deleted.
      await ctx.db.insert("lessonProgress", {
        userId,
        lessonId: lesson.lessonId,
        moduleId,
        status: "completed",
        lastViewedAt: Date.now(),
      });
      await ctx.db.insert("assessmentAttempts", {
        userId,
        moduleId,
        scorePercent: 90,
        passed: true,
        attemptedAt: Date.now(),
      });

      // Things that must survive it.
      await ctx.db.insert("progressEvents", {
        userId,
        moduleId,
        kind: "lesson_completed",
        occurredAt: Date.now(),
        monthKey: "2026-09",
      });
      await ctx.db.insert("badgeAwards", {
        userId,
        badgeKey: "first_module",
        awardedAt: Date.now(),
      });
    });

    await enrol(userId, moduleId, 40);
    await enrol(userId, survivor, 100);

    const result = await admin.mutation(api.modules.remove, {
      moduleId,
      deleteEnrollments: true,
      confirm: "ordering-fixture",
    });
    expect(result.done).toBe(true);

    const left = await t.run(async (ctx) => ({
      modules: await ctx.db.query("modules").take(10),
      lessons: await ctx.db.query("lessons").take(10),
      lessonAssets: await ctx.db.query("lessonAssets").take(10),
      lessonProgress: await ctx.db.query("lessonProgress").take(10),
      assets: await ctx.db.query("assets").take(10),
      objectives: await ctx.db.query("moduleObjectives").take(10),
      questions: await ctx.db.query("assessmentQuestions").take(10),
      questionOptions: await ctx.db.query("assessmentQuestionOptions").take(10),
      attempts: await ctx.db.query("assessmentAttempts").take(10),
      aiQuestions: await ctx.db.query("aiQuestions").take(10),
      aiQuestionOptions: await ctx.db.query("aiQuestionOptions").take(10),
      aiDecisions: await ctx.db.query("aiReviewDecisions").take(10),
      aiGenerations: await ctx.db.query("aiGenerations").take(10),
      enrollments: await ctx.db.query("enrollments").take(10),
      progressEvents: await ctx.db.query("progressEvents").take(10),
      badges: await ctx.db.query("badgeAwards").take(10),
      user: await ctx.db.get("users", userId),
    }));

    // Everything the module owned.
    expect(left.lessons).toHaveLength(0);
    expect(left.lessonAssets).toHaveLength(0);
    expect(left.lessonProgress).toHaveLength(0);
    expect(left.assets).toHaveLength(0);
    expect(left.objectives).toHaveLength(0);
    expect(left.questions).toHaveLength(0);
    expect(left.questionOptions).toHaveLength(0);
    expect(left.attempts).toHaveLength(0);
    expect(left.aiQuestions).toHaveLength(0);
    expect(left.aiQuestionOptions).toHaveLength(0);
    expect(left.aiDecisions).toHaveLength(0);
    expect(left.aiGenerations).toHaveLength(0);

    // The rest of the library is untouched.
    expect(left.modules.map((row) => row.title)).toEqual(["Survivor"]);
    expect(left.enrollments).toHaveLength(1);
    expect(left.enrollments[0].moduleId).toBe(survivor);

    // Compliance is the mean over what is left, not a stale average and not
    // zero. This is the assertion that catches a missing recompute.
    expect(left.user?.compliancePercent).toBe(100);

    // Earned things stay earned: an award records what somebody was paid at
    // the time, and deleting content does not un-pay them.
    expect(left.user?.xpTotal).toBe(340);
    expect(left.user?.cptdPoints).toBe(12);
    expect(left.badges).toHaveLength(1);

    // And the streak survives. `progressEvents.moduleId` is a reference
    // nothing dereferences, so deleting these rows would reset a real
    // teacher's streak to tidy up content they never saw.
    expect(left.progressEvents).toHaveLength(1);

    // Only the pending draft moves the pending counter.
    expect(await counter("ai_questions_pending")).toBe(0);

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLog").take(50));
    expect(audit.filter((row) => row.action === "module.remove")).toHaveLength(1);
  });

  test("a module nobody is enrolled in needs no confirmation at all", async () => {
    await admin.mutation(api.lessons.create, { moduleId, title: "L", kind: "reading" });
    const result = await admin.mutation(api.modules.remove, { moduleId });

    expect(result.done).toBe(true);
    expect(await rows("lessons")).toHaveLength(0);
    expect(await rows("enrollments")).toHaveLength(0);
  });
});

describe("deleting the whole library", () => {
  /**
   * Drain the scheduled continuation chain.
   *
   * Fake timers only for this call, per convex-test's own note: steps queued
   * with `runAfter(0)` while real timers were active are still drained, and
   * leaving the clock faked would affect every other test in this file.
   */
  async function drain() {
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
  }
  const titles = async () =>
    await t.run(async (ctx) =>
      (await ctx.db.query("modules").take(50)).map((row) => row.title).sort(),
    );

  async function extraModule(title: string): Promise<Id<"modules">> {
    const created = await admin.mutation(api.modules.create, {
      title,
      category: "Core Policies",
      description: "d",
      audience: "a",
      outcome: "o",
    });
    return created.moduleId;
  }

  test("the phrase has to be typed, and a wrong one deletes nothing", async () => {
    await expect(
      admin.mutation(api.modules.removeAll, { confirm: "yes", expectedModuleCount: 1 }),
    ).rejects.toThrow(/CONFIRM_REQUIRED|Type/i);

    await drain();
    expect(await titles()).toEqual(["Ordering Fixture"]);
  });

  test("a count that no longer matches is refused rather than deleting more", async () => {
    await extraModule("Added Since");

    // The admin agreed to delete one module; two exist now.
    await expect(
      admin.mutation(api.modules.removeAll, {
        confirm: "delete every module",
        expectedModuleCount: 1,
      }),
    ).rejects.toThrow(/CHANGED|not 1/i);

    await drain();
    expect(await titles()).toEqual(["Added Since", "Ordering Fixture"]);
  });

  test("every module goes, and the walk finishes on its own", async () => {
    await extraModule("Second");
    await extraModule("Third");

    const { moduleCount } = await admin.mutation(api.modules.removeAll, {
      confirm: "delete every module",
      expectedModuleCount: 3,
    });
    expect(moduleCount).toBe(3);

    await drain();
    expect(await titles()).toEqual([]);

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLog").take(50));
    expect(audit.filter((row) => row.action === "module.remove")).toHaveLength(3);
    expect(audit.filter((row) => row.action === "module.removeAll.finished")).toHaveLength(1);
  });

  test("an enrolled module is stepped over, not allowed to stop the run", async () => {
    const second = await extraModule("Has Learners");
    await extraModule("Third");

    const userId = await t.run(async (ctx) => {
      const phase = await ctx.db.query("phases").take(1);
      const id = await ctx.db.insert("users", {
        phaseId: phase[0]._id,
        employmentStatus: "active",
        cptdPoints: 0,
        xpTotal: 0,
        compliancePercent: 0,
        firstName: "Sam",
        lastName: "Staff",
        email: "sam@cliffview.example",
        jobTitle: "Teacher",
        accessRole: "staff",
      });
      await ctx.db.insert("enrollments", {
        userId: id,
        moduleId: second,
        status: "in_progress",
        progressPercent: 30,
        assignedAt: Date.now(),
      });
      return id;
    });

    await admin.mutation(api.modules.removeAll, {
      confirm: "delete every module",
      expectedModuleCount: 3,
    });
    await drain();

    // Skipped, not refused: the run kept going and cleared the other two.
    expect(await titles()).toEqual(["Has Learners"]);

    // And with the opt-in it goes too, taking the enrolment with it.
    await admin.mutation(api.modules.removeAll, {
      confirm: "delete every module",
      expectedModuleCount: 1,
      deleteEnrollments: true,
    });
    await drain();

    expect(await titles()).toEqual([]);
    const after = await t.run(async (ctx) => ({
      enrollments: await ctx.db.query("enrollments").take(10),
      user: await ctx.db.get("users", userId),
    }));
    expect(after.enrollments).toHaveLength(0);
    // Nothing assigned is honestly zero, not a stale 30.
    expect(after.user?.compliancePercent).toBe(0);
  });
});

describe("deleting is admin-only", () => {
  /** A signed-in teacher, and an admin who has left. */
  async function outsiders() {
    return await t.run(async (ctx) => {
      const phase = await ctx.db.query("phases").take(1);
      const base = {
        phaseId: phase[0]._id,
        cptdPoints: 0,
        xpTotal: 0,
        compliancePercent: 0,
        jobTitle: "Teacher",
      };
      return {
        staffId: await ctx.db.insert("users", {
          ...base,
          employmentStatus: "active" as const,
          firstName: "Sam",
          lastName: "Staff",
          email: "sam@cliffview.example",
          accessRole: "staff" as const,
        }),
        goneId: await ctx.db.insert("users", {
          ...base,
          employmentStatus: "inactive" as const,
          firstName: "Gone",
          lastName: "Admin",
          email: "gone@cliffview.example",
          accessRole: "smt_admin" as const,
        }),
      };
    });
  }

  test("remove refuses everyone who is not a serving admin", async () => {
    const { staffId, goneId } = await outsiders();

    await expect(t.mutation(api.modules.remove, { moduleId })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
    await expect(
      t.withIdentity({ subject: staffId }).mutation(api.modules.remove, { moduleId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
    await expect(
      t.withIdentity({ subject: goneId }).mutation(api.modules.remove, { moduleId }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("removeAll and deletionImpact refuse them too", async () => {
    const { staffId, goneId } = await outsiders();
    const args = { confirm: "delete every module", expectedModuleCount: 1 };

    await expect(t.mutation(api.modules.removeAll, args)).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
    await expect(
      t.withIdentity({ subject: staffId }).mutation(api.modules.removeAll, args),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
    await expect(
      t.withIdentity({ subject: goneId }).mutation(api.modules.removeAll, args),
    ).rejects.toThrow(/FORBIDDEN|not active/i);

    await expect(
      t.withIdentity({ subject: staffId }).query(api.modules.deletionImpact, { moduleId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });
});

describe("what a delete would cost", () => {
  test("the counts are the module's own, and a second module does not add to them", async () => {
    await admin.mutation(api.lessons.create, { moduleId, title: "One", kind: "reading" });
    await admin.mutation(api.lessons.create, { moduleId, title: "Two", kind: "reading" });

    const other = await admin.mutation(api.modules.create, {
      title: "Elsewhere",
      category: "Core Policies",
      description: "d",
      audience: "a",
      outcome: "o",
    });
    await admin.mutation(api.lessons.create, {
      moduleId: other.moduleId,
      title: "Not counted",
      kind: "reading",
    });

    const userId = await t.run(async (ctx) => {
      const phase = await ctx.db.query("phases").take(1);
      const id = await ctx.db.insert("users", {
        phaseId: phase[0]._id,
        employmentStatus: "active",
        cptdPoints: 0,
        xpTotal: 0,
        compliancePercent: 0,
        firstName: "Sam",
        lastName: "Staff",
        email: "sam@cliffview.example",
        jobTitle: "Teacher",
        accessRole: "staff",
      });
      await ctx.db.insert("enrollments", {
        userId: id,
        moduleId,
        status: "completed",
        progressPercent: 100,
        assignedAt: Date.now(),
        completedAt: Date.now(),
      });
      return id;
    });
    expect(userId).toBeDefined();

    const impact = await admin.query(api.modules.deletionImpact, { moduleId });
    expect(impact).toMatchObject({
      slug: "ordering-fixture",
      lessons: 2,
      enrollments: 1,
      completedEnrollments: 1,
      truncated: false,
    });
  });
});
