import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DevicePreview } from "@/features/interview/lobby/device-preview";

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

function createStream({ audio = true, video = true } = {}): MediaStream {
  const tracks: FakeTrack[] = [];
  if (audio) tracks.push(createTrack("audio", "mic-1"));
  if (video) tracks.push(createTrack("video", "cam-1"));

  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  } as unknown as MediaStream;
}

function setMediaDevices(
  getUserMedia: (constraints: unknown) => Promise<MediaStream>,
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>
) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
  vi.restoreAllMocks();
});

describe("DevicePreview", () => {
  it("shows the camera and microphone controls once the stream is ready", async () => {
    setMediaDevices(async () => createStream());

    render(<DevicePreview />);

    expect(
      screen.getByText(/Checking your camera and microphone/i)
    ).toBeInTheDocument();

    const micButton = await screen.findByRole("button", {
      name: /Microphone on/i,
    });
    const cameraButton = screen.getByRole("button", { name: /Camera on/i });

    expect(micButton).toBeEnabled();
    expect(cameraButton).toBeEnabled();
  });

  it("shows a microphone level meter once audio is available", async () => {
    setMediaDevices(async () => createStream());

    render(<DevicePreview />);

    expect(
      await screen.findByLabelText(/Microphone level/i)
    ).toBeInTheDocument();
  });

  it("turns the camera off and disables the video track", async () => {
    const stream = createStream();
    setMediaDevices(async () => stream);
    const user = userEvent.setup();

    render(<DevicePreview />);

    await user.click(
      await screen.findByRole("button", { name: /Camera on/i })
    );

    expect(
      screen.getByRole("button", { name: /Camera off/i })
    ).toBeInTheDocument();
    expect((stream.getVideoTracks()[0] as unknown as FakeTrack).enabled).toBe(
      false
    );
    expect(screen.getByText("Camera is off")).toBeInTheDocument();
  });

  it("mutes the microphone and disables the audio track", async () => {
    const stream = createStream();
    setMediaDevices(async () => stream);
    const user = userEvent.setup();

    render(<DevicePreview />);

    await user.click(
      await screen.findByRole("button", { name: /Microphone on/i })
    );

    expect(
      screen.getByRole("button", { name: /Microphone off/i })
    ).toBeInTheDocument();
    expect((stream.getAudioTracks()[0] as unknown as FakeTrack).enabled).toBe(
      false
    );
  });

  it("surfaces a blocked-permission error and offers a retry", async () => {
    setMediaDevices(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });

    render(<DevicePreview />);

    expect(
      await screen.findByText(/Camera and microphone unavailable/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/access was blocked/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/i })
    ).toBeInTheDocument();
  });

  it("recovers when the candidate retries after an error", async () => {
    let calls = 0;
    const getUserMedia = vi.fn(async () => {
      calls += 1;
      // Fail every fallback attempt on the first run, then succeed on retry.
      if (calls <= 3) {
        throw new DOMException("denied", "NotAllowedError");
      }
      return createStream();
    });
    setMediaDevices(getUserMedia as unknown as () => Promise<MediaStream>);
    const user = userEvent.setup();

    render(<DevicePreview />);

    await user.click(await screen.findByRole("button", { name: /Try again/i }));

    expect(
      await screen.findByRole("button", { name: /Camera on/i })
    ).toBeEnabled();
  });

  it("falls back to video only when no microphone is available", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("no mic", "NotFoundError"))
      .mockResolvedValueOnce(createStream({ audio: false, video: true }));
    setMediaDevices(getUserMedia as unknown as () => Promise<MediaStream>);

    render(<DevicePreview />);

    expect(
      await screen.findByRole("button", { name: /Microphone off/i })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Camera on/i })).toBeEnabled();
  });

  it("falls back to audio only when no camera is available", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("no cam", "NotFoundError"))
      .mockRejectedValueOnce(new DOMException("no cam", "NotFoundError"))
      .mockResolvedValueOnce(createStream({ audio: true, video: false }));
    setMediaDevices(getUserMedia as unknown as () => Promise<MediaStream>);

    render(<DevicePreview />);

    expect(
      await screen.findByRole("button", { name: /Camera off/i })
    ).toBeDisabled();
    expect(screen.getByText(/No camera detected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Microphone on/i })).toBeEnabled();
  });

  it("reports readiness to the parent when the stream becomes ready", async () => {
    setMediaDevices(async () => createStream());
    const onReadyChange = vi.fn();

    render(<DevicePreview onReadyChange={onReadyChange} />);

    await waitFor(() => expect(onReadyChange).toHaveBeenCalledWith(true));
  });

  it("lists detected devices once permission is granted", async () => {
    const devices = [
      { kind: "videoinput", deviceId: "cam-1", label: "Front Camera" },
      { kind: "audioinput", deviceId: "mic-1", label: "Desk Mic" },
    ] as unknown as MediaDeviceInfo[];
    setMediaDevices(
      async () => createStream(),
      async () => devices
    );

    render(<DevicePreview />);

    expect(await screen.findByLabelText("Camera")).toBeInTheDocument();
    expect(screen.getByLabelText("Microphone")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Front Camera" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Desk Mic" })).toBeInTheDocument();
  });
});
