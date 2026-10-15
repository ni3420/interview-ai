"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Bot, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProcessingChecklist, type ResumeStatus } from "./processing-checklist";
import type { LobbySession } from "./lobby-video";

// The GetStream SDK touches browser APIs, so the video layer is client-only.
const LobbyVideo = dynamic(() => import("./lobby-video"), {
  ssr: false,
  loading: () => <VideoPlaceholder state={{ status: "loading" }} />,
});

interface InterviewLobbyProps {
  interviewId: string;
  jobDescription: string;
  resumeStatus?: ResumeStatus;
  isReady: boolean;
  onStart: () => void;
  isStarting: boolean;
}

type SessionState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | { status: "ready"; session: LobbySession };

function AiInterviewerTile() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">AI Interviewer</p>
          <p className="text-xs text-muted-foreground">
            Joins once your interview is prepared
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VideoPlaceholder({ state }: { state: SessionState }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted text-center">
      {state.status === "loading" ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Connecting to the interview room...

          </p>
          <h1>hshshdhdh</h1>
        </>
      ) : state.status === "unconfigured" ? (
        <>
          <Video className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Video is not configured</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Add STREAM_API_KEY and STREAM_API_SECRET to enable the live interview
            room.
          </p>
        </>
      ) : state.status === "error" ? (
        <>
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Could not start video</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {state.message}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function InterviewLobby({
  interviewId,
  jobDescription,
  resumeStatus,
  isReady,
  onStart,
  isStarting,
}: InterviewLobbyProps) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      try {
        const response = await fetch("/api/stream/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId }),
        });

        if (response.status === 503) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          if (data.error === "stream_not_configured") {
            if (!cancelled) setState({ status: "unconfigured" });
            return;
          }
        }

        if (!response.ok) {
          if (!cancelled) {
            setState({
              status: "error",
              message: "The interview room could not be started.",
            });
          }
          return;
        }

        const session = (await response.json()) as LobbySession;
        if (!cancelled) setState({ status: "ready", session });
      } catch (error) {
        console.error("Failed to fetch the lobby session", error);
        if (!cancelled) {
          setState({
            status: "error",
            message: "Check your camera, microphone and network connection.",
          });
        }
      }
    }

    void fetchToken();
    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Interview Lobby
        </h1>
        <p className="mt-1 text-muted-foreground">
          Prepare yourself. We&apos;ll start as soon as your interview is ready.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {state.status === "ready" ? (
            <LobbyVideo session={state.session} />
          ) : (
            <VideoPlaceholder state={state} />
          )}

          <AiInterviewerTile />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Preparing your interview</CardTitle>
            <CardDescription>
              Your resume is being turned into a personalised interview.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProcessingChecklist status={resumeStatus} />

            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Target role
              </p>
              <p className="mt-1 line-clamp-3 text-sm">{jobDescription}</p>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                size="lg"
                onClick={onStart}
                disabled={!isReady || isStarting}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  "Start Interview"
                )}
              </Button>
              {!isReady && (
                <p className="text-center text-xs text-muted-foreground">
                  Available once your resume has been processed.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
