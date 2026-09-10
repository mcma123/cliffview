import React, { useCallback, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

/**
 * Mirrors `UploadStatus` in `src/hooks/use-asset-upload.ts` so a route can pass
 * that hook's state straight through. Declared here rather than imported to
 * keep this component free of any dependency on a Convex-touching module.
 */
export type UploadZoneStatus = "idle" | "uploading" | "saving" | "done" | "error";

interface DragAndDropZoneProps {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  acceptedFileTypes?: string;
  /**
   * Awaited. Before Phase 6 this was `(file: File) => void`, fired *after* the
   * zone had already painted its success state, so the zone announced
   * "File ready" for a file that was never sent anywhere.
   */
  onUpload?: (file: File) => void | Promise<void>;
  /** Driven by the caller. The zone no longer decides success for itself. */
  status?: UploadZoneStatus;
  /** 0 to 1. Only read while the bytes are moving. */
  progress?: number;
  errorMessage?: string | null;
  /**
   * The file already on the record, not the one in the picker, so the zone
   * shows what is attached on first paint.
   */
  uploadedFileName?: string | null;
  /** Offered only when a file is attached and the caller can remove it. */
  onRemove?: () => void | Promise<void>;
  disabled?: boolean;
}

export function DragAndDropZone({
  title = "Upload file",
  description = "Drag and drop your file here, or click to browse",
  icon: Icon = UploadCloud,
  acceptedFileTypes = "*/*",
  onUpload,
  status = "idle",
  progress = 0,
  errorMessage = null,
  uploadedFileName = null,
  onRemove,
  disabled = false,
}: DragAndDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status === "uploading" || status === "saving" || removing;
  // A zone with no handler is a read-only status card, not an uploader. Some
  // screens render it that way deliberately.
  const inert = disabled || busy || onUpload === undefined;

  const accept = useCallback(
    (file: File | undefined) => {
      if (file === undefined || inert) return;
      void onUpload?.(file);
    },
    [inert, onUpload],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!inert) setIsDragging(true);
    },
    [inert],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      accept(e.dataTransfer.files?.[0]);
    },
    [accept],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Clear it, or picking the same file again after a failure fires no
      // change event and the retry looks like a dead button.
      e.target.value = "";
      accept(file);
    },
    [accept],
  );

  const openPicker = useCallback(() => {
    if (!inert) inputRef.current?.click();
  }, [inert]);

  const frame =
    status === "error"
      ? "border-destructive/50 bg-destructive/5"
      : isDragging
        ? "border-primary bg-primary/5 shadow-inner"
        : uploadedFileName !== null
          ? "border-success/50 bg-success/5"
          : inert
            ? "border-border bg-background"
            : "border-border bg-background hover:border-primary/50 hover:bg-muted/50";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-6 transition-all duration-200 ease-in-out ${frame}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/*
        Hidden and ref-driven rather than an opacity-0 overlay stretched across
        the whole zone. The overlay used to swallow every click inside the card,
        which is why the old "Replace file" button could never be reached.
      */}
      <input
        ref={inputRef}
        type="file"
        accept={acceptedFileTypes}
        disabled={inert}
        className="hidden"
        onChange={handleFileInput}
      />

      <div className="flex flex-col items-center justify-center text-center">
        {busy ? (
          <div className="flex w-full flex-col items-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="w-full">
              <p className="text-sm font-semibold text-foreground">
                {removing
                  ? "Removing file…"
                  : status === "saving"
                    ? "Recording the file…"
                    : `Uploading… ${Math.round(progress * 100)}%`}
              </p>
              {status === "uploading" ? (
                <div className="mx-auto mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-150"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Upload failed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {errorMessage ?? "Something went wrong."}
              </p>
            </div>
            <button
              type="button"
              onClick={openPicker}
              className="mt-2 text-xs font-semibold text-primary hover:text-primary-deep"
            >
              Try another file
            </button>
          </div>
        ) : uploadedFileName !== null ? (
          <div className="flex flex-col items-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{uploadedFileName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
            {inert ? null : (
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={openPicker}
                  className="text-xs font-semibold text-primary hover:text-primary-deep"
                >
                  Replace file
                </button>
                {onRemove === undefined ? null : (
                  <button
                    type="button"
                    onClick={async () => {
                      setRemoving(true);
                      try {
                        await onRemove();
                      } finally {
                        setRemoving(false);
                      }
                    }}
                    className="text-xs font-semibold text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openPicker}
            disabled={inert}
            className="flex flex-col items-center space-y-3 disabled:cursor-default"
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                isDragging
                  ? "bg-primary text-primary-foreground scale-110"
                  : "bg-primary-soft text-primary"
              }`}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
