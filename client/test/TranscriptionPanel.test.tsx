import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import type { Call } from "@stream-io/video-react-sdk";
import {
  TranscriptionPanel,
  type TranscriptItem,
} from "@/features/interview/room/transcription-panel";

type CaptionHandler = (event: {
  closed_caption?: {
    id?: string;
    text?: string;
    speaker_id?: string;
    start_time?: string;
    user?: { id?: string; name?: string };
  };
}) => void;

function createFakeCall() {
  const handlers = new Set<CaptionHandler>();
  const call = {
    on: (event: string, handler: CaptionHandler) => {
      if (event !== "call.closed_caption") return () => {};
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  } as unknown as Call;

  return {
    call,
    emit: (payload: Parameters<CaptionHandler>[0]) => {
      handlers.forEach((handler) => handler(payload));
    },
    handlerCount: () => handlers.size,
  };
}

describe("TranscriptionPanel", () => {
  it("shows an empty state before any captions arrive", () => {
    const { call } = createFakeCall();
    render(<TranscriptionPanel call={call} />);

    expect(screen.getByTestId("transcription-panel")).toBeInTheDocument();
    expect(screen.getByText(/Listening to the conversation/i)).toBeInTheDocument();
  });

  it("renders a finalized caption with its speaker", () => {
    const { call, emit } = createFakeCall();
    render(<TranscriptionPanel call={call} />);

    act(() => {
      emit({
        closed_caption: {
          id: "cap-1",
          text: "Tell me about your experience with React.",
          user: { id: "agent", name: "AI Interviewer" },
        },
      });
    });

    expect(
      screen.getByText(/Tell me about your experience with React/i)
    ).toBeInTheDocument();
    expect(screen.getByText("AI Interviewer")).toBeInTheDocument();
  });

  it("notifies the caller about each finalized turn", () => {
    const { call, emit } = createFakeCall();
    const onTranscript = vi.fn<(item: TranscriptItem) => void>();
    render(<TranscriptionPanel call={call} onTranscript={onTranscript} />);

    act(() => {
      emit({
        closed_caption: {
          id: "cap-2",
          text: "I built a design system.",
          speaker_id: "user_1",
        },
      });
    });

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cap-2",
        speaker: "user_1",
        text: "I built a design system.",
        isFinal: true,
      })
    );
  });

  it("shows a question together with the answer that follows it", () => {
    const { call, emit } = createFakeCall();
    render(<TranscriptionPanel call={call} />);

    act(() => {
      emit({
        closed_caption: {
          id: "q-1",
          text: "Tell me about your React experience.",
          start_time: "t1",
          user: { id: "ai-interviewer", name: "AI Interviewer" },
        },
      });
      emit({
        closed_caption: {
          id: "a-1",
          text: "I built several design systems.",
          start_time: "t2",
          speaker_id: "user_1",
        },
      });
    });

    const groups = screen.getAllByTestId("transcript-group");
    expect(groups).toHaveLength(1);
    expect(
      within(groups[0]).getByText("Tell me about your React experience.")
    ).toBeInTheDocument();
    expect(
      within(groups[0]).getByText("I built several design systems.")
    ).toBeInTheDocument();
  });

  it("does not repeat a question when Stream re-delivers the same utterance", () => {
    const { call, emit } = createFakeCall();
    const onTranscript = vi.fn<(item: TranscriptItem) => void>();
    render(<TranscriptionPanel call={call} onTranscript={onTranscript} />);

    act(() => {
      const payload = {
        closed_caption: {
          id: "q-1",
          text: "Tell me about React.",
          start_time: "t1",
          user: { id: "ai-interviewer", name: "AI Interviewer" },
        },
      };
      emit(payload);
      emit(payload);
    });

    expect(screen.getAllByText("Tell me about React.")).toHaveLength(1);
    expect(screen.getAllByTestId("transcript-group")).toHaveLength(1);
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest text when a caption is refined for the same utterance", () => {
    const { call, emit } = createFakeCall();
    render(<TranscriptionPanel call={call} />);

    act(() => {
      emit({
        closed_caption: {
          id: "q-1",
          text: "Tell me about",
          start_time: "t1",
          speaker_id: "user_1",
        },
      });
      emit({
        closed_caption: {
          id: "q-1",
          text: "Tell me about React.",
          start_time: "t1",
          speaker_id: "user_1",
        },
      });
    });

    expect(screen.getAllByText("Tell me about React.")).toHaveLength(1);
    expect(screen.queryByText("Tell me about")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("transcript-group")).toHaveLength(1);
  });

  it("creates a separate group for each question", () => {
    const { call, emit } = createFakeCall();
    render(<TranscriptionPanel call={call} />);

    act(() => {
      emit({
        closed_caption: {
          id: "q-1",
          text: "Question one?",
          start_time: "t1",
          user: { id: "ai-interviewer", name: "AI Interviewer" },
        },
      });
      emit({
        closed_caption: {
          id: "a-1",
          text: "Answer one.",
          start_time: "t2",
          speaker_id: "user_1",
        },
      });
      emit({
        closed_caption: {
          id: "q-2",
          text: "Question two?",
          start_time: "t3",
          user: { id: "ai-interviewer", name: "AI Interviewer" },
        },
      });
      emit({
        closed_caption: {
          id: "a-2",
          text: "Answer two.",
          start_time: "t4",
          speaker_id: "user_1",
        },
      });
    });

    const groups = screen.getAllByTestId("transcript-group");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText("Question one?")).toBeInTheDocument();
    expect(within(groups[0]).getByText("Answer one.")).toBeInTheDocument();
    expect(within(groups[1]).getByText("Question two?")).toBeInTheDocument();
    expect(within(groups[1]).getByText("Answer two.")).toBeInTheDocument();
  });

  it("ignores empty caption events", () => {
    const { call, emit } = createFakeCall();
    const onTranscript = vi.fn();
    render(<TranscriptionPanel call={call} onTranscript={onTranscript} />);

    act(() => {
      emit({ closed_caption: { id: "cap-3", text: "   " } });
      emit({});
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(screen.getByText(/Listening to the conversation/i)).toBeInTheDocument();
  });

  it("unsubscribes from the call on unmount", () => {
    const { call, handlerCount } = createFakeCall();
    const { unmount } = render(<TranscriptionPanel call={call} />);

    expect(handlerCount()).toBe(1);
    unmount();
    expect(handlerCount()).toBe(0);
  });
});
