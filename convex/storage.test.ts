/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Component from "@convex-dev/r2/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * File storage tests.
 *
 * Uploads are the one place in the admin console where an unguarded mutation
 * costs money rather than just leaking data: an open upload-URL mutation lets
 * anyone fill the R2 bucket. So `generateUploadUrl` gets the full set of authz
 * negatives, exactly like every content mutation.
 *
 * Nothing here touches the network. Presigning is local HMAC work, and R2
 * credentials come from the fake values in `vitest.config.ts`. `deleteObject`
 * enqueues a scheduled action rather than calling R2 inline, and no test calls
 * `finishInProgressScheduledFunctions`, so the delete is never dispatched —
 * that a blob really disappears is proven by hand against the bucket, not here.
 */

const modules = import.meta.glob("./**/*.ts");

function newTest() {
  const t = convexTest(schema, modules);
  r2Component.register(t);
  // R2 uses action-retrier internally, so at runtime the nested component is
  // addressed as "r2/actionRetrier". `r2Component.register` registers it under
  // the bare name "actionRetrier", which the runtime never looks up, so a
  // mutation that deletes a blob fails on an unregistered component. Register
  // it again under the path that is actually used.
  actionRetrier.register(t, "r2/actionRetrier");
  return t;
}

type Fixture = {
  adminId: Id<"users">;
  staffId: Id<"users">;
  inactiveAdminId: Id<"users">;
  moduleId: Id<"modules">;
};

async function seedFixture(t: ReturnType<typeof convexTest>): Promise<Fixture> {
  return await t.run(async (ctx) => {
    const phaseId = await ctx.db.insert("phases", {
      name: "Foundation Phase",
      order: 1,
      isActive: true,
    });
    const base = {
      phaseId,
      employmentStatus: "active" as const,
      cptdPoints: 0,
      xpTotal: 0,
      compliancePercent: 0,
    };
    const adminId = await ctx.db.insert("users", {
      ...base,
      firstName: "Ada",
      lastName: "Admin",
      email: "ada.admin@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });
    const staffId = await ctx.db.insert("users", {
      ...base,
      firstName: "Sam",
      lastName: "Staff",
      email: "sam.staff@cliffview.example",
      jobTitle: "Teacher",
      accessRole: "staff",
    });
    const inactiveAdminId = await ctx.db.insert("users", {
      ...base,
      employmentStatus: "inactive" as const,
      firstName: "Ivy",
      lastName: "Inactive",
      email: "ivy.inactive@cliffview.example",
      jobTitle: "Head of Department",
      accessRole: "smt_admin",
    });
    const moduleId = await ctx.db.insert("modules", {
      slug: "storage-fixture",
      number: "01",
      sequence: 1,
      title: "Storage Fixture",
      description: "d",
      audience: "a",
      outcome: "o",
      category: "Core Policies" as const,
      durationMinutes: 10,
      cptdPoints: 1,
      passMark: 80,
      format: "Self-paced",
      publishState: "draft" as const,
      contentUpdatedAt: Date.now(),
    });

    return { adminId, staffId, inactiveAdminId, moduleId };
  });
}

const asUser = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.withIdentity({ subject: userId });

describe("generateUploadUrl is admin-only", () => {
  test("no identity is refused", async () => {
    const t = newTest();
    await seedFixture(t);
    await expect(t.mutation(api.assets.generateUploadUrl, {})).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    await expect(asUser(t, staffId).mutation(api.assets.generateUploadUrl, {})).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });

  test("an inactive admin is refused", async () => {
    const t = newTest();
    const { inactiveAdminId } = await seedFixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.assets.generateUploadUrl, {}),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });

  test("a live session whose profile was deleted is refused", async () => {
    const t = newTest();
    const { adminId } = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.delete("users", adminId);
    });
    await expect(asUser(t, adminId).mutation(api.assets.generateUploadUrl, {})).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("an admin gets a server-issued key and a presigned url", async () => {
    const t = newTest();
    const { adminId } = await seedFixture(t);
    const { key, url } = await asUser(t, adminId).mutation(api.assets.generateUploadUrl, {});

    expect(key.length).toBeGreaterThan(0);
    // The caller cannot name the key, which is what stops one upload being
    // aimed at another asset's blob.
    expect(url).toContain(key);
    expect(url).toContain("X-Amz-Signature");
  });
});

describe("syncMetadata is admin-only too", () => {
  // It is the other public mutation the component generates, and it is gated by
  // the same `checkUpload` callback rather than by a handler body — which is
  // easy to miss when reading `assets.ts`, since the gate is not a line in a
  // handler we wrote. Left ungated it would let anyone trigger an R2 HEAD and a
  // metadata write for an arbitrary key.
  test("no identity is refused", async () => {
    const t = newTest();
    await seedFixture(t);
    await expect(t.mutation(api.assets.syncMetadata, { key: "k1" })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
  });

  test("a staff identity is refused", async () => {
    const t = newTest();
    const { staffId } = await seedFixture(t);
    await expect(
      asUser(t, staffId).mutation(api.assets.syncMetadata, { key: "k1" }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an inactive admin is refused", async () => {
    const t = newTest();
    const { inactiveAdminId } = await seedFixture(t);
    await expect(
      asUser(t, inactiveAdminId).mutation(api.assets.syncMetadata, { key: "k1" }),
    ).rejects.toThrow(/FORBIDDEN|not active/i);
  });
});

describe("attachFile", () => {
  async function anAsset(t: ReturnType<typeof convexTest>, fixture: Fixture, title: string) {
    return await asUser(t, fixture.adminId).mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title,
      kind: "document",
    });
  }

  test("no identity is refused", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");
    await expect(
      t.mutation(api.assets.attachFile, { assetId, key: "k1", fileName: "policy.pdf" }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/i);
  });

  test("a staff identity is refused", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");
    await expect(
      asUser(t, fixture.staffId).mutation(api.assets.attachFile, {
        assetId,
        key: "k1",
        fileName: "policy.pdf",
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an admin records the file on the asset", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");

    await asUser(t, fixture.adminId).mutation(api.assets.attachFile, {
      assetId,
      key: "objects/policy-1",
      fileName: "policy.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });

    const asset = await t.run(async (ctx) => await ctx.db.get("assets", assetId));
    expect(asset).toMatchObject({
      r2Key: "objects/policy-1",
      fileName: "policy.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });
  });

  test("a key already attached to another asset is refused", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const first = await anAsset(t, fixture, "First");
    const second = await anAsset(t, fixture, "Second");
    const admin = asUser(t, fixture.adminId);

    await admin.mutation(api.assets.attachFile, {
      assetId: first,
      key: "shared-key",
      fileName: "a.pdf",
    });

    // Two assets pointing at one blob would mean deleting either breaks the
    // other, so this is refused rather than allowed to happen quietly.
    await expect(
      admin.mutation(api.assets.attachFile, {
        assetId: second,
        key: "shared-key",
        fileName: "b.pdf",
      }),
    ).rejects.toThrow(/INVALID|already attached/i);
  });

  test("a blank file name is refused", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");
    await expect(
      asUser(t, fixture.adminId).mutation(api.assets.attachFile, {
        assetId,
        key: "k1",
        fileName: "   ",
      }),
    ).rejects.toThrow(/INVALID|needs a name/i);
  });

  test("a file over the size cap is refused", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");
    await expect(
      asUser(t, fixture.adminId).mutation(api.assets.attachFile, {
        assetId,
        key: "k1",
        fileName: "huge.mp4",
        sizeBytes: 200 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(/INVALID|larger than/i);
  });

  test("replacing a file repoints the key and drops the old file's facts", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");
    const admin = asUser(t, fixture.adminId);

    await admin.mutation(api.assets.attachFile, {
      assetId,
      key: "old-key",
      fileName: "old.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    // Page count and duration are never recomputed, so a replacement inheriting
    // them would describe the new file with the old file's numbers.
    await t.run(async (ctx) => {
      await ctx.db.patch("assets", assetId, { pageCount: 12, durationSeconds: 600 });
    });

    await admin.mutation(api.assets.attachFile, {
      assetId,
      key: "new-key",
      fileName: "new.pdf",
      contentType: "application/pdf",
      sizeBytes: 4000,
    });

    const asset = await t.run(async (ctx) => await ctx.db.get("assets", assetId));
    expect(asset?.r2Key).toBe("new-key");
    expect(asset?.fileName).toBe("new.pdf");
    expect(asset?.sizeBytes).toBe(4000);
    expect(asset?.pageCount).toBeUndefined();
    expect(asset?.durationSeconds).toBeUndefined();
  });

  test("re-attaching the same key is not treated as a replacement", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await anAsset(t, fixture, "Doc");
    const admin = asUser(t, fixture.adminId);

    await admin.mutation(api.assets.attachFile, { assetId, key: "same", fileName: "a.pdf" });
    // Would delete the blob it is about to point at if the guard compared
    // wrongly.
    await admin.mutation(api.assets.attachFile, { assetId, key: "same", fileName: "a.pdf" });

    const asset = await t.run(async (ctx) => await ctx.db.get("assets", assetId));
    expect(asset?.r2Key).toBe("same");
  });
});

describe("detachFile", () => {
  test("a staff identity is refused", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await asUser(t, fixture.adminId).mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });
    await expect(
      asUser(t, fixture.staffId).mutation(api.assets.detachFile, { assetId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("an admin clears every file field", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const admin = asUser(t, fixture.adminId);
    const assetId = await admin.mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });
    await admin.mutation(api.assets.attachFile, {
      assetId,
      key: "k1",
      fileName: "policy.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });

    await admin.mutation(api.assets.detachFile, { assetId });

    const asset = await t.run(async (ctx) => await ctx.db.get("assets", assetId));
    expect(asset?.r2Key).toBeUndefined();
    expect(asset?.fileName).toBeUndefined();
    expect(asset?.contentType).toBeUndefined();
    expect(asset?.sizeBytes).toBeUndefined();
    // The row survives; only its file is gone.
    expect(asset?.title).toBe("Doc");
  });

  test("an asset with no file is a no-op rather than an error", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const admin = asUser(t, fixture.adminId);
    const assetId = await admin.mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });
    await expect(admin.mutation(api.assets.detachFile, { assetId })).resolves.toBeNull();
  });
});

describe("download urls", () => {
  test("adminDetail returns null until a file is attached, then a signed url", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const admin = asUser(t, fixture.adminId);
    const assetId = await admin.mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });

    const before = await admin.query(api.assets.adminDetail, {
      moduleSlug: "storage-fixture",
      assetId,
    });
    expect(before.fileUrl).toBeNull();

    await admin.mutation(api.assets.attachFile, {
      assetId,
      key: "objects/policy-1",
      fileName: "policy.pdf",
    });

    const after = await admin.query(api.assets.adminDetail, {
      moduleSlug: "storage-fixture",
      assetId,
    });
    expect(after.fileUrl).toContain("objects/policy-1");
    expect(after.fileUrl).toContain("X-Amz-Signature");
    // Expiring credential, never written to the row.
    const asset = await t.run(async (ctx) => await ctx.db.get("assets", assetId));
    expect(JSON.stringify(asset)).not.toContain("X-Amz-Signature");
  });

  test("a staff identity cannot read a download url", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const assetId = await asUser(t, fixture.adminId).mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });
    await expect(
      asUser(t, fixture.staffId).query(api.assets.adminDetail, {
        moduleSlug: "storage-fixture",
        assetId,
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });
});

describe("deleting an asset takes its blob with it", () => {
  test("assets.remove succeeds for an asset that has a file", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const admin = asUser(t, fixture.adminId);
    const assetId = await admin.mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });
    await admin.mutation(api.assets.attachFile, {
      assetId,
      key: "objects/doomed",
      fileName: "policy.pdf",
    });

    await admin.mutation(api.assets.remove, { assetId });

    const asset = await t.run(async (ctx) => await ctx.db.get("assets", assetId));
    expect(asset).toBeNull();
  });

  test("modules.remove cascades through assets that have files", async () => {
    const t = newTest();
    const fixture = await seedFixture(t);
    const admin = asUser(t, fixture.adminId);
    const assetId = await admin.mutation(api.assets.create, {
      moduleId: fixture.moduleId,
      title: "Doc",
      kind: "document",
    });
    await admin.mutation(api.assets.attachFile, {
      assetId,
      key: "objects/cascade",
      fileName: "policy.pdf",
    });

    await admin.mutation(api.modules.remove, { moduleId: fixture.moduleId });

    const remaining = await t.run(async (ctx) => await ctx.db.query("assets").collect());
    expect(remaining).toHaveLength(0);
  });
});
