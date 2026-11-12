"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function AiInterviewerRow({ isReady }: { isReady: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-3">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            isReady ? "bg-success" : "bg-warning"
          }`}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-foreground">AI interviewer</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isReady
              ? "Prepared and waiting in the room."
              : "Preparing questions from your resume and the role."}
          </p>
        </div>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {isReady ? "Ready" : "Working"}
      </span>
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
              message: "The interview room could not be initialized.",
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
            message: "Check your camera, microphone, and network connection.",
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
    <div>
      <header className="border-b border-border pb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Pre-interview check
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Check your setup
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Confirm your camera and microphone, then enter the room. The session
          starts when you do.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-1">
            <DevicePreview onReadyChange={handleReadyChange} />
          </div>

          {state.status === "unconfigured" && (
            <p className="flex items-start gap-2 border-l-2 border-warning pl-3 text-xs text-muted-foreground">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <span>
                Live video is not configured on this deployment. The hardware
                check still works.
              </span>
            </p>
          )}

          {state.status === "error" && (
            <p className="flex items-start gap-2 border-l-2 border-destructive pl-3 text-xs text-muted-foreground">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span>{state.message}</span>
            </p>
          )}

          <AiInterviewerRow isReady={isReady} />
        </div>

        <div className="flex flex-col justify-between gap-8 border border-border p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Preparation
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Reading your resume and matching it against the role.
            </p>

            <div className="mt-5">
              <ProcessingChecklist status={resumeStatus} />
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Target role
              </p>
              <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-foreground">
                {jobDescription || "No job description provided."}
              </p>
            </div>
          </div>

          <div>
            <Button
              className="h-11 w-full"
              size="lg"
              onClick={onStart}
              disabled={!canStart}
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Connecting...
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" aria-hidden="true" />
                  Enter interview room
                </>
              )}
            </Button>

            {!isReady && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Waiting for questions to finish generating.
              </p>
            )}
            {isReady && !devicesReady && (
              <p className="mt-2 text-center text-[11px] text-warning">
                Allow camera and microphone access to continue.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewLobby;
