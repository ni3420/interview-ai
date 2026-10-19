import { describe, it, expect } from "vitest";
import {
  applyTranscriptTurn,
  initialRecorderState,
  isInterviewerTurn,
} from "@/features/interview/room/transcript-recorder";
import { AI_INTERVIEWER_ID, AI_INTERVIEWER_NAME } from "@/features/interview/room/constants";
import type { TranscriptItem } from "@/features/interview/room/transcription-panel";

function turn(overrides: Partial<TranscriptItem>): TranscriptItem {
  return {
    id: "t",
    speakerId: "user_1",
    speaker: "Candidate",
    text: "Some speech",
    timestamp: "00:00:00",
    isFinal: true,
    ...overrides,
  };
}

describe("isInterviewerTurn", () => {
  it("matches the agent by id", () => {
    expect(
      isInterviewerTurn(turn({ speakerId: AI_INTERVIEWER_ID }))
    ).toBe(true);
  });

  it("matches the agent by name", () => {
    expect(
      isInterviewerTurn(turn({ speakerId: "other", speaker: AI_INTERVIEWER_NAME }))
    ).toBe(true);
  });

  it("does not match the candidate", () => {
    expect(isInterviewerTurn(turn({}))).toBe(false);
  });
});

describe("applyTranscriptTurn", () => {
  it("stores the interviewer turn as the pending question", () => {
    const { state, answer } = applyTranscriptTurn(
      initialRecorderState,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Tell me about yourself." })
    );

    expect(answer).toBeNull();
    expect(state.pendingQuestion).toBe("Tell me about yourself.");
    expect(state.nextIndex).toBe(0);
  });

  it("saves a candidate answer against the pending question", () => {
    const withQuestion = applyTranscriptTurn(
      initialRecorderState,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Tell me about yourself." })
    ).state;

    const { state, answer } = applyTranscriptTurn(
      withQuestion,
      turn({ text: "I am a frontend engineer." })
    );

    expect(answer).toEqual({
      questionIndex: 0,
      question: "Tell me about yourself.",
      answer: "I am a frontend engineer.",
      followUpCount: 0,
    });
    expect(state.nextIndex).toBe(1);
  });

  it("falls back to a generic question before any interviewer turn", () => {
    const { answer } = applyTranscriptTurn(
      initialRecorderState,
      turn({ text: "Hello?" })
    );

    expect(answer?.question).toBe("Interview question");
    expect(answer?.questionIndex).toBe(0);
  });

  it("increments the index across multiple answers", () => {
    let state = applyTranscriptTurn(
      initialRecorderState,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Q1" })
    ).state;
    state = applyTranscriptTurn(state, turn({ text: "A1" })).state;
    state = applyTranscriptTurn(
      state,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Q2" })
    ).state;
    const { answer } = applyTranscriptTurn(state, turn({ text: "A2" }));

    expect(answer?.questionIndex).toBe(1);
    expect(answer?.question).toBe("Q2");
  });

  it("appends consecutive candidate segments into one answer", () => {
    let state = applyTranscriptTurn(
      initialRecorderState,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Tell me about yourself." })
    ).state;

    const first = applyTranscriptTurn(state, turn({ text: "I am a frontend" }));
    state = first.state;
    const second = applyTranscriptTurn(state, turn({ text: "engineer." }));

    expect(first.answer?.questionIndex).toBe(0);
    expect(second.answer?.questionIndex).toBe(0);
    expect(second.answer?.answer).toBe("I am a frontend engineer.");
    expect(state.nextIndex).toBe(1);
  });

  it("starts a new answer only after the next question", () => {
    let state = applyTranscriptTurn(
      initialRecorderState,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Q1" })
    ).state;
    state = applyTranscriptTurn(state, turn({ text: "First" })).state;
    state = applyTranscriptTurn(state, turn({ text: "answer" })).state;
    state = applyTranscriptTurn(
      state,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Q2" })
    ).state;
    const { answer } = applyTranscriptTurn(state, turn({ text: "Second answer" }));

    expect(answer?.questionIndex).toBe(1);
    expect(answer?.question).toBe("Q2");
    expect(answer?.answer).toBe("Second answer");
  });

  it("appends consecutive interviewer segments into one question", () => {
    let state = applyTranscriptTurn(
      initialRecorderState,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "Tell me about your" })
    ).state;
    state = applyTranscriptTurn(
      state,
      turn({ speakerId: AI_INTERVIEWER_ID, text: "React experience." })
    ).state;

    const { answer } = applyTranscriptTurn(state, turn({ text: "Sure." }));

    expect(answer?.question).toBe("Tell me about your React experience.");
  });
});
