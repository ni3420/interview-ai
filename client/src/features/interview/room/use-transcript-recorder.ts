"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { captureException } from "@/lib/glitchtip";
import type { TranscriptItem } from "./transcription-panel";
import { logRoomTiming } from "./room-timing";
import {
  applyTranscriptTurn,
  initialRecorderState,
  recorderStateFromAnswers,
  type PersistedAnswer,
  type RecorderState,
} from "./transcript-recorder";

/** Delays between attempts. Two retries survive a short network blip. */
const RETRY_DELAYS_MS = [400, 1200];
/** Do not block answer writes forever if the hydration query never resolves. */
const HYDRATION_TIMEOUT_MS = 5_000;

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Persists live interview turns as Convex answers.
 *
 * Each finalized caption is reduced into a Q/A pair (interviewer question +
 * candidate answer) and saved. Answer writes wait for the interview's saved
 * answers so a reload resumes at the next index rather than overwriting row 0.
 * Failures are retried, then reported, but never interrupt the interview.
 */
export interface TranscriptRecorder {
  /** Reduces a finalized turn into the live/review Q&A view. */
  recordTurn: (item: TranscriptItem) => void;
  /** Upserts the raw caption segment used by the report pipeline. */
  recordSegment: (item: TranscriptItem) => void;
  /** True while writes are failing after retries; the room warns the user. */
  persistenceDegraded: boolean;
}

export interface TranscriptRecorderOptions {
  /**
   * Answers already saved for this interview. `undefined` means the query is
   * still loading; the recorder holds answer writes until it resolves.
   */
  initialAnswers?: ReadonlyArray<PersistedAnswer>;
}

export function useTranscriptRecorder(
  interviewId: string,
  options: TranscriptRecorderOptions = {}
): TranscriptRecorder {
  const { initialAnswers } = options;
  const saveAnswer = useMutation(api.answers.saveAnswer);
  const saveSegment = useMutation(api.answers.saveTranscriptSegment);
  const stateRef = useRef<RecorderState>(initialRecorderState);
  const hydratedRef = useRef(false);
  // A lane that opens once saved answers are read (or the timeout fires). Kept
  // in state rather than a render-time ref so the promise is created once.
  const [hydrationGate] = useState(() => {
    let resolve!: () => void;
    const promise = new Promise<void>((resolved) => {
      resolve = resolved;
    });
    return { promise, resolve };
  });
  // Serialize writes so a later, fuller answer for the same question can never
  // be overwritten by an earlier in-flight save resolving out of order.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Segment writes are serialized too: a refined caption arriving before the
  // first insert resolves must patch the same row, not race it into a second.
  const segmentQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [persistenceDegraded, setPersistenceDegraded] = useState(false);

  useEffect(() => {
    if (hydratedRef.current || initialAnswers === undefined) return;
    hydratedRef.current = true;
    stateRef.current = recorderStateFromAnswers(initialAnswers);
    hydrationGate.resolve();
  }, [initialAnswers, hydrationGate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydratedRef.current) return;
      // Saving unindexed is worse than saving late, but losing every turn while
      // a query hangs is worse still.
      hydratedRef.current = true;
      hydrationGate.resolve();
    }, HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hydrationGate]);

  const recordTurn = useCallback(
    (item: TranscriptItem) => {
      const receivedAt = performance.now();
      queueRef.current = queueRef.current.then(async () => {
        await hydrationGate.promise;
        const { state, answer } = applyTranscriptTurn(stateRef.current, item);
        stateRef.current = state;

        if (!answer) return;

        try {
          await withRetry(() => saveAnswer({ interviewId, ...answer }));
          setPersistenceDegraded(false);
          const turnLatencyMs = Math.round(performance.now() - receivedAt);
          logRoomTiming("turn.persist", turnLatencyMs, { turnLatencyMs });
        } catch (error) {
          setPersistenceDegraded(true);
          captureException(error, {
            interviewId,
            scope: "transcript-recorder",
          });
        }
      });
    },
    [interviewId, saveAnswer, hydrationGate]
  );

  const recordSegment = useCallback(
    (item: TranscriptItem) => {
      segmentQueueRef.current = segmentQueueRef.current.then(async () => {
        try {
          await withRetry(() =>
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
          );
          setPersistenceDegraded(false);
        } catch (error) {
          setPersistenceDegraded(true);
          captureException(error, {
            interviewId,
            scope: "transcript-segment",
          });
        }
      });
    },
    [interviewId, saveSegment]
  );

  return { recordTurn, recordSegment, persistenceDegraded };
}
