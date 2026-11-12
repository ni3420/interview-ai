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
import { stopInterviewerAgent } from "@/features/interview/room/stream-session";
import { useTranscriptRecorder } from "@/features/interview/room/use-transcript-recorder";
import type { PersistedAnswer } from "@/features/interview/room/transcript-recorder";
import type { PersistedTranscriptSegment } from "@/features/interview/room/transcription-panel";

type InterviewStatus = "setup" | "in_progress" | "completed" | "failed";

interface Interview {
  _id: string;
  userId: string;
  resumeText?: string;
  jobDescription: string;
  status: InterviewStatus;
  plan?: { questions: string[] } | null;
  currentQuestionIndex: number;
  durationMinutes?: number;
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
  // Saved turns and captions let a reload continue the transcript instead of
  // starting over at question 0.
  const savedAnswers = useQuery(api.answers.getAnswers, { interviewId }) as
    | PersistedAnswer[]
    | undefined;
  const savedSegments = useQuery(api.answers.getTranscriptSegments, {
    interviewId,
  }) as PersistedTranscriptSegment[] | undefined;
  const updateStatus = useMutation(api.interviews.updateInterviewStatus);
  const { recordTurn, recordSegment, persistenceDegraded } =
    useTranscriptRecorder(interviewId, { initialAnswers: savedAnswers });

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
      // The interviewer waits for the call to end, which cannot happen while
      // it is still in the call, so it must be told to leave.
      void stopInterviewerAgent(interviewId).catch((error) => {
        captureException(error, {
          interviewId,
          scope: "interview-page",
          step: "stop-interviewer",
        });
      });
      toast.success("Interview completed. Generating your report...");
      router.push(`/interview/${interviewId}/report`);
    } catch (error) {
      captureException(error, { interviewId, scope: "interview-page" });
      toast.error("Failed to finish the interview. Please try again.");
      setIsFinishing(false);
    }
  }, [interviewId, router, updateStatus]);

  const handleTimeExpired = useCallback(async () => {
    toast.info("Time's up! Ending the interview and generating your report...");
    await handleFinish();
  }, [handleFinish]);

  if (interview === undefined) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2
          className="h-5 w-5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Loading room
        </p>
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Not found
        </p>
        <h1 className="font-display text-3xl leading-tight tracking-tight text-foreground">
          Interview not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This interview does not exist or you do not have access to it.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <StreamProvider interviewId={interviewId}>
      <InterviewRoom
        role={interview.jobDescription}
        onFinish={handleFinish}
        onTranscript={recordTurn}
        onSegment={recordSegment}
        initialSegments={savedSegments}
        persistenceDegraded={persistenceDegraded}
        isFinishing={isFinishing}
        startedAt={interview.startedAt ?? null}
        durationMinutes={interview.durationMinutes ?? 30}
        onTimeExpired={handleTimeExpired}
      />
    </StreamProvider>
  );
}
