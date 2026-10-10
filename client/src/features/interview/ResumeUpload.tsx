"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ResumeUploadProps {
  onResumeTextChange: (text: string) => void;
  resumeText: string;
  isProcessing: boolean;
}

export function ResumeUpload({ onResumeTextChange, resumeText, isProcessing }: ResumeUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewText, setPreviewText] = useState("");

  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setIsDragOver(false);
    toast.loading("Extracting text from PDF...", { id: "pdf-extract" });

    try {
      const text = await extractTextFromPDF(file);
      if (text.trim().length < 100) {
        toast.error("Could not extract enough text from PDF. Please try a different file.", { id: "pdf-extract" });
        return;
      }
      onResumeTextChange(text);
      setPreviewText(text.slice(0, 500) + (text.length > 500 ? "..." : ""));
      toast.success("Resume uploaded successfully", { id: "pdf-extract" });
    } catch (error) {
      toast.error("Failed to extract text from PDF", { id: "pdf-extract" });
      console.error(error);
    }
  }, [extractTextFromPDF, onResumeTextChange]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const hasResume = resumeText.length > 0;

  return (
    <Card className={cn("transition-all", isDragOver && "border-primary bg-primary/5")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Resume Upload</CardTitle>
            <CardDescription>Upload your resume as a PDF file</CardDescription>
          </div>
          {hasResume && (
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
            "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf"
            id="resume-upload"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileInputChange}
            disabled={isProcessing}
          />
          <label htmlFor="resume-upload" className="cursor-pointer">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium">Drag & drop your resume (PDF)</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">Max 5MB • PDF only</p>
          </label>
        </div>

        {previewText && (
          <div className="mt-4 p-4 rounded-lg bg-muted border">
            <div className="flex items-center justify-between mb-2">
              <Label className="mb-0 text-sm">Extracted Text Preview</Label>
              <Button variant="ghost" size="sm" onClick={() => setPreviewText("")}>
                <span className="sr-only">Remove</span>
                <AlertCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-40 overflow-y-auto text-sm text-muted-foreground font-mono whitespace-pre-wrap text-left">
              {previewText}
            </div>
          </div>
        )}

        <textarea
          id="resume-text-hidden"
          className="hidden"
          value={resumeText}
          onChange={() => {}}
          readOnly
        />
      </CardContent>
    </Card>
  );
}