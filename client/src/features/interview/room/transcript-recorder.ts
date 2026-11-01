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
  /**
   * True when the state was rebuilt from saved answers: the pending question
   * came from before the reload, so the next interviewer turn is a new question.
   */
  resumed: boolean;
}

export const initialRecorderState: RecorderState = {
  pendingQuestion: "",
  nextIndex: 0,
  currentIndex: -1,
  currentAnswer: "",
  resumed: false,
};

export interface RecordedAnswer {
  questionIndex: number;
  question: string;
  answer: string;
  followUpCount: number;
}

/** The minimum shape of a persisted answer needed to resume the reducer. */
export interface PersistedAnswer {
  questionIndex: number;
  question: string;
}

/**
 * Rebuilds reducer state from answers saved earlier in this interview.
 *
 * Without this, a reload restarts `nextIndex` at 0 and the next answer would
 * overwrite the first saved row. `currentIndex` stays -1 so a continuation is
 * written as a new row instead of being appended to a finished answer; the
 * pending question is kept so that continuation still carries its question.
 */
export function recorderStateFromAnswers(
  answers: ReadonlyArray<PersistedAnswer>
): RecorderState {
  if (answers.length === 0) return initialRecorderState;

  let last = answers[0];
  for (const answer of answers) {
    if (answer.questionIndex > last.questionIndex) last = answer;
  }

  return {
    pendingQuestion: last.question,
    nextIndex: last.questionIndex + 1,
    currentIndex: -1,
    currentAnswer: "",
    resumed: true,
  };
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
    // question; so does a resumed state, whose question predates the reload.
    // Otherwise it is another segment of the question being asked.
    const startsNewQuestion =
      state.resumed || state.currentIndex >= 0 || !state.pendingQuestion;
    const question = startsNewQuestion
      ? item.text
      : `${state.pendingQuestion} ${item.text}`.trim();

    return {
      state: {
        ...state,
        pendingQuestion: question,
        currentIndex: -1,
        currentAnswer: "",
        resumed: false,
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
      resumed: false,
    },
    answer: {
      questionIndex,
      question: state.pendingQuestion,
      answer,
      followUpCount: 0,
    },
  };
}
