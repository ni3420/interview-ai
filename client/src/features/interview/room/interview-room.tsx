"use client";

import { useCallback } from "react";
import {
  CallControls,
  SpeakerLayout,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import { CheckCircle, Clock, MessageSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TranscriptionPanel,
  type PersistedTranscriptSegment,
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
  /** Optional sink for every finalized caption (new or refined). */
  onSegment?: (item: TranscriptItem, isUpdate: boolean) => void;
  /** Segments saved earlier in this interview, shown when the room reopens. */
  initialSegments?: ReadonlyArray<PersistedTranscriptSegment>;
  /** True while transcript writes are failing after retries. */
  persistenceDegraded?: boolean;
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
    <header className="flex items-center justify-between gap-4 border-b border-neutral-800 bg-neutral-900/80 px-6 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-4">
       
        <div className="min-w-0">
          <h1 className="font-display text-lg leading-none text-neutral-100">
            Interview in progress
          </h1>
          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
            {role ? `Role / ${role.slice(0, 80)}` : "Role / Software Engineer"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {remainingMs !== null && (
          <span
            data-testid="interview-countdown"
            role="timer"
            aria-live="off"
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums ${
              isLow
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-neutral-700 bg-neutral-800 text-neutral-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {formatCountdown(remainingMs)}
          </span>
        )}
        <span className="hidden items-center gap-1.5 rounded-md border border-neutral-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400 sm:flex">
          <Users className="h-3.5 w-3.5" />
          {participantCount} in room
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
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
  onSegment,
  initialSegments,
  persistenceDegraded = false,
  isFinishing = false,
  startedAt = null,
  durationMinutes,
  onTimeExpired,
}: InterviewRoomProps) {
  const { call, session } = useStreamSession();
  const handleExpire = useCallback(() => {
    void (onTimeExpired ?? onFinish)();
  }, [onTimeExpired, onFinish]);
  const remainingMs = useInterviewTimer({
    startedAt: startedAt ?? null,
    durationMinutes,
    onExpire: handleExpire,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      <RoomHeader
        role={role}
        onFinish={onFinish}
        isFinishing={isFinishing}
        remainingMs={remainingMs}
      />

      {persistenceDegraded && (
        <div
          role="status"
          data-testid="persistence-warning"
          className="border-b border-warning/30 bg-warning/10 px-6 py-2 text-center text-xs font-medium text-warning"
        >
          Transcript saving is failing. Recent turns may be missing from your
          report.
        </div>
      )}

      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_400px]">
        <div className="flex h-full flex-col gap-4 overflow-hidden">
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 ">
            <SpeakerLayout />
          </div>
          <div className="flex justify-center rounded-lg border border-neutral-800 bg-neutral-900 p-3 ">
            <CallControls onLeave={() => void onFinish()} />
          </div>
        </div>

        <div className="hidden flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900  lg:flex">
          <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-800/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-neutral-500" />
              <h2 className="font-display text-sm text-neutral-200">Live transcript</h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              Auto-scroll
            </span>
          </div>
          <TranscriptionPanel
            call={call}
            candidateId={session.user.id}
            initialSegments={initialSegments}
            onTranscript={onTranscript}
            onSegment={onSegment}
          />
        </div>
      </main>
    </div>
  );
}

export default InterviewRoom;
