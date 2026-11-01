import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTION_PARTICIPANT_TIMEOUT_MS,
  startCaptionsWhenPresent,
  waitForRemoteParticipant,
  type CaptionCall,
} from "@/features/interview/room/room-captions";

interface FakeCall extends CaptionCall {
  join(): void;
  emit(): void;
  startClosedCaptions: ReturnType<typeof vi.fn>;
  stopClosedCaptions: ReturnType<typeof vi.fn>;
  unsubscribed: number;
}

function fakeCall(remoteParticipants: unknown[] = []): FakeCall {
  const handlers: Array<() => void> = [];
  const participants = remoteParticipants;
  const call: FakeCall = {
    state: { remoteParticipants: participants },
    unsubscribed: 0,
    startClosedCaptions: vi.fn(async () => {}),
    stopClosedCaptions: vi.fn(async () => {}),
    on: (_event, handler) => {
      handlers.push(handler);
      return () => {
        call.unsubscribed += 1;
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    },
    join: () => {
      // State is updated before Stream emits the join event.
      participants.push({ userId: "ai-interviewer" });
      handlers.slice().forEach((handler) => handler());
    },
    emit: () => {
      handlers.slice().forEach((handler) => handler());
    },
  };
  return call;
}

describe("waitForRemoteParticipant", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when a participant is already present", async () => {
    const call = fakeCall([{ userId: "ai-interviewer" }]);

    await expect(waitForRemoteParticipant(call, 1_000)).resolves.toBe(true);
    expect(call.unsubscribed).toBe(0);
  });

  it("resolves when another participant joins", async () => {
    const call = fakeCall();
    const pending = waitForRemoteParticipant(call, 1_000);

    call.join();

    await expect(pending).resolves.toBe(true);
  });

  it("resolves false and unsubscribes on timeout", async () => {
    const call = fakeCall();
    const pending = waitForRemoteParticipant(call, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBe(false);
    expect(call.unsubscribed).toBe(1);
  });

  it("ignores a join event for a participant it cannot see", async () => {
    const call = fakeCall();
    const pending = waitForRemoteParticipant(call, 1_000);

    call.emit();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBe(false);
  });
});

describe("startCaptionsWhenPresent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts captions only after the interviewer joins", async () => {
    const call = fakeCall();
    const pending = startCaptionsWhenPresent(call);

    expect(call.startClosedCaptions).not.toHaveBeenCalled();

    call.join();
    const session = await pending;

    expect(call.startClosedCaptions).toHaveBeenCalledWith({ language: "en" });
    expect(session.startedAfterParticipant).toBe(true);
    await expect(session.restarted).resolves.toBe(false);
  });

  it("starts captions anyway when nobody joins in time", async () => {
    const call = fakeCall();
    const pending = startCaptionsWhenPresent(call);

    await vi.advanceTimersByTimeAsync(CAPTION_PARTICIPANT_TIMEOUT_MS);
    const session = await pending;

    expect(call.startClosedCaptions).toHaveBeenCalledTimes(1);
    expect(session.startedAfterParticipant).toBe(false);
    expect(session.waitedForParticipantMs).toBeGreaterThanOrEqual(0);
  });

  it("restarts captions when the interviewer joins after the fallback", async () => {
    const call = fakeCall();
    const session = await (async () => {
      const pending = startCaptionsWhenPresent(call);
      await vi.advanceTimersByTimeAsync(CAPTION_PARTICIPANT_TIMEOUT_MS);
      return pending;
    })();

    call.join();
    await vi.advanceTimersByTimeAsync(0);

    await expect(session.restarted).resolves.toBe(true);
    expect(call.stopClosedCaptions).toHaveBeenCalledTimes(1);
    expect(call.startClosedCaptions).toHaveBeenCalledTimes(2);
  });

  it("restarts captions only once", async () => {
    const call = fakeCall();
    const pending = startCaptionsWhenPresent(call);
    await vi.advanceTimersByTimeAsync(CAPTION_PARTICIPANT_TIMEOUT_MS);
    const session = await pending;

    call.join();
    call.join();
    await vi.advanceTimersByTimeAsync(0);

    await expect(session.restarted).resolves.toBe(true);
    expect(call.startClosedCaptions).toHaveBeenCalledTimes(2);
  });

  it("reports a failed restart without throwing", async () => {
    const call = fakeCall();
    const pending = startCaptionsWhenPresent(call);
    await vi.advanceTimersByTimeAsync(CAPTION_PARTICIPANT_TIMEOUT_MS);
    const session = await pending;
    call.stopClosedCaptions.mockRejectedValueOnce(new Error("unavailable"));

    call.join();
    await vi.advanceTimersByTimeAsync(0);

    await expect(session.restarted).resolves.toBe(false);
  });

  it("stops watching for a late join after dispose", async () => {
    const call = fakeCall();
    const pending = startCaptionsWhenPresent(call);
    await vi.advanceTimersByTimeAsync(CAPTION_PARTICIPANT_TIMEOUT_MS);
    const session = await pending;

    session.dispose();
    call.join();
    await vi.advanceTimersByTimeAsync(0);

    expect(call.stopClosedCaptions).not.toHaveBeenCalled();
    expect(call.startClosedCaptions).toHaveBeenCalledTimes(1);
  });

  it("propagates a caption failure to the caller", async () => {
    const call = fakeCall([{ userId: "ai-interviewer" }]);
    call.startClosedCaptions.mockRejectedValueOnce(new Error("unavailable"));

    await expect(startCaptionsWhenPresent(call)).rejects.toThrow("unavailable");
  });
});
