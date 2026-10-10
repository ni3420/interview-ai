"use client";

import { useState } from "react";
import { FileText, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface JobDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function JobDescriptionInput({ value, onChange, error }: JobDescriptionInputProps) {
  const [charCount, setCharCount] = useState(value.length);
  const minChars = 50;
  const isValid = value.length >= minChars;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setCharCount(newValue.length);
  };

  return (
    <Card className={cn(error && "border-destructive")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Job Description</CardTitle>
            <CardDescription>Paste the job description for the role you're interviewing for</CardDescription>
          </div>
          {isValid && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Ready
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          id="job-description"
          value={value}
          onChange={handleChange}
          placeholder="Paste the job description here... Include responsibilities, requirements, preferred qualifications, etc."
          rows={10}
          className={cn(error && "border-destructive focus:border-destructive focus:ring-destructive/20")}
          aria-invalid={!!error}
          aria-describedby={error ? "job-description-error" : "job-description-hint"}
        />
        <div className="flex items-center justify-between mt-2">
          <p id="job-description-hint" className={cn("text-sm", isValid ? "text-green-600" : "text-muted-foreground")}>
            {charCount} characters {isValid ? "(minimum 50 met)" : `(${minChars - charCount} more needed)`}
          </p>
          {error && (
            <p id="job-description-error" className="text-sm text-destructive" role="alert">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}