"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clipboard,
  Trash2,
  Sparkles,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/features/components/common/Button";
import { cn } from "@/lib/utils";

interface JobDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const SAMPLE_JOB_DESCRIPTION = `Senior Frontend Engineer

Responsibilities:
- Build and maintain modern Next.js and React web applications.
- Collaborate with product designers and backend engineers to integrate APIs.
- Optimize frontend performance, accessibility (a11y), and state management.

Requirements:
- 4+ years of professional experience with TypeScript, React, and Tailwind CSS.
- Familiarity with state management, Next.js App Router, and REST/GraphQL APIs.
- Strong problem-solving skills and experience with AI/LLM integrations is a plus.`;

export function JobDescriptionInput({
  value,
  onChange,
  error,
}: JobDescriptionInputProps) {
  const minChars = 50;
  const charCount = value.length;
  const isValid = charCount >= minChars;
  const progressPercent = Math.min(100, Math.round((charCount / minChars) * 100));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        onChange(clipboardText);
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const handleLoadSample = () => {
    onChange(SAMPLE_JOB_DESCRIPTION);
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <Card
      className={cn(
        "border-slate-200/80 bg-white/80 shadow-md backdrop-blur-md transition-all dark:border-slate-800/80 dark:bg-slate-900/80",
        error && "border-red-500/80 ring-1 ring-red-500/20"
      )}
    >
      <CardHeader className="p-5 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <FileText className="h-4 w-4 text-primary" />
              Job Description
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Paste the role requirements to generate tailored interview questions.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {isValid ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLoadSample}
                className="h-8 gap-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Insert Sample
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0">
        {/* Helper Action Bar */}
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handlePaste}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="Paste from Clipboard"
          >
            <Clipboard className="h-3 w-3" />
            Paste
          </button>
          {charCount > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              title="Clear text"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* Main Textarea */}
        <div className="relative">
          <Textarea
            id="job-description"
            value={value}
            onChange={handleChange}
            placeholder="Paste the target job description here... (Include key responsibilities, qualifications, and tech stack requirements)"
            rows={8}
            className={cn(
              "w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:bg-slate-950",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/20"
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? "job-description-error" : "job-description-hint"
            }
          />
        </div>

        {/* Footer Progress & Status Bar */}
        <div className="mt-3 flex flex-col gap-2">
          {/* Character Requirement Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={cn(
                "h-full transition-all duration-300",
                isValid ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <p
              id="job-description-hint"
              className={cn(
                "font-medium",
                isValid
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              {charCount} characters{" "}
              {isValid
                ? "(Minimum requirement met)"
                : `(${minChars - charCount} more characters needed)`}
            </p>

            {error && (
              <p
                id="job-description-error"
                className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400"
                role="alert"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}