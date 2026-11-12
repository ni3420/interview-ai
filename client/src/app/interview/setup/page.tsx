"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
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

function StepHeading({
  step,
  title,
  aside,
}: {
  step: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {step}
        </span>
        <h2 className="font-display text-lg leading-none text-foreground">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
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
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/dashboard"
        className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft
          className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        Back to dashboard
      </Link>

      <header className="mt-8 border-b border-border pb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          New session
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Set up a mock interview
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Upload your resume and paste the job description. We build the
          question set from both, then run a live practice session.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-10 space-y-10">
        <section>
          <StepHeading step="01" title="Resume" />
          <ResumeUpload
            onResumeUploaded={setResume}
            onResumeRemoved={() => setResume(null)}
            isProcessing={isSubmitting}
          />
          {errors.resumeId && (
            <p className="mt-2 text-xs font-medium text-destructive" role="alert">
              {errors.resumeId}
            </p>
          )}
        </section>

        <section className="border-t border-border pt-8">
          <StepHeading step="02" title="Job description" />
          <JobDescriptionInput
            value={jobDescription}
            onChange={setJobDescription}
            error={errors.jobDescription}
          />
        </section>

        <section className="border-t border-border pt-8">
          <StepHeading
            step="03"
            title="Length"
            aside={
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Ends automatically
              </span>
            }
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {INTERVIEW_DURATIONS.map((minutes) => {
              const isSelected = durationMinutes === minutes;
              return (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDurationMinutes(minutes)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  <span className="font-display text-2xl leading-none">
                    {minutes}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em]">
                    minutes
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Your session ends after {durationMinutes} minutes and the written
            report is generated.
          </p>
        </section>

        <section className="border-t border-border pt-8">
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Preparing your session...
              </>
            ) : (
              <>
                Start mock interview
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            )}
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Free while in early access. No card required.
          </p>
        </section>
      </form>

      <div className="mt-14 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
        {[
          {
            title: "Tailored questions",
            body: "Built from the overlap between your resume and the role.",
          },
          {
            title: "Adaptive follow-ups",
            body: "Follows what you actually said, not a fixed script.",
          },
          {
            title: "Written feedback",
            body: "Scored answers with concrete STAR-based notes.",
          },
        ].map((item) => (
          <div key={item.title}>
            <h3 className="font-display text-sm text-foreground">{item.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
