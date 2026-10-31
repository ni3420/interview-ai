"use client";

import { useEffect, useMemo } from "react";
import type { Call } from "@stream-io/video-react-sdk";
import { TranscriptionPanel } from "../room/transcription-panel";
import { startJoinTiming } from "../room/room-timing";

const CANDIDATE_ID = "e2e-candidate";

interface ScriptedCaption {
  id: string;
  text: string;
  speaker_id?: string;
  start_time?: string;
  end_time?: string;
  user?: { id: string; name: string };
}

type CaptionHandler = (event: { closed_caption: ScriptedCaption }) => void;

/**
 * Runs the real transcript panel against a scripted call, so an end-to-end
 * run can assert the rendered Q/A and the room-timing console events without
 * joining Stream or waking the Gemini Live agent.
 */
function createScriptedCall() {
  const handlers = new Set<CaptionHandler>();
  const call = {
    on(event: string, handler: CaptionHandler) {
      if (event !== "call.closed_caption") return () => {};
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  } as unknown as Call;

  return {
    call,
    emit: (caption: ScriptedCaption) => {
      handlers.forEach((handler) => handler({ closed_caption: caption }));
    },
  };
}

export function RoomHarness() {
  const script = useMemo(() => createScriptedCall(), []);

  useEffect(() => {
    startJoinTiming();
    const timers = [
      setTimeout(() => {
        script.emit({
          id: "e2e-question",
          text: "Tell me about your React experience.",
          user: { id: "ai-interviewer", name: "AI Interviewer" },
          start_time: "2026-01-01T10:00:00.000Z",
          end_time: "2026-01-01T10:00:01.000Z",
        });
      }, 200),
      setTimeout(() => {
        script.emit({
          id: "e2e-answer",
          text: "I built several design systems.",
          speaker_id: CANDIDATE_ID,
          start_time: "2026-01-01T10:00:04.000Z",
          end_time: "2026-01-01T10:00:06.000Z",
        });
      }, 600),
      setTimeout(() => {
        script.emit({
          id: "e2e-follow-up",
          text: "What was the hardest part?",
          user: { id: "ai-interviewer", name: "AI Interviewer" },
          start_time: "2026-01-01T10:00:07.500Z",
          end_time: "2026-01-01T10:00:08.500Z",
        });
      }, 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [script]);

  return (
    <main
      className="mx-auto flex h-screen max-w-3xl flex-col p-6"
      data-testid="room-harness"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
        <TranscriptionPanel call={script.call} candidateId={CANDIDATE_ID} />
      </div>
    </main>
  );
}
