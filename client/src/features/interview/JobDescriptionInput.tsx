"use client";

import { Clipboard, Trash2 } from "lucide-react";
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

  return (
    <div>
      <textarea
        id="job-description"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste the role requirements here: responsibilities, qualifications, tech stack."
        rows={8}
        aria-invalid={!!error}
        aria-describedby={
          error ? "job-description-error" : "job-description-hint"
        }
        className={cn(
          "w-full resize-y rounded-lg border border-border bg-muted/20 px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40 focus:bg-background",
          error && "border-destructive focus:border-destructive"
        )}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          id="job-description-hint"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          {charCount} characters
          {isValid ? " / ready" : ` / ${minChars - charCount} more needed`}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(SAMPLE_JOB_DESCRIPTION)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Insert sample
          </button>
          <button
            type="button"
            onClick={handlePaste}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Clipboard className="h-3 w-3" aria-hidden="true" />
            Paste
          </button>
          {charCount > 0 && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <p
          id="job-description-error"
          className="mt-1.5 text-xs font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
