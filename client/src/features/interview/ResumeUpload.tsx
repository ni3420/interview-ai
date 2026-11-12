"use client";

import { useCallback, useState } from "react";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_CONTENT_TYPE = "application/pdf";

interface UploadedResume {
  resumeId: string;
  fileName: string;
}

interface ResumeUploadProps {
  onResumeUploaded: (resume: UploadedResume) => void;
  onResumeRemoved?: () => void;
  isProcessing: boolean;
}

export function ResumeUpload({
  onResumeUploaded,
  onResumeRemoved,
  isProcessing,
}: ResumeUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<UploadedResume | null>(
    null
  );

  const generateUploadUrl = useMutation(api.resume.generateUploadUrl);
  const saveResume = useMutation(api.resume.saveResume);
  const deleteResume = useMutation(api.resume.deleteResume);

  const handleFileSelect = useCallback(
    async (selected: File) => {
      const isPdf =
        selected.type === RESUME_CONTENT_TYPE ||
        selected.name.toLowerCase().endsWith(".pdf");

      if (!isPdf) {
        toast.error("Please upload a PDF file");
        return;
      }

      if (selected.size > MAX_RESUME_BYTES) {
        toast.error("File size must be less than 5MB");
        return;
      }

      if (selected.size === 0) {
        toast.error("The selected file is empty");
        return;
      }

      setIsUploading(true);
      setIsDragOver(false);

      const toastId = "resume-upload";
      toast.loading("Uploading resume...", { id: toastId });

      try {
        // 1. Ask Convex for a short-lived upload URL.
        const uploadUrl = await generateUploadUrl();

        // 2. POST the PDF bytes directly to Convex file storage.
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": RESUME_CONTENT_TYPE },
          body: selected,
        });

        if (!response.ok) {
          throw new Error("Failed to upload resume to storage");
        }

        const { storageId } = (await response.json()) as {
          storageId: string;
        };

        // 3. Persist ownership + metadata. Returns the resume document id.
        const resumeId = await saveResume({
          storageId,
          fileName: selected.name,
          contentType: RESUME_CONTENT_TYPE,
          size: selected.size,
        });

        const resume = { resumeId, fileName: selected.name };
        setUploadedResume(resume);
        onResumeUploaded(resume);

        toast.success("Resume uploaded successfully", { id: toastId });
      } catch (error) {
        console.error("Resume upload failed:", error);
        toast.error("Failed to upload resume. Please try again.", {
          id: toastId,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [generateUploadUrl, saveResume, onResumeUploaded]
  );

  const handleRemove = useCallback(async () => {
    if (!uploadedResume) return;

    try {
      await deleteResume({ resumeId: uploadedResume.resumeId });
    } catch (error) {
      console.error("Failed to remove resume:", error);
    } finally {
      setUploadedResume(null);
      onResumeRemoved?.();
    }
  }, [deleteResume, uploadedResume, onResumeRemoved]);

  const disabled = isUploading || isProcessing;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && !disabled) void handleFileSelect(file);
  };

  return (
    <div>
      <div
        className={cn(
          "relative rounded-lg border border-dashed p-8 text-center transition-colors",
          isDragOver
            ? "border-foreground/40 bg-muted/60"
            : "border-border bg-muted/20",
          disabled && "pointer-events-none opacity-60"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          id="resume-upload"
          aria-label="Upload resume PDF"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelect(file);
            // Allow selecting the same file again.
            e.target.value = "";
          }}
        />

        <div className="pointer-events-none">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background">
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          <p className="font-display text-lg">
            {isUploading ? "Reading your resume..." : "Drop your resume here"}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse files
          </p>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            PDF / max 5 MB
          </p>
        </div>
      </div>

      {uploadedResume && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              aria-hidden="true"
            />
            <span className="truncate text-sm">{uploadedResume.fileName}</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Ready
            </span>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={handleRemove}
            aria-label="Remove uploaded resume"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
