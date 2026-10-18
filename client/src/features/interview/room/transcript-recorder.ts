import { AI_INTERVIEWER_ID, AI_INTERVIEWER_NAME } from "./constants";
import type { TranscriptItem } from "./transcription-panel";

/**
 * Turns a live transcript into persisted Q/A pairs.
 *
 * The AI interviewer's turns become the pending question; each candidate turn
 * is saved as an answer to that question. Kept as a pure reducer so the
 * mapping is unit-testable without Stream or Convex.
 */
export interface RecorderState {
  pendingQuestion: string;
  nextIndex: number;
}

export const initialRecorderState: RecorderState = {
  pendingQuestion: "",
  nextIndex: 0,
};

export interface RecordedAnswer {
  questionIndex: number;
  question: string;
  answer: string;
  followUpCount: number;
}

export function isInterviewerTurn(item: TranscriptItem): boolean {
  return (
    item.speakerId === AI_INTERVIEWER_ID || item.speaker === AI_INTERVIEWER_NAME
  );
}

export function applyTranscriptTurn(
  state: RecorderState,
  item: TranscriptItem
): { state: RecorderState; answer: RecordedAnswer | null } {
  if (isInterviewerTurn(item)) {
    return { state: { ...state, pendingQuestion: item.text }, answer: null };
  }

  const answer: RecordedAnswer = {
    questionIndex: state.nextIndex,
    question: state.pendingQuestion || "Interview question",
    answer: item.text,
    followUpCount: 0,
  };

  return { state: { ...state, nextIndex: state.nextIndex + 1 }, answer };
}
