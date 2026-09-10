import { useUploadFile } from "@convex-dev/r2/react";
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Upload files and record them against assets.
 *
 * This is the first hook in the repo that touches Convex, which is deliberate:
 * an upload is a three-legged round trip, and putting that sequence in a route
 * component would mean copying it into every screen that has an upload zone.
 * `src/components` stays prop-driven and Convex-free; the route calls this hook
 * and hands each zone its slice of the state.
 *
 * The three legs, in order:
 *   1. `assets.generateUploadUrl` — admin-gated, returns a server-issued key
 *      and a presigned URL. The key is a uuid the caller cannot choose, so a
 *      caller cannot aim an upload at another asset's blob.
 *   2. A direct `PUT` of the bytes to Cloudflare R2. These never pass through
 *      Convex, and this is the only leg that reports progress.
 *   3. `assets.attachFile` — points the asset row at the key. Until this runs
 *      the object is an orphan, which is why a failure here is reported rather
 *      than swallowed.
 *
 * `useUploadFile` from the R2 component owns legs 1 and 2, plus the metadata
 * sync that follows them. That sync only *schedules* R2's HEAD request, so the
 * `contentType` and `sizeBytes` handed to `attachFile` are the browser's
 * report; `assets.applySyncedMetadata` later overwrites both with what R2
 * actually says.
 *
 * Keyed by asset id rather than one instance per zone: a screen may render a
 * zone per asset, and calling a hook inside that map would break the rules of
 * hooks the moment the list length changed. Per-asset state also means two
 * uploads running at once cannot show each other's progress.
 */
export type UploadStatus = "idle" | "uploading" | "saving" | "done" | "error";

export type AssetUploadState = {
  status: UploadStatus;
  /** 0 to 1 across the byte transfer only, not the surrounding mutations. */
  progress: number;
  errorMessage: string | null;
};

const IDLE: AssetUploadState = { status: "idle", progress: 0, errorMessage: null };

/**
 * Mirrors `MAX_FILE_BYTES` in `convex/lib/storage.ts`, which is authoritative.
 * Duplicated rather than imported because that module constructs the R2 client
 * and would drag the component api into the browser bundle. Checking here only
 * saves a doomed round trip — a presigned PUT cannot be size-capped, so the
 * refusal that counts happens server-side in `attachFile`, after the bytes have
 * already landed. Change both together.
 */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FILE_LABEL = `${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB`;

export type AssetUploads = {
  stateFor: (assetId: Id<"assets">) => AssetUploadState;
  upload: (assetId: Id<"assets">, file: File) => Promise<void>;
  reset: (assetId: Id<"assets">) => void;
};

export function useAssetUploads(): AssetUploads {
  const [states, setStates] = useState<Record<string, AssetUploadState>>({});

  const uploadFile = useUploadFile(api.assets);
  const attachFile = useMutation({ mutationFn: useConvexMutation(api.assets.attachFile) });

  const put = useCallback((assetId: string, next: AssetUploadState) => {
    setStates((current) => ({ ...current, [assetId]: next }));
  }, []);

  const stateFor = useCallback(
    (assetId: Id<"assets">): AssetUploadState => states[assetId] ?? IDLE,
    [states],
  );

  const reset = useCallback(
    (assetId: Id<"assets">) => {
      put(assetId, IDLE);
    },
    [put],
  );

  const upload = useCallback(
    async (assetId: Id<"assets">, file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        put(assetId, {
          status: "error",
          progress: 0,
          errorMessage: `That file is larger than the ${MAX_FILE_LABEL} limit.`,
        });
        return;
      }

      put(assetId, { status: "uploading", progress: 0, errorMessage: null });

      let key: string;
      try {
        key = await uploadFile(file, {
          onProgress: ({ loaded, total }) =>
            put(assetId, {
              status: "uploading",
              progress: total > 0 ? loaded / total : 0,
              errorMessage: null,
            }),
        });
      } catch (caught) {
        // This leg is browser-to-Cloudflare, so a failure here is usually the
        // bucket's CORS policy rather than anything Convex did. Saying so beats
        // a bare "Failed to fetch", which sends people to the wrong logs.
        put(assetId, {
          status: "error",
          progress: 0,
          errorMessage:
            caught instanceof Error
              ? `Upload failed: ${caught.message}. If this keeps happening, check the bucket allows PUT from this origin.`
              : "Upload failed before the file reached storage.",
        });
        return;
      }

      put(assetId, { status: "saving", progress: 1, errorMessage: null });
      try {
        await attachFile.mutateAsync({
          assetId,
          key,
          fileName: file.name,
          // Some browsers report an empty type for unrecognised extensions.
          // Omit it rather than storing "" as a content type.
          ...(file.type === "" ? {} : { contentType: file.type }),
          sizeBytes: file.size,
        });
      } catch (caught) {
        // The bytes are in the bucket but nothing references them. Say that,
        // rather than reporting a clean failure.
        put(assetId, {
          status: "error",
          progress: 1,
          errorMessage:
            caught instanceof Error
              ? caught.message
              : "The file uploaded but could not be attached to this asset.",
        });
        return;
      }

      put(assetId, { status: "done", progress: 1, errorMessage: null });
    },
    [attachFile, put, uploadFile],
  );

  return { stateFor, upload, reset };
}
