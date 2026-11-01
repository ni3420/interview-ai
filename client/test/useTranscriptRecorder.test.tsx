import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { TranscriptItem } from "@/features/interview/room/transcription-panel";
import type { PersistedAnswer } from "@/features/interview/room/transcript-recorder";
import { AI_INTERVIEWER_ID, AI_INTERVIEWER_NAME } from "@/features/interview/room/constants";

const mocks = vi.hoisted(() => ({
  saveAnswer: vi.fn(),
  saveSegment: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (ref: unknown) => {
    const name = String(ref);
    if (name.includes("saveAnswer")) return mocks.saveAnswer;
    if (name.includes("saveTranscriptSegment")) return mocks.saveSegment;
    return vi.fn();
  },
}));

vi.mock("@/lib/glitchtip", () => ({
  captureException: mocks.captureException,
}));

import { useTranscriptRecorder } from "@/features/interview/room/use-transcript-recorder";

function item(overrides: Partial<TranscriptItem>): TranscriptItem {
  return {
    id: "t",
    segmentKey: "t",
    speakerId: "user_1",
    speaker: "Candidate",
    speakerRole: "candidate",
    speakerConfidence: 1,
    start: 0,
    end: 1,
    text: "Some speech",
    timestamp: "00:00:00",
    isFinal: true,
    ...overrides,
  };
}

const question = item({
  id: "q-2",
  segmentKey: "ai-interviewer|q-2",
  speakerId: AI_INTERVIEWER_ID,
  speaker: AI_INTERVIEWER_NAME,
  speakerRole: "interviewer",
  text: "Why this role?",
});

const answer = item({ id: "a-2", segmentKey: "user_1|a-2", text: "I like the mission." });

function renderRecorder(initialAnswers?: PersistedAnswer[]) {
  return renderHook(
    (props: { initialAnswers?: PersistedAnswer[] }) =>
      useTranscriptRecorder("interview-1", {
        initialAnswers: props.initialAnswers,
      }),
    { initialProps: { initialAnswers } }
  );
}

describe("useTranscriptRecorder", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveAnswer.mockResolvedValue("answer-id");
    mocks.saveSegment.mockResolvedValue("segment-id");
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("holds answer writes until saved answers resolve, then resumes at the next index", async () => {
    const { result, rerender } = renderRecorder(undefined);

    act(() => {
      result.current.recordTurn(question);
      result.current.recordTurn(answer);
    });

    expect(mocks.saveAnswer).not.toHaveBeenCalled();

    const saved: PersistedAnswer[] = [
      { questionIndex: 0, question: "Tell me about yourself." },
    ];
    rerender({ initialAnswers: saved });

    await waitFor(() => expect(mocks.saveAnswer).toHaveBeenCalledTimes(1));
    expect(mocks.saveAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewId: "interview-1",
        questionIndex: 1,
        question: "Why this role?",
        answer: "I like the mission.",
      })
    );
  });

  it("retries a failed save without writing the turn twice", async () => {
    mocks.saveAnswer
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce("answer-id");

    const { result } = renderRecorder([]);

    act(() => {
      result.current.recordTurn(question);
      result.current.recordTurn(answer);
    });

    await waitFor(() => expect(mocks.saveAnswer).toHaveBeenCalledTimes(2));
    expect(mocks.saveAnswer.mock.calls[0][0]).toEqual(
      mocks.saveAnswer.mock.calls[1][0]
    );
    expect(mocks.captureException).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.persistenceDegraded).toBe(false));
  });

  it("reports a degraded transcript after retries are exhausted", async () => {
    mocks.saveAnswer.mockRejectedValue(new Error("still down"));

    const { result } = renderRecorder([]);

    act(() => {
      result.current.recordTurn(question);
      result.current.recordTurn(answer);
    });

    await waitFor(
      () => expect(result.current.persistenceDegraded).toBe(true),
      { timeout: 5_000 }
    );
    expect(mocks.saveAnswer).toHaveBeenCalledTimes(3);
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ scope: "transcript-recorder" })
    );
  });

  it("retries segment writes and clears the warning on success", async () => {
    mocks.saveSegment
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce("segment-id");

    const { result } = renderRecorder([]);

    act(() => {
      result.current.recordSegment(answer);
    });

    await waitFor(() => expect(mocks.saveSegment).toHaveBeenCalledTimes(2));
    expect(mocks.saveSegment.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        segmentKey: "user_1|a-2",
        speaker: "candidate",
        text: "I like the mission.",
      })
    );
    await waitFor(() => expect(result.current.persistenceDegraded).toBe(false));
  });
});
