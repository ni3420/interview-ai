"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Loader2, Sparkles, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InterviewLobby } from "@/features/interview/lobby/interview-lobby";
import type { ResumeStatus } from "@/features/interview/lobby/processing-checklist";

interface InterviewRecord {
  _id: string;
  jobDescription: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  plan?: { questions: string[] } | null;
}

interface ResumeRecord {
  status: ResumeStatus;
}

export default function InterviewLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params.id as string;

  const interview = useQuery(api.interviews.getInterview, {
    interviewId,
  }) as InterviewRecord | null | undefined;
  const resume = useQuery(api.resume.getMyResume) as
    | ResumeRecord
    | null
    | undefined;
  const updateStatus = useMutation(api.interviews.updateInterviewStatus);

  const [isStarting, setIsStarting] = useState(false);

  // Loading State
  if (interview === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="text-xs font-medium text-slate-400">Loading interview lobby...</p>
        </div>
      </div>
    );
  }

  // Not Found State
  if (interview === null) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-white px-4 py-12 dark:bg-slate-950">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_40%,rgba(239,68,68,0.08),transparent_100%)]" />
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Interview Not Found
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            This interview session does not exist or you do not have permission to access it.
          </p>
          <Button asChild className="mt-6 rounded-xl">
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const hasQuestions = (interview.plan?.questions?.length ?? 0) > 0;

  const handleStart = async () => {
    setIsStarting(true);
    try {
      if (interview.status === "setup") {
        await updateStatus({ interviewId, status: "in_progress" });
      }
      router.push(`/interview/${interviewId}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to start the interview. Please try again.");
      setIsStarting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-white px-4 py-6 dark:bg-slate-950 sm:py-10">
      {/* Background Ambient Gradient */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_50%_25%,rgba(139,92,246,0.12),transparent_100%)] dark:bg-[radial-gradient(50%_45%_at_50%_25%,rgba(124,58,237,0.22),transparent_100%)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-5xl">
        {/* Navigation Link */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Back to Dashboard
          </Link>
        </div>

        {/* Lobby Content Wrapper */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-xl backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-8">
          <InterviewLobby
            interviewId={interviewId}
            jobDescription={interview.jobDescription}
            resumeStatus={resume?.status}
            isReady={hasQuestions}
            onStart={handleStart}
            isStarting={isStarting}
          />
        </div>
      </div>
    </div>
  );
}