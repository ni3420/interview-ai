"use client";

import { useCallback, useState } from "react";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
    <Card
      className={cn(
        "transition-all",
        isDragOver && "border-primary bg-primary/5"
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Resume Upload</CardTitle>
            <CardDescription>Upload your resume as a PDF file</CardDescription>
          </div>

          {uploadedResume && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Ready
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div
          className={cn(
            "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25",
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            <p className="text-lg font-medium">
              {isUploading
                ? "Uploading resume..."
                : "Drag & drop your resume (PDF)"}
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              Max 5MB · PDF only
            </p>
          </div>
        </div>

        {uploadedResume && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-muted p-4">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              <Label className="truncate">{uploadedResume.fileName}</Label>
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleRemove}
              aria-label="Remove uploaded resume"
            >
              <AlertCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
