"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  FileText,
  Brain,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  UploadCloud,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ResumeUpload } from "@/features/interview/ResumeUpload";
import { JobDescriptionInput } from "@/features/interview/JobDescriptionInput";
import { interviewSetupSchema } from "@/features/interview/validation";
import {
  INTERVIEW_DURATIONS,
  DEFAULT_INTERVIEW_DURATION,
  type InterviewDuration,
} from "@/lib/interview-timer";
import { toast } from "sonner";

interface UploadedResume {
  resumeId: string;
  fileName: string;
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const createInterview = useMutation(api.interviews.createInterview);

  const [resume, setResume] = useState<UploadedResume | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<InterviewDuration>(
    DEFAULT_INTERVIEW_DURATION
  );
  const [errors, setErrors] = useState<{
    resumeId?: string;
    jobDescription?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = interviewSetupSchema.safeParse({
      resumeId: resume?.resumeId ?? "",
      jobDescription,
      durationMinutes,
    });

    if (!result.success) {
      const newErrors: typeof errors = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "resumeId") newErrors.resumeId = err.message;
        if (err.path[0] === "jobDescription")
          newErrors.jobDescription = err.message;
      });
      setErrors(newErrors);
      return;
    }

    if (!resume) return;
    setErrors({});

    setIsSubmitting(true);
    try {
      const interviewId = await createInterview({
        resumeId: resume.resumeId,
        jobDescription,
        durationMinutes,
      });

      // Extract, chunk, embed and index the resume into Qdrant.
      try {
        await fetch("/api/resume/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId }),
        });
      } catch (processingError) {
        console.error("Resume processing error:", processingError);
      }

      toast.success("Interview created successfully!");
      router.push(`/interview/${interviewId}/lobby`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create interview. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = Boolean(resume) && jobDescription.trim().length >= 50;

  return (
    <div className="relative min-h-screen w-full bg-white px-4 py-8 dark:bg-slate-950 sm:py-12">
      {/* Background Ambient Glows */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_50%_25%,rgba(139,92,246,0.12),transparent_100%)] dark:bg-[radial-gradient(50%_45%_at_50%_25%,rgba(124,58,237,0.2),transparent_100%)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-3xl">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Dashboard
          </Link>
        </div>

        {/* Page Title Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 dark:bg-primary/20">
            <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Set Up AI Mock Interview
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            Upload your resume and paste the target job description to build a custom, AI-tailored practice session.
          </p>
        </div>

        {/* Main Setup Form Card */}
        <Card className="border-slate-200/80 bg-white/80 shadow-xl backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Step 1: Upload Resume */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      1
                    </span>
                    <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Upload Your Resume
                    </label>
                  </div>
                  {resume && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Uploaded
                    </span>
                  )}
                </div>

                <ResumeUpload
                  onResumeUploaded={setResume}
                  onResumeRemoved={() => setResume(null)}
                  isProcessing={isSubmitting}
                />

                {errors.resumeId && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{errors.resumeId}</span>
                  </div>
                )}
              </div>

              {/* Step 2: Job Description */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      2
                    </span>
                    <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Target Job Description
                    </label>
                  </div>
                  <span className="text-xs text-slate-400">
                    {jobDescription.length}/50 min characters
                  </span>
                </div>

                <JobDescriptionInput
                  value={jobDescription}
                  onChange={setJobDescription}
                  error={errors.jobDescription}
                />
              </div>

              {/* Step 3: Interview Length */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      3
                    </span>
                    <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Interview Length
                    </label>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Ends automatically
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {INTERVIEW_DURATIONS.map((minutes) => {
                    const isSelected = durationMinutes === minutes;
                    return (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => setDurationMinutes(minutes)}
                        aria-pressed={isSelected}
                        className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-slate-200 bg-slate-50/60 text-slate-600 hover:border-primary/40 hover:bg-white dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:bg-slate-900/70"
                        }`}
                      >
                        <span className="text-lg font-bold">{minutes}</span>
                        <span className="text-[11px] font-medium uppercase tracking-wider">
                          minutes
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your session will end automatically after{" "}
                  {durationMinutes} minutes and your report will be generated.
                </p>
              </div>

              {/* Action Trigger */}
              <div className="pt-2">
                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50"
                  disabled={isSubmitting || !isFormValid}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Preparing Personalized Session...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Start Mock Interview
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Feature Highlights Section */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Card className="border-slate-200/60 bg-slate-50/50 transition-all hover:bg-white hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/30 dark:hover:bg-slate-900/60">
            <CardContent className="p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                AI Questions
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tailored dynamically from your resume and job requirements.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 bg-slate-50/50 transition-all hover:bg-white hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/30 dark:hover:bg-slate-900/60">
            <CardContent className="p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Adaptive Follow-ups
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Responds dynamically to your specific verbal and technical answers.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 bg-slate-50/50 transition-all hover:bg-white hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/30 dark:hover:bg-slate-900/60">
            <CardContent className="p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Brain className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Detailed Feedback
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Comprehensive score breakdown with actionable STAR improvements.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}