"use client";

import { useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { captureException } from "@/lib/glitchtip";
import type { TranscriptItem } from "./transcription-panel";
import { logRoomTiming } from "./room-timing";
import {
  applyTranscriptTurn,
  initialRecorderState,
  type RecorderState,
} from "./transcript-recorder";

/**
 * Persists live interview turns as Convex answers.
 *
 * Each finalized caption is reduced into a Q/A pair (interviewer question +
 * candidate answer) and saved. Failures are reported but never interrupt the
 * live interview.
 */
export interface TranscriptRecorder {
  /** Reduces a finalized turn into the live/review Q&A view. */
  recordTurn: (item: TranscriptItem) => void;
  /** Upserts the raw caption segment used by the report pipeline. */
  recordSegment: (item: TranscriptItem) => void;
}

export function useTranscriptRecorder(interviewId: string): TranscriptRecorder {
  const saveAnswer = useMutation(api.answers.saveAnswer);
  const saveSegment = useMutation(api.answers.saveTranscriptSegment);
  const stateRef = useRef<RecorderState>(initialRecorderState);
  // Serialize writes so a later, fuller answer for the same question can never
  // be overwritten by an earlier in-flight save resolving out of order.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Segment writes are serialized too: a refined caption arriving before the
  // first insert resolves must patch the same row, not race it into a second.
  const segmentQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const recordTurn = useCallback(
    (item: TranscriptItem) => {
      const { state, answer } = applyTranscriptTurn(stateRef.current, item);
      stateRef.current = state;

      if (!answer) return;

      const receivedAt = performance.now();
      queueRef.current = queueRef.current
        .then(() => saveAnswer({ interviewId, ...answer }))
        .then(() => {
          const turnLatencyMs = Math.round(performance.now() - receivedAt);
          logRoomTiming("turn.persist", turnLatencyMs, { turnLatencyMs });
        })
        .catch((error) => {
          captureException(error, {
            interviewId,
            scope: "transcript-recorder",
          });
        });
    },
    [interviewId, saveAnswer]
  );

  const recordSegment = useCallback(
    (item: TranscriptItem) => {
      segmentQueueRef.current = segmentQueueRef.current
        .then(() =>
          saveSegment({
            interviewId,
            segmentKey: item.segmentKey,
            speaker: item.speakerRole,
            start: item.start,
            end: item.end,
            text: item.text,
            asrConfidence: item.asrConfidence,
            speakerConfidence: item.speakerConfidence,
          })
        )
        .catch((error) => {
          captureException(error, {
            interviewId,
            scope: "transcript-segment",
          });
        });
    },
    [interviewId, saveSegment]
  );

  return { recordTurn, recordSegment };
}
