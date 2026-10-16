"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DevicePreview } from "./device-preview";
import { ProcessingChecklist, type ResumeStatus } from "./processing-checklist";

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
  | { status: "ready" };

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

/**
 * Pre-interview preparation lobby.
 *
 * Always shows a local camera/microphone check so candidates can confirm their
 * setup before joining. The live interview room is only connected as part of
 * the start flow (see the start button), never automatically.
 */
export function InterviewLobby({
  interviewId,
  jobDescription,
  resumeStatus,
  isReady,
  onStart,
  isStarting,
}: InterviewLobbyProps) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [devicesReady, setDevicesReady] = useState(false);

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

        await response.json();
        if (!cancelled) setState({ status: "ready" });
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

  const handleReadyChange = useCallback((ready: boolean) => {
    setDevicesReady(ready);
  }, []);

  const canStart = isReady && devicesReady && !isStarting;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Interview Lobby
        </h1>
        <p className="mt-1 text-muted-foreground">
          Check your camera and microphone. We&apos;ll start as soon as your
          interview is ready.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <DevicePreview onReadyChange={handleReadyChange} />

          {state.status === "unconfigured" && (
            <p className="text-xs text-muted-foreground">
              The live interview room is not configured yet. You can still check
              your camera and microphone above.
            </p>
          )}

          {state.status === "error" && (
            <p className="text-xs text-destructive">{state.message}</p>
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
                disabled={!canStart}
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
                  Available once your interview questions are ready.
                </p>
              )}
              {isReady && !devicesReady && (
                <p className="text-center text-xs text-muted-foreground">
                  Check your camera and microphone to continue.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default InterviewLobby;
