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
 * AI video jobs.
 *
 * The property that matters: **a generated video is only ever reachable by a
 * teacher through one path** — the poller stores the bytes, and `attachResult`
 * puts them on the lesson an admin chose, exactly once, with a content type
 * that makes it play.
 *
 * ⚠️ **This suite must never drain the scheduler.** `t.finishAllScheduledFunctions`
 * would run the poller, which `fetch`es OpenRouter and writes to the real R2
 * bucket — `convex/AGENTS.md` already warns about the R2 half. Every test below
 * drives the mutations directly, the way `aiReview.test.ts` tests the question
 * pipeline without ever calling the model.
 *
 * The mirror of that rule lives in the other direction: `content.test.ts` and
 * `staff.test.ts` *do* drain, with `vi.runAllTimers`, which fires regardless of
 * delay. Neither may create an `aiVideoJobs` row, and no delete cascade may
 * resolve a job by scheduling anything.
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
let lessonId: Id<"lessons">;
let assetId: Id<"assets">;

const asUser = (userId: Id<"users">) => t.withIdentity({ subject: userId });
const admin = () => asUser(adminId);

/** A job in the state the poller would find it: claimed and generating. */
async function generatingJob(): Promise<Id<"aiVideoJobs">> {
  const jobId = await admin().mutation(api.aiVideoQueue.openJob, {
    lessonId,
    sourceAssetId: assetId,
    title: "Safeguarding in one shot",
  });
  await admin().mutation(internal.aiVideoQueue.claimForGeneration, {
    jobId,
    prompt: "A quiet staff room at dusk, a teacher reading a policy folder.",
    durationSeconds: 15,
    resolution: "720p",
    aspectRatio: "16:9",
  });
  return jobId;
}

const jobRow = async (jobId: Id<"aiVideoJobs">) =>
  await t.run(async (ctx) => await ctx.db.get("aiVideoJobs", jobId));

const attachments = async () =>
  await t.run(async (ctx) => ({
    assets: await ctx.db.query("assets").take(20),
    links: await ctx.db.query("lessonAssets").take(20),
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
    const lesson = await ctx.db.insert("lessons", {
      moduleId: mod,
      slug: "why-this-matters",
      title: "Why this matters",
      summary: "s",
      kind: "reading" as const,
      order: 1,
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
      lesson,
      // A readable document: kind and a file behind it.
      asset: await ctx.db.insert("assets", {
        moduleId: mod,
        title: "Safeguarding policy",
        description: "",
        kind: "document" as const,
        publishState: "published" as const,
        order: 1,
        r2Key: "source-doc-key",
        fileName: "policy.pdf",
        contentType: "application/pdf",
        contentUpdatedAt: Date.now(),
      }),
    };
  });
  adminId = ids.adminRow;
  staffId = ids.staffRow;
  inactiveAdminId = ids.inactiveAdminRow;
  moduleId = ids.mod;
  lessonId = ids.lesson;
  assetId = ids.asset;
});

describe("the queue is the school's, not a teacher's", () => {
  test("reading it needs a serving admin", async () => {
    const now = Date.now();
    await expect(t.query(api.aiVideoQueue.jobs, { now })).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
    await expect(asUser(staffId).query(api.aiVideoQueue.jobs, { now })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
    await expect(asUser(inactiveAdminId).query(api.aiVideoQueue.jobs, { now })).rejects.toThrow(
      /FORBIDDEN|not active/i,
    );
  });

  test("opening a job needs a serving admin", async () => {
    const args = { lessonId, sourceAssetId: assetId, title: "A video" };
    await expect(t.mutation(api.aiVideoQueue.openJob, args)).rejects.toThrow(
      /UNAUTHENTICATED|Sign in/i,
    );
    await expect(asUser(staffId).mutation(api.aiVideoQueue.openJob, args)).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
    await expect(asUser(inactiveAdminId).mutation(api.aiVideoQueue.openJob, args)).rejects.toThrow(
      /FORBIDDEN|not active/i,
    );
  });

  test("the claim is the gate for everything the poller then does", async () => {
    // The poller runs with no identity at all, so this mutation is where the
    // whole pipeline is authorized. If it stopped checking, generation would
    // be open to any signed-in teacher.
    const jobId = await admin().mutation(api.aiVideoQueue.openJob, {
      lessonId,
      sourceAssetId: assetId,
      title: "A video",
    });
    await expect(
      asUser(staffId).mutation(internal.aiVideoQueue.claimForGeneration, {
        jobId,
        prompt: "A scene.",
        durationSeconds: 15,
        resolution: "720p",
        aspectRatio: "16:9",
      }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("drafting is gated at the internal query the action calls first", async () => {
    // The action has no ctx.db, so this query IS the gate.
    await expect(
      asUser(staffId).query(internal.aiVideoQueue.sourceForDraft, { assetId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
  });

  test("cancelling needs a serving admin", async () => {
    const jobId = await generatingJob();
    await expect(asUser(staffId).mutation(api.aiVideoQueue.cancel, { jobId })).rejects.toThrow(
      /FORBIDDEN|Admin access/i,
    );
  });
});

describe("opening a job", () => {
  test("a job starts in drafting, pointed at its lesson and its document", async () => {
    const jobId = await admin().mutation(api.aiVideoQueue.openJob, {
      lessonId,
      sourceAssetId: assetId,
      title: "  Safeguarding in one shot  ",
    });

    const job = await jobRow(jobId);
    expect(job).toMatchObject({
      status: "drafting",
      lessonId,
      moduleId,
      sourceAssetId: assetId,
      sourceFileName: "policy.pdf",
      title: "Safeguarding in one shot",
      attempts: 0,
    });
    // Nothing has been generated, so nothing is attached.
    expect((await attachments()).assets).toHaveLength(1); // the source document only
  });

  test("a document from another module is refused", async () => {
    const other = await t.run(async (ctx) => {
      const mod = await ctx.db.insert("modules", {
        slug: "elsewhere",
        number: "02",
        sequence: 2,
        title: "Elsewhere",
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
      return await ctx.db.insert("assets", {
        moduleId: mod,
        title: "Other policy",
        description: "",
        kind: "document" as const,
        publishState: "published" as const,
        order: 1,
        r2Key: "other-key",
        contentUpdatedAt: Date.now(),
      });
    });

    await expect(
      admin().mutation(api.aiVideoQueue.openJob, {
        lessonId,
        sourceAssetId: other,
        title: "A video",
      }),
    ).rejects.toThrow(/CROSS_MODULE|different module/i);
  });

  test("a blank title is refused", async () => {
    await expect(
      admin().mutation(api.aiVideoQueue.openJob, {
        lessonId,
        sourceAssetId: assetId,
        title: "   ",
      }),
    ).rejects.toThrow(/INVALID|needs a title/i);
  });

  test("a drafted prompt is stored for a person to read, not acted on", async () => {
    const jobId = await admin().mutation(api.aiVideoQueue.openJob, {
      lessonId,
      sourceAssetId: assetId,
      title: "A video",
    });
    await t.mutation(internal.aiVideoQueue.recordDraft, {
      jobId,
      draftPrompt: "  A quiet staff room at dusk.  ",
    });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("draft_ready");
    expect(job?.draftPrompt).toBe("A quiet staff room at dusk.");
    // The pause is the point: nothing was submitted.
    expect(job?.submittedPrompt).toBeUndefined();
  });
});

describe("claiming a job for generation", () => {
  test("the claim freezes the prompt that was actually sent", async () => {
    const jobId = await admin().mutation(api.aiVideoQueue.openJob, {
      lessonId,
      sourceAssetId: assetId,
      title: "A video",
    });
    await t.mutation(internal.aiVideoQueue.recordDraft, {
      jobId,
      draftPrompt: "The model's idea.",
    });
    await admin().mutation(internal.aiVideoQueue.claimForGeneration, {
      jobId,
      prompt: "The human's rewrite.",
      durationSeconds: 15,
      resolution: "720p",
      aspectRatio: "16:9",
    });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("generating");
    // Both kept, so the two are comparable afterwards.
    expect(job?.draftPrompt).toBe("The model's idea.");
    expect(job?.submittedPrompt).toBe("The human's rewrite.");
    expect(job?.deadlineAt).toBeGreaterThan(Date.now());
  });

  test("claiming twice is refused, so one press cannot become two videos", async () => {
    const jobId = await generatingJob();
    await expect(
      admin().mutation(internal.aiVideoQueue.claimForGeneration, {
        jobId,
        prompt: "Again.",
        durationSeconds: 15,
        resolution: "720p",
        aspectRatio: "16:9",
      }),
    ).rejects.toThrow(/ALREADY_RUNNING|already being generated/i);
  });

  test("an empty prompt is refused", async () => {
    const jobId = await admin().mutation(api.aiVideoQueue.openJob, {
      lessonId,
      sourceAssetId: assetId,
      title: "A video",
    });
    await expect(
      admin().mutation(internal.aiVideoQueue.claimForGeneration, {
        jobId,
        prompt: "   ",
        durationSeconds: 15,
        resolution: "720p",
        aspectRatio: "16:9",
      }),
    ).rejects.toThrow(/INVALID|needs a prompt/i);
  });
});

describe("what the poller records", () => {
  test("a pending poll advances the attempt and schedules the next", async () => {
    const jobId = await generatingJob();
    await t.mutation(internal.aiVideoQueue.recordPoll, {
      jobId,
      attempt: 1,
      outcome: "pending",
    });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("generating");
    expect(job?.attempts).toBe(1);
    expect(job?.nextPollAt).toBeGreaterThan(Date.now());
    expect(job?.consecutiveErrors).toBe(0);
  });

  test("a terminal outcome ends the job with the provider's own words", async () => {
    const jobId = await generatingJob();
    await t.mutation(internal.aiVideoQueue.recordPoll, {
      jobId,
      attempt: 1,
      outcome: "terminal",
      message: "Content policy violation.",
    });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("Content policy violation.");
    // No further poll is scheduled, and nothing reached the lesson.
    expect(job?.nextPollAt).toBeUndefined();
    expect((await attachments()).links).toHaveLength(0);
  });

  test("transient errors accumulate and eventually end the job", async () => {
    const jobId = await generatingJob();
    for (let attempt = 1; attempt <= 6; attempt++) {
      await t.mutation(internal.aiVideoQueue.recordPoll, {
        jobId,
        attempt,
        outcome: "transient",
        message: "The provider answered 503.",
      });
    }

    const job = await jobRow(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toMatch(/503/);
  });

  test("a success after errors clears the count rather than carrying it", async () => {
    const jobId = await generatingJob();
    await t.mutation(internal.aiVideoQueue.recordPoll, {
      jobId,
      attempt: 1,
      outcome: "transient",
      message: "blip",
    });
    await t.mutation(internal.aiVideoQueue.recordPoll, { jobId, attempt: 2, outcome: "pending" });

    expect((await jobRow(jobId))?.consecutiveErrors).toBe(0);
  });

  test("running out of attempts fails the job rather than polling forever", async () => {
    const jobId = await generatingJob();
    await t.mutation(internal.aiVideoQueue.recordPoll, {
      jobId,
      attempt: 40,
      outcome: "pending",
    });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toMatch(/Timed out/i);
  });

  test("a passed deadline fails the job even on an early attempt", async () => {
    // Scheduler delays are a floor, not a promise, so the clock has to be able
    // to win on its own.
    const jobId = await generatingJob();
    await t.run(async (ctx) => {
      await ctx.db.patch("aiVideoJobs", jobId, { deadlineAt: Date.now() - 1000 });
    });
    await t.mutation(internal.aiVideoQueue.recordPoll, { jobId, attempt: 2, outcome: "pending" });

    expect((await jobRow(jobId))?.status).toBe("failed");
  });

  test("a finished job ignores a late poll", async () => {
    const jobId = await generatingJob();
    await admin().mutation(api.aiVideoQueue.cancel, { jobId });
    await t.mutation(internal.aiVideoQueue.recordPoll, { jobId, attempt: 2, outcome: "pending" });

    expect((await jobRow(jobId))?.status).toBe("cancelled");
  });
});

describe("a rendered video waits to be watched", () => {
  const record = async (jobId: Id<"aiVideoJobs">, key = "generated-video-key") =>
    await t.mutation(internal.aiVideoQueue.recordVideo, {
      jobId,
      r2Key: key,
      sizeBytes: 2_400_000,
    });

  test("the poller stores it and stops, rather than publishing it", async () => {
    // The property this whole step exists for: fifteen seconds of something
    // unusable must not reach teachers because a model produced it.
    const jobId = await generatingJob();
    expect(await record(jobId)).toEqual({ recorded: true });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("ready");
    expect(job?.r2Key).toBe("generated-video-key");
    expect(job?.assetId).toBeUndefined();
    // Nothing on the lesson yet.
    expect((await attachments()).links).toHaveLength(0);
  });

  test("the admin can watch it before deciding", async () => {
    const jobId = await generatingJob();
    await record(jobId);

    const view = await admin().query(api.aiVideoQueue.jobs, { now: Date.now() });
    const row = view.jobs.find((entry) => entry.job._id === jobId);
    // A playable URL, or the review step is a button over a black rectangle.
    expect(row?.videoUrl).toMatch(/^https?:\/\//);
  });

  test("publishing is what puts it on the lesson", async () => {
    const jobId = await generatingJob();
    await record(jobId);
    const result = await admin().mutation(api.aiVideoQueue.publishToLesson, { jobId });
    expect(result.lessonTitle).toBe("Why this matters");

    const { assets, links } = await attachments();
    const video = assets.find((asset) => asset.kind === "video");
    expect(video).toMatchObject({
      moduleId,
      kind: "video",
      // The load-bearing field. Nothing backfills it for a server-stored file,
      // and the presenter picks the player from it — so a wrong value here is
      // a download link on a video, forever.
      contentType: "video/mp4",
      publishState: "published",
      r2Key: "generated-video-key",
      title: "Safeguarding in one shot",
    });
    expect(links.filter((link) => link.assetId === video?._id)).toHaveLength(1);

    const job = await jobRow(jobId);
    expect(job?.status).toBe("complete");
    expect(job?.assetId).toBe(video?._id);
    // Nothing is left looking like an orphan.
    expect(job?.pendingR2Key).toBeUndefined();
  });

  test("publishing twice is refused, so one video cannot land twice", async () => {
    const jobId = await generatingJob();
    await record(jobId);
    await admin().mutation(api.aiVideoQueue.publishToLesson, { jobId });

    await expect(admin().mutation(api.aiVideoQueue.publishToLesson, { jobId })).rejects.toThrow(
      /ALREADY_PUBLISHED|already on its lesson/i,
    );

    const { assets } = await attachments();
    expect(assets.filter((asset) => asset.kind === "video")).toHaveLength(1);
  });

  test("a video that has not rendered yet cannot be published", async () => {
    const jobId = await generatingJob();
    await expect(admin().mutation(api.aiVideoQueue.publishToLesson, { jobId })).rejects.toThrow(
      /NOT_READY|not finished generating/i,
    );
  });

  test("publishing needs a serving admin", async () => {
    const jobId = await generatingJob();
    await record(jobId);
    await expect(
      asUser(staffId).mutation(api.aiVideoQueue.publishToLesson, { jobId }),
    ).rejects.toThrow(/FORBIDDEN|Admin access/i);
    expect((await attachments()).links).toHaveLength(0);
  });

  test("discarding a video nobody wants throws the bytes away too", async () => {
    const jobId = await generatingJob();
    await record(jobId);
    await admin().mutation(api.aiVideoQueue.cancel, { jobId });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("cancelled");
    expect((await attachments()).assets.filter((a) => a.kind === "video")).toHaveLength(0);
  });

  test("a teacher actually receives it as a video", async () => {
    // The closest a test gets to the player: drive the learner surface and
    // check what it hands back. This is what catches a missing content type.
    const jobId = await generatingJob();
    await record(jobId);
    await admin().mutation(api.aiVideoQueue.publishToLesson, { jobId });

    await t.run(async (ctx) => {
      await ctx.db.insert("enrollments", {
        userId: staffId,
        moduleId,
        status: "in_progress",
        progressPercent: 0,
        assignedAt: Date.now(),
      });
    });

    const view = await asUser(staffId).query(api.learn.lesson, {
      moduleSlug: "safeguarding",
      lessonSlug: "why-this-matters",
    });
    const delivered = view.assets.map((entry) => entry.asset);
    expect(delivered.some((asset) => (asset.contentType ?? "").startsWith("video/"))).toBe(true);
  });

  test("recording twice keeps the first video and refuses the second", async () => {
    // Two polls can race. Convex serialises the transactions and the second
    // one must lose, or the job would point at bytes nobody is holding.
    const jobId = await generatingJob();
    expect(await record(jobId, "first-key")).toEqual({ recorded: true });
    expect(await record(jobId, "second-key")).toEqual({ recorded: false });

    expect((await jobRow(jobId))?.r2Key).toBe("first-key");
  });

  test("a lesson deleted during review fails the publish rather than guessing", async () => {
    const jobId = await generatingJob();
    await record(jobId);
    await t.run(async (ctx) => {
      await ctx.db.delete("lessons", lessonId);
    });

    await expect(admin().mutation(api.aiVideoQueue.publishToLesson, { jobId })).rejects.toThrow(
      /was deleted while this video was waiting/i,
    );

    // Deliberately still `ready`, not `failed`: a throw rolls back any patch
    // made alongside it, so recording a failure here would be theatre. The
    // video still exists and can be discarded.
    const job = await jobRow(jobId);
    expect(job?.status).toBe("ready");
    expect((await attachments()).assets.filter((a) => a.kind === "video")).toHaveLength(0);
  });

  test("a cancelled job cannot still record a video", async () => {
    const jobId = await generatingJob();
    await admin().mutation(api.aiVideoQueue.cancel, { jobId });

    expect(await record(jobId)).toEqual({ recorded: false });
    expect((await attachments()).assets.filter((a) => a.kind === "video")).toHaveLength(0);
  });
});

describe("recovering a job nobody came back for", () => {
  test("the watchdog fails a job whose action never returned", async () => {
    const jobId = await generatingJob();
    await t.mutation(internal.aiVideoQueue.watchdog, { jobId });

    const job = await jobRow(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toMatch(/Timed out/i);
  });

  test("the watchdog leaves a video that is waiting to be watched", async () => {
    // `ready` is settled but not finished. Without this, a video left open
    // over a lunch break would be swept away as if the provider had stalled.
    const jobId = await generatingJob();
    await t.mutation(internal.aiVideoQueue.recordVideo, {
      jobId,
      r2Key: "generated-video-key",
      sizeBytes: 100,
    });
    await t.mutation(internal.aiVideoQueue.watchdog, { jobId });

    expect((await jobRow(jobId))?.status).toBe("ready");
  });

  test("the sweep ends a job whose poll is long overdue", async () => {
    const jobId = await generatingJob();
    await t.run(async (ctx) => {
      await ctx.db.patch("aiVideoJobs", jobId, { nextPollAt: Date.now() - 10 * 60_000 });
    });

    const { swept } = await t.mutation(internal.aiVideoQueue.sweepStale, {});
    expect(swept).toBe(1);
    expect((await jobRow(jobId))?.status).toBe("failed");
  });

  test("the sweep leaves a job that is merely still working", async () => {
    const jobId = await generatingJob();
    await t.run(async (ctx) => {
      await ctx.db.patch("aiVideoJobs", jobId, { nextPollAt: Date.now() + 10_000 });
    });

    const { swept } = await t.mutation(internal.aiVideoQueue.sweepStale, {});
    expect(swept).toBe(0);
    expect((await jobRow(jobId))?.status).toBe("generating");
  });
});

describe("the upload path the screen depends on", () => {
  test("a freshly uploaded document reaches the picker", async () => {
    // The screen uploads by creating a placeholder asset and attaching a file
    // to it, then expects that document to appear in `jobs.modules[].documents`
    // so it can be generated from. If that link ever breaks, an admin uploads
    // a PDF successfully and still cannot select it.
    const created = await admin().mutation(api.assets.create, {
      moduleId,
      title: "Newly uploaded policy",
      kind: "document",
      description: "Uploaded on the AI videos screen to generate a video from.",
    });
    await admin().mutation(api.assets.attachFile, {
      assetId: created,
      key: "freshly-uploaded-key",
      fileName: "new.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
    });

    const view = await admin().query(api.aiVideoQueue.jobs, { now: Date.now() });
    const mod = view.modules.find((entry) => entry.id === moduleId);
    expect(mod?.documents.some((document) => document.id === created)).toBe(true);
  });
});
