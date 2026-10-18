"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { captureException } from "@/lib/glitchtip";
import { StreamProvider } from "@/features/interview/room/stream-provider";
import { InterviewRoom } from "@/features/interview/room/interview-room";
import { useTranscriptRecorder } from "@/features/interview/room/use-transcript-recorder";

type InterviewStatus = "setup" | "in_progress" | "completed" | "failed";

interface Interview {
  _id: string;
  userId: string;
  resumeText?: string;
  jobDescription: string;
  status: InterviewStatus;
  plan?: { questions: string[] } | null;
  currentQuestionIndex: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params.id as string;

  const interview = useQuery(api.interviews.getInterview, { interviewId }) as
    | Interview
    | undefined
    | null;
  const updateStatus = useMutation(api.interviews.updateInterviewStatus);
  const recordTranscript = useTranscriptRecorder(interviewId);

  const [isFinishing, setIsFinishing] = useState(false);

  // Mark the interview as started when a candidate enters the room directly
  // (the lobby may not have transitioned it yet).
  const interviewStatus = interview?.status;
  useEffect(() => {
    if (interviewStatus === "setup") {
      updateStatus({ interviewId, status: "in_progress" }).catch((error) => {
        captureException(error, { interviewId, scope: "interview-page" });
      });
    }
  }, [interviewStatus, interviewId, updateStatus]);

  const handleFinish = useCallback(async () => {
    setIsFinishing(true);
    try {
      await updateStatus({ interviewId, status: "completed" });
      toast.success("Interview completed. Generating your report...");
      router.push(`/interview/${interviewId}/report`);
    } catch (error) {
      captureException(error, { interviewId, scope: "interview-page" });
      toast.error("Failed to finish the interview. Please try again.");
      setIsFinishing(false);
    }
  }, [interviewId, router, updateStatus]);

  if (interview === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
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

  return (
    <StreamProvider interviewId={interviewId}>
      <InterviewRoom
        role={interview.jobDescription}
        onFinish={handleFinish}
        onTranscript={recordTranscript}
        isFinishing={isFinishing}
      />
    </StreamProvider>
  );
}
