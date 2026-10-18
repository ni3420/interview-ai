import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

  it("renders repeated caption ids without duplicate React keys", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { call, emit } = createFakeCall();
    render(<TranscriptionPanel call={call} />);

    act(() => {
      emit({ closed_caption: { id: "dup-id", text: "First part." } });
      emit({ closed_caption: { id: "dup-id", text: "Second part." } });
    });

    expect(screen.getByText("First part.")).toBeInTheDocument();
    expect(screen.getByText("Second part.")).toBeInTheDocument();

    const loggedKeyWarning = errorSpy.mock.calls.some((args) =>
      args.some(
        (arg) => typeof arg === "string" && arg.includes("same key")
      )
    );
    expect(loggedKeyWarning).toBe(false);
    errorSpy.mockRestore();
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
