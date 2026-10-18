"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Video, Mic, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

function AiInterviewerTile({ isReady }: { isReady: boolean }) {
  return (
    <Card className="border-slate-200/80 bg-slate-50/50 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/40">
      <CardContent className="flex items-center justify-between p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 dark:bg-primary/20">
            <Bot className="h-6 w-6" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">AI Interviewer</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Agent Active
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isReady
                ? "Ready to join as soon as you enter room"
                : "Preparing personalized questions..."}
            </p>
          </div>
        </div>

        {isReady && (
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        )}
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      {/* Header Banner */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-4 w-4" />
          Pre-Interview Check
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Interview Readiness Lobby
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
          Test your hardware setup before beginning your live AI interview session.
        </p>
      </div>

      {/* Grid Layout */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left Column: Device Stream Preview */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-900/5 p-1 shadow-md dark:border-slate-800/80 dark:bg-slate-950/50">
            <DevicePreview onReadyChange={handleReadyChange} />
          </div>

          {state.status === "unconfigured" && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Stream video connection is unconfigured. Hardware test remains active.
              </span>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{state.message}</span>
            </div>
          )}

          <AiInterviewerTile isReady={isReady} />
        </div>

        {/* Right Column: Processing Card & Start Button */}
        <Card className="flex flex-col border-slate-200/80 bg-white/80 shadow-lg backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Session Setup Progress
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Extracting resume details and synthesizing job requirements.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between space-y-6">
            <div className="space-y-4">
              <ProcessingChecklist status={resumeStatus} />

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Target Role
                </p>
                <p className="mt-1 line-clamp-3 text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-200">
                  {jobDescription || "Job Description"}
                </p>
              </div>
            </div>

            {/* Trigger Button Section */}
            <div className="space-y-2 pt-2">
              <Button
                className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50"
                size="lg"
                onClick={onStart}
                disabled={!canStart}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting Session...
                  </>
                ) : (
                  <>
                    <Video className="mr-2 h-4 w-4" />
                    Start Live Interview
                  </>
                )}
              </Button>

              {!isReady && (
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                  Waiting for interview question generation to complete...
                </p>
              )}
              {isReady && !devicesReady && (
                <p className="text-center text-[11px] text-amber-600 dark:text-amber-400">
                  Please allow camera and microphone access to enable start.
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