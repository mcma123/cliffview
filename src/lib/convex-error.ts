import { ConvexError } from "convex/values";

/**
 * The message a server refusal actually meant to show.
 *
 * `ConvexError` extends `Error`, so `caught instanceof Error` is true and
 * `caught.message` reads as a reasonable thing to show — but it is not. The
 * payload thrown by `convex/` lives in `caught.data`; `.message` holds the
 * transport string, which reaches the browser as:
 *
 *   [CONVEX M(modules:publish)] [Request ID: 300d…] Server Error
 *
 * Every mutation call site used to render exactly that. So an admin who tried
 * to publish a module with no published lesson was told "Server Error" while
 * the server had, correctly, said "Publish at least one lesson before
 * publishing the module." The refusal was right and the screen hid it, which
 * turns a two-second fix into a bug report.
 *
 * Falls back to a cleaned `.message` for genuine failures (a network drop, an
 * unexpected throw), stripping the `[CONVEX …]` prefixes the client adds — the
 * same strip both sign-in routes already do by hand.
 */
export function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ConvexError) {
    // Every refusal in `convex/` throws `{ code, message }`. A plain-string
    // payload is still worth showing rather than discarding.
    const data: unknown = caught.data;
    if (typeof data === "string" && data.trim().length > 0) return data;
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === "string" && message.trim().length > 0) return message;
    }
    // Return here rather than falling through: a ConvexError's own `.message`
    // is its payload serialised, so the branch below would show an admin a
    // raw `{"code":"OOPS"}` instead of a sentence.
    return fallback;
  }

  if (caught instanceof Error) {
    const stripped = caught.message.replace(/^(\[.*?\]\s*)+/, "").trim();
    if (stripped.length > 0 && stripped !== "Server Error") return stripped;
  }

  return fallback;
}
