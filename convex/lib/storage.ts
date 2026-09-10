import { R2 } from "@convex-dev/r2";

import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

/**
 * Cloudflare R2, the app's file store.
 *
 * Not Convex's built-in storage: Phase 1 declared an `Id<"_storage">` field on
 * `assets` in anticipation, and Phase 6 replaced it with an opaque R2 object
 * key. The component reads its credentials from five deployment env vars
 * (`R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
 * `R2_TOKEN`) — never from an argument, and never from anything `VITE_`-prefixed,
 * which would ship the secret in the browser bundle.
 *
 * The instance lives here rather than in `assets.ts` because deleting a module
 * cascades to its assets' blobs, so `modules.ts` needs it too and a second
 * `new R2(...)` would be a second place to keep configured.
 */
export const r2 = new R2(components.r2);

/**
 * How long a signed download URL stays valid.
 *
 * Deliberately far longer than the component's 900s default. A signed URL makes
 * a query's result non-deterministic, and Convex invalidates a query cache when
 * data changes rather than on a clock, so a short expiry risks handing a
 * subscriber a URL that died while its row sat unchanged. Six hours outlives any
 * plausible cache lifetime and still expires a leaked link the same day.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60 * 6;

/**
 * Largest file an asset may carry.
 *
 * The browser checks this too, but only to avoid a doomed round trip: a
 * presigned PUT cannot be size-capped, so the authoritative refusal happens in
 * `assets.attachFile`, after the bytes have already landed.
 */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/** Human form of the cap, for refusal messages. */
export const MAX_FILE_LABEL = `${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB`;

/**
 * Delete an asset's blob, if it has one.
 *
 * Every path that drops an asset row goes through this. A row deleted without
 * it leaves an object in the bucket that nothing can reach or name again —
 * unreferenced, unlistable from the app, and still billed.
 */
export async function deleteBlobIfPresent(
  ctx: MutationCtx,
  r2Key: string | undefined,
): Promise<void> {
  if (r2Key === undefined) return;
  await r2.deleteObject(ctx, r2Key);
}
