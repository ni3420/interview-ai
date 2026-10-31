import { AI_INTERVIEWER_ID, AI_INTERVIEWER_NAME } from "./constants";
import type { TranscriptItem } from "./transcription-panel";

/**
 * Turns a live transcript into persisted Q/A pairs.
 *
 * The AI interviewer's turns build the current question; the candidate's turns
 * build the answer to it. Captions arrive per speech segment, so consecutive
 * interviewer segments are appended into one question and consecutive candidate
 * segments into one answer. A new answer only starts once the interviewer asks
 * another question.
 *
 * Kept as a pure reducer so the mapping is unit-testable without Stream or Convex.
 */
export interface RecorderState {
  pendingQuestion: string;
  /** Next fresh answer index to assign. */
  nextIndex: number;
  /** Index of the answer currently being accumulated, or -1 when none. */
  currentIndex: number;
  /** Text accumulated for the answer currently being built. */
  currentAnswer: string;
}

export const initialRecorderState: RecorderState = {
  pendingQuestion: "",
  nextIndex: 0,
  currentIndex: -1,
  currentAnswer: "",
};

export interface RecordedAnswer {
  questionIndex: number;
  question: string;
  answer: string;
  followUpCount: number;
}

export function isInterviewerTurn(item: TranscriptItem): boolean {
  return (
    item.speakerRole === "interviewer" ||
    item.speakerId === AI_INTERVIEWER_ID ||
    item.speaker === AI_INTERVIEWER_NAME
  );
}

export function applyTranscriptTurn(
  state: RecorderState,
  item: TranscriptItem
): { state: RecorderState; answer: RecordedAnswer | null } {
  if (isInterviewerTurn(item)) {
    // A candidate already answered (currentIndex >= 0) means this opens a new
    // question. Otherwise it is another segment of the question being asked.
    const startsNewQuestion =
      state.currentIndex >= 0 || !state.pendingQuestion;
    const question = startsNewQuestion
      ? item.text
      : `${state.pendingQuestion} ${item.text}`.trim();

    return {
      state: {
        ...state,
        pendingQuestion: question,
        currentIndex: -1,
        currentAnswer: "",
      },
      answer: null,
    };
  }

  // Unknown speakers and speech before the first real question are not
  // answers. The live view may still display them; they never enter the
  // evaluated Q&A rows.
  if (item.speakerRole !== "candidate" || !state.pendingQuestion) {
    return { state, answer: null };
  }

  const startsNewAnswer = state.currentIndex < 0;
  const questionIndex = startsNewAnswer ? state.nextIndex : state.currentIndex;
  const answer = startsNewAnswer
    ? item.text
    : `${state.currentAnswer} ${item.text}`.trim();

  return {
    state: {
      ...state,
      currentIndex: questionIndex,
      currentAnswer: answer,
      nextIndex: startsNewAnswer ? state.nextIndex + 1 : state.nextIndex,
    },
    answer: {
      questionIndex,
      question: state.pendingQuestion,
      answer,
      followUpCount: 0,
    },
  };
}
