"use client";

import { useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { captureException } from "@/lib/glitchtip";
import type { TranscriptItem } from "./transcription-panel";
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
export function useTranscriptRecorder(interviewId: string) {
  const saveAnswer = useMutation(api.answers.saveAnswer);
  const stateRef = useRef<RecorderState>(initialRecorderState);

  return useCallback(
    (item: TranscriptItem) => {
      const { state, answer } = applyTranscriptTurn(stateRef.current, item);
      stateRef.current = state;

      if (!answer) return;

      void saveAnswer({ interviewId, ...answer }).catch((error) => {
        captureException(error, { interviewId, scope: "transcript-recorder" });
      });
    },
    [interviewId, saveAnswer]
  );
}
