import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterviewLobby } from "@/features/interview/lobby/interview-lobby";

interface FakeTrack {
  kind: string;
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => MediaTrackSettings;
}

function createTrack(kind: string, deviceId: string): FakeTrack {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
  };
}

function createStream() {
  const tracks = [createTrack("audio", "mic-1"), createTrack("video", "cam-1")];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  } as unknown as MediaStream;
}

function mockResponse({
  ok = true,
  status = 200,
  body = {},
}: { ok?: boolean; status?: number; body?: unknown } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function setMediaDevices() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => createStream(),
      enumerateDevices: async () => [],
    },
  });
}

beforeEach(() => {
  setMediaDevices();
});

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InterviewLobby", () => {
  it("always shows the device check, even when the room is configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse()));

    render(
      <InterviewLobby
        interviewId="interview-1"
        jobDescription="A long enough job description for the target role."
        isReady
        onStart={vi.fn()}
        isStarting={false}
      />
    );

    expect(screen.getByTestId("device-preview")).toBeInTheDocument();
  });

  it("gates the start button until the device check passes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse()));
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(
      <InterviewLobby
        interviewId="interview-1"
        jobDescription="A long enough job description for the target role."
        isReady
        onStart={onStart}
        isStarting={false}
      />
    );

    const startButton = screen.getByRole("button", { name: /Start Interview/i });
    expect(startButton).toBeDisabled();

    await waitFor(() => expect(startButton).toBeEnabled());

    await user.click(startButton);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("keeps start disabled until the interview is ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse()));

    render(
      <InterviewLobby
        interviewId="interview-1"
        jobDescription="A long enough job description for the target role."
        isReady={false}
        onStart={vi.fn()}
        isStarting={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("device-preview")).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: /Start Interview/i })
    ).toBeDisabled();
  });

  it("explains when the live room is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ ok: false, status: 503, body: { error: "stream_not_configured" } })
        )
    );

    render(
      <InterviewLobby
        interviewId="interview-1"
        jobDescription="A long enough job description for the target role."
        isReady
        onStart={vi.fn()}
        isStarting={false}
      />
    );

    expect(
      await screen.findByText(/live interview room is not configured/i)
    ).toBeInTheDocument();
  });
});
