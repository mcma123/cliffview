/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

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

let t: ReturnType<typeof convexTest>;
let admin: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
let moduleId: Id<"modules">;

beforeEach(async () => {
  t = convexTest(schema, modules);
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
    expect(row?.attachedAssetCount).toBe(0);
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

describe("deletion safety", () => {
  test("a module with enrollments cannot be deleted", async () => {
    await t.run(async (ctx) => {
      const phaseId = await ctx.db.insert("phases", { name: "P2", order: 2, isActive: true });
      const userId = await ctx.db.insert("users", {
        phaseId,
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
        userId,
        moduleId,
        status: "in_progress",
        progressPercent: 50,
        assignedAt: Date.now(),
      });
    });

    await expect(admin.mutation(api.modules.remove, { moduleId })).rejects.toThrow(
      /IN_USE|Archive it instead/i,
    );
  });
});
