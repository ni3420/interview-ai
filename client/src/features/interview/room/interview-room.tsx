"use client";

import Link from "next/link";
import { useCallback } from "react";
import {
  CallControls,
  SpeakerLayout,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import { ArrowLeft, CheckCircle, Clock, MessageSquare, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TranscriptionPanel,
  type TranscriptItem,
} from "./transcription-panel";
import { useStreamSession } from "./stream-provider";
import { useInterviewTimer } from "./use-interview-timer";
import { formatCountdown, isTimeRunningLow } from "@/lib/interview-timer";

interface InterviewRoomProps {
  /** Target role / job description summary shown in the header. */
  role: string;
  /** Ends the interview: persists completion and navigates to the report. */
  onFinish: () => void | Promise<void>;
  /** Optional sink for finalized transcript turns. */
  onTranscript?: (item: TranscriptItem) => void;
  isFinishing?: boolean;
  /** Epoch ms when the interview started (persisted in Convex). */
  startedAt?: number | null;
  /** Selected session length in minutes. */
  durationMinutes: number;
  /** Called when the timer runs out. Falls back to `onFinish` when omitted. */
  onTimeExpired?: () => void | Promise<void>;
}

function RoomHeader({
  role,
  onFinish,
  isFinishing,
  remainingMs,
}: Pick<InterviewRoomProps, "role" | "onFinish" | "isFinishing"> & {
  remainingMs: number | null;
}) {
  const { useParticipantCount } = useCallStateHooks();
  const participantCount = useParticipantCount();
  const isLow = remainingMs !== null && isTimeRunningLow(remainingMs);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/80 px-6 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-4">
       
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Video className="h-5 w-5 text-primary" />
            AI Live Video Interview
          </h1>
          <p className="truncate text-xs text-gray-400">
            Role: {role || "Software Engineer"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {remainingMs !== null && (
          <span
            data-testid="interview-countdown"
            role="timer"
            aria-live="off"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${
              isLow
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-gray-700 bg-gray-800 text-gray-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {formatCountdown(remainingMs)}
          </span>
        )}
        <span className="hidden items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 sm:flex">
          <Users className="h-3.5 w-3.5" />
          {participantCount} in room
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400 md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Live
        </span>
        <Button
          onClick={() => void onFinish()}
          disabled={isFinishing}
          variant="destructive"
          size="sm"
        >
          <CheckCircle className="mr-2 h-4 w-4" />
          {isFinishing ? "Ending..." : "End Interview"}
        </Button>
      </div>
    </header>
  );
}

/**
 * Full-bleed live interview stage.
 *
 * Renders the participant video, call controls, and the live transcript. It is
 * rendered inside `StreamProvider`, which owns the connection; this component
 * only arranges UI and reports when the candidate ends the interview.
 */
export function InterviewRoom({
  role,
  onFinish,
  onTranscript,
  isFinishing = false,
  startedAt = null,
  durationMinutes,
  onTimeExpired,
}: InterviewRoomProps) {
  const { call } = useStreamSession();
  const handleExpire = useCallback(() => {
    void (onTimeExpired ?? onFinish)();
  }, [onTimeExpired, onFinish]);
  const remainingMs = useInterviewTimer({
    startedAt: startedAt ?? null,
    durationMinutes,
    onExpire: handleExpire,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      <RoomHeader
        role={role}
        onFinish={onFinish}
        isFinishing={isFinishing}
        remainingMs={remainingMs}
      />

      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_400px]">
        <div className="flex h-full flex-col gap-4 overflow-hidden">
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
            <SpeakerLayout />
          </div>
          <div className="flex justify-center rounded-2xl border border-gray-800 bg-gray-900 p-3 shadow-lg">
            <CallControls onLeave={() => void onFinish()} />
          </div>
        </div>

        <div className="hidden flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-xl lg:flex">
          <div className="flex items-center justify-between border-b border-gray-800 bg-gray-800/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Live Transcript</h2>
            </div>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              Auto-scroll
            </span>
          </div>
          <TranscriptionPanel call={call} onTranscript={onTranscript} />
        </div>
      </main>
    </div>
  );
}

export default InterviewRoom;
