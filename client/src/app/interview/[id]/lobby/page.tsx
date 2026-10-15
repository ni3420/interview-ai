"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Loader2 } from "lucide-react";
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

  if (interview === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Interview not found</h1>
        <p className="text-muted-foreground">
          This interview does not exist or you do not have access to it.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const hasQuestions =
    (interview.plan?.questions?.length ?? 0) > 0 ||
    resume?.status === "ready";

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
    <div className="container max-w-6xl py-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <InterviewLobby
        interviewId={interviewId}
        jobDescription={interview.jobDescription}
        resumeStatus={resume?.status}
        isReady={hasQuestions}
        onStart={handleStart}
        isStarting={isStarting}
      />
    </div>
  );
}
