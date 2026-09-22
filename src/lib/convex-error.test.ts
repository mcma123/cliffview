import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { errorMessage } from "./convex-error";

/**
 * The bug this file exists for: publishing a module with no published lesson
 * showed "Server Error" in a toast, while the server had said exactly what to
 * do about it. `ConvexError` extends `Error`, so the old
 * `caught instanceof Error ? caught.message : fallback` looked correct and
 * silently threw away every refusal the backend wrote for an administrator.
 */
describe("errorMessage", () => {
  test("returns the refusal a convex/ mutation actually threw", () => {
    const caught = new ConvexError({
      code: "NOT_READY",
      message: "Publish at least one lesson before publishing the module.",
    });

    expect(errorMessage(caught, "That did not work.")).toBe(
      "Publish at least one lesson before publishing the module.",
    );
  });

  test("a plain-string payload is shown rather than discarded", () => {
    expect(errorMessage(new ConvexError("Pass mark must be between 0 and 100."), "fallback")).toBe(
      "Pass mark must be between 0 and 100.",
    );
  });

  test("the transport string is never shown", () => {
    // What the browser used to render, verbatim.
    const caught = new Error("[CONVEX M(modules:publish)] [Request ID: 300d5158] Server Error");

    expect(errorMessage(caught, "Could not publish that module.")).toBe(
      "Could not publish that module.",
    );
  });

  test("a genuine error keeps its message, minus the client's prefixes", () => {
    const caught = new Error("[CONVEX M(modules:publish)] Network request failed");

    expect(errorMessage(caught, "fallback")).toBe("Network request failed");
  });

  test("an empty or non-error cause falls back", () => {
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
    expect(errorMessage("a bare string", "fallback")).toBe("fallback");
  });

  test("a ConvexError carrying no usable message still falls back", () => {
    expect(errorMessage(new ConvexError({ code: "OOPS" }), "fallback")).toBe("fallback");
  });
});
