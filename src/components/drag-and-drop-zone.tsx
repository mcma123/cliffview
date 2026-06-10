import React, { useState, useCallback } from "react";
import { UploadCloud, CheckCircle2, File as FileIcon } from "lucide-react";

interface DragAndDropZoneProps {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  acceptedFileTypes?: string;
  onUpload?: (file: File) => void;
}

export function DragAndDropZone({
  title = "Upload file",
  description = "Drag and drop your file here, or click to browse",
  icon: Icon = UploadCloud,
  acceptedFileTypes = "*/*",
  onUpload,
}: DragAndDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

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

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        setUploadedFile(file);
        if (onUpload) {
          onUpload(file);
        }
      }
    },
    [onUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        setUploadedFile(file);
        if (onUpload) {
          onUpload(file);
        }
      }
    },
    [onUpload]
  );

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-6 transition-all duration-200 ease-in-out ${
        isDragging
          ? "border-primary bg-primary/5 shadow-inner"
          : uploadedFile
            ? "border-success/50 bg-success/5"
            : "border-border bg-background hover:border-primary/50 hover:bg-muted/50"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={acceptedFileTypes}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={handleFileInput}
      />
      
      <div className="flex flex-col items-center justify-center text-center">
        {uploadedFile ? (
          <div className="flex flex-col items-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">File ready</p>
              <p className="mt-1 text-xs text-muted-foreground">{uploadedFile.name}</p>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                setUploadedFile(null);
              }}
              className="mt-2 text-xs font-semibold text-primary hover:text-primary-deep"
            >
              Replace file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                isDragging ? "bg-primary text-primary-foreground scale-110" : "bg-primary-soft text-primary"
              }`}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
