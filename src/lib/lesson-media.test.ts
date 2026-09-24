import { describe, expect, test } from "vitest";

import { materialAction } from "./lesson-media";

/**
 * The button beside a lesson's material.
 *
 * Worth pinning because the wrong answer here is what sent a teacher out of the
 * app mid-lesson: "Open full screen" on a video was an anchor to a new tab.
 */
describe("what the action button does", () => {
  test("anything the browser can show goes fullscreen, in the app", () => {
    expect(materialAction("video", true)).toBe("fullscreen");
    expect(materialAction("pdf", true)).toBe("fullscreen");
    expect(materialAction("image", true)).toBe("fullscreen");
  });

  test("what a browser cannot display is a download, not a dead preview", () => {
    // Word, PowerPoint, Excel and anything else all resolve to "download"
    // upstream in `resolveMedia`.
    expect(materialAction("download", true)).toBe("download");
  });

  test("audio gets no button: a screen-filling black rectangle helps nobody", () => {
    expect(materialAction("audio", true)).toBe("none");
  });

  test("a row with no file offers nothing, whatever its type claims", () => {
    // Seeded placeholder assets have a kind and a metaNote but no file.
    for (const media of ["video", "pdf", "image", "audio", "download"] as const) {
      expect(materialAction(media, false)).toBe("none");
    }
  });
});
