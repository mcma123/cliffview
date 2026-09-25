import { describe, expect, test } from "vitest";

import {
  MAX_CONSECUTIVE_POLL_ERRORS,
  MAX_POLL_ATTEMPTS,
  VIDEO_MODEL,
  classifyHttpFailure,
  clampPrompt,
  errorDelayMs,
  looksLikeMp4,
  nextPollDelayMs,
  parsePoll,
} from "./openrouterVideo";

/**
 * The decisions a video job makes, tested without a network.
 *
 * These live in their own module precisely so they can be tested: the three
 * `fetch` calls around them cannot be, because exercising them would either
 * mock the network — testing the mock — or spend real money at a paid provider
 * on every `npm test`. Everything that decides *what happens next* is here.
 */

describe("how long to wait before the next poll", () => {
  test("fast while the answer is plausibly imminent", () => {
    // A 15s clip is documented at one to five minutes. Ten seconds for the
    // first two minutes costs at most twelve requests.
    expect(nextPollDelayMs(1)).toBe(10_000);
    expect(nextPollDelayMs(12)).toBe(10_000);
  });

  test("slower once the job is already unusual", () => {
    expect(nextPollDelayMs(13)).toBe(20_000);
    expect(nextPollDelayMs(24)).toBe(20_000);
    expect(nextPollDelayMs(25)).toBe(30_000);
  });

  test("never speeds up as a job gets older", () => {
    // Monotonic: a later attempt is never polled sooner than an earlier one.
    let previous = 0;
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      const delay = nextPollDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  test("the whole schedule fits inside the deadline it is paired with", () => {
    // If the attempt cap could not be reached before the clock ran out, one of
    // the two limits would be decoration.
    let total = 0;
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      total += nextPollDelayMs(attempt);
    }
    expect(total).toBeGreaterThan(10 * 60_000);
  });
});

describe("backing off after an error", () => {
  test("doubles, and then stops doubling", () => {
    expect(errorDelayMs(1)).toBe(10_000);
    expect(errorDelayMs(2)).toBe(20_000);
    expect(errorDelayMs(3)).toBe(40_000);
    // Capped, or the sixth error would wait nearly three minutes and the
    // consecutive-error limit would never be reached inside the deadline.
    expect(errorDelayMs(4)).toBe(60_000);
    expect(errorDelayMs(MAX_CONSECUTIVE_POLL_ERRORS)).toBe(60_000);
  });

  test("a negative count cannot produce a fractional delay", () => {
    expect(errorDelayMs(-3)).toBe(5_000);
  });
});

describe("reading a poll response", () => {
  test("a finished job hands back the first video", () => {
    const outcome = parsePoll({
      status: "completed",
      unsigned_urls: ["https://cdn.example/one.mp4", "https://cdn.example/two.mp4"],
    });
    expect(outcome).toEqual({ kind: "ready", videoUrl: "https://cdn.example/one.mp4" });
  });

  test("an unfinished job is pending, whatever the provider calls it", () => {
    for (const status of ["queued", "processing", "running", "in_progress", ""]) {
      expect(parsePoll({ status }).kind).toBe("pending");
    }
  });

  test("a failure carries the provider's own sentence", () => {
    expect(parsePoll({ status: "failed", error: "Content policy violation." })).toEqual({
      kind: "failed",
      message: "Content policy violation.",
    });
    // Some providers nest it.
    expect(parsePoll({ status: "failed", error: { message: "Out of capacity." } })).toEqual({
      kind: "failed",
      message: "Out of capacity.",
    });
  });

  test("a failure with no reason still fails, rather than hanging", () => {
    expect(parsePoll({ status: "failed" }).kind).toBe("failed");
  });

  test("completed with no video is a failure, not a reason to keep waiting", () => {
    // The provider has said it is done. Polling longer cannot help, and a job
    // that polls forever against a finished id is worse than one that reports
    // the truth.
    expect(parsePoll({ status: "completed", unsigned_urls: [] }).kind).toBe("failed");
    expect(parsePoll({ status: "completed" }).kind).toBe("failed");
  });

  test("an unreadable body is a failure rather than a crash", () => {
    expect(parsePoll(null).kind).toBe("failed");
    expect(parsePoll("nonsense").kind).toBe("failed");
  });
});

describe("which HTTP failures are worth retrying", () => {
  test("a rejected key is terminal, because it will not fix itself", () => {
    // Forty polls against a revoked key is forty wasted invocations.
    expect(classifyHttpFailure(401)).toBe("terminal");
    expect(classifyHttpFailure(403)).toBe("terminal");
  });

  test("a malformed request is terminal", () => {
    expect(classifyHttpFailure(400)).toBe("terminal");
    expect(classifyHttpFailure(422)).toBe("terminal");
  });

  test("a 404 is transient, because a fresh job's URL can 404 briefly", () => {
    expect(classifyHttpFailure(404)).toBe("transient");
  });

  test("server trouble and rate limits are transient", () => {
    expect(classifyHttpFailure(429)).toBe("transient");
    expect(classifyHttpFailure(500)).toBe("transient");
    expect(classifyHttpFailure(503)).toBe("transient");
  });
});

describe("is this actually a video", () => {
  /** The first bytes of a real MP4: a size, then the `ftyp` box. */
  const mp4 = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);

  test("an MP4 passes", () => {
    expect(looksLikeMp4(mp4)).toBe(true);
  });

  test("an HTML error page served as 200 does not", () => {
    // Without this check that page reaches a lesson labelled video/mp4, and a
    // teacher opens it to a black rectangle with nothing explaining why.
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>403</body></html>");
    expect(looksLikeMp4(html)).toBe(false);
  });

  test("JSON does not, and neither does an empty body", () => {
    expect(looksLikeMp4(new TextEncoder().encode('{"error":"nope"}'))).toBe(false);
    expect(looksLikeMp4(new Uint8Array(0))).toBe(false);
    expect(looksLikeMp4(new Uint8Array(8))).toBe(false);
  });
});

describe("the prompt", () => {
  test("is trimmed and bounded", () => {
    expect(clampPrompt("  a scene  ")).toBe("a scene");
    expect(clampPrompt("x".repeat(5000))).toHaveLength(2000);
  });
});

describe("the model", () => {
  test("is the id from the documentation, not the one in the brief", () => {
    // The request asked for "Seedance Mini 2.1", which does not exist.
    expect(VIDEO_MODEL).toBe("bytedance/seedance-2.0-mini");
  });
});
