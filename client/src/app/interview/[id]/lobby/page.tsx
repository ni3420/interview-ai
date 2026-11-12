"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
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

  if (interview === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Loading lobby
          </p>
        </div>
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Not found
        </p>
        <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-foreground">
          This session does not exist
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          It may have been removed, or it belongs to another account.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
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
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
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

      <div className="mt-6">
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
  );
}
