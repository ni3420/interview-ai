import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logAgentAudibleOnce,
  markCandidateTurnEnd,
  markInterviewerTurnStart,
  startJoinTiming,
} from "@/features/interview/room/room-timing";

interface RoomTimingEvent {
  stage: string;
  durationMs: number;
  turnLatencyMs?: number;
  arrivalMs?: number;
}

describe("room timing", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    startJoinTiming();
  });

  afterEach(() => {
    info.mockRestore();
  });

  function events(): RoomTimingEvent[] {
    return info.mock.calls.map(
      ([line]) => JSON.parse(String(line)) as RoomTimingEvent
    );
  }

  it("logs the agent-audible join timing once per join", () => {
    logAgentAudibleOnce();
    logAgentAudibleOnce();

    const logged = events();
    expect(logged).toHaveLength(1);
    expect(logged[0].stage).toBe("agent.audible");
  });

  it("measures the turn from candidate speech end to interviewer start", () => {
    markCandidateTurnEnd(10_000);
    const latency = markInterviewerTurnStart(11_200);

    expect(latency).toBe(1_200);
    expect(events()).toEqual([
      expect.objectContaining({
        stage: "turn.response",
        durationMs: 1_200,
        turnLatencyMs: 1_200,
      }),
    ]);
  });

  it("measures from the latest candidate utterance in a run", () => {
    markCandidateTurnEnd(10_000);
    markCandidateTurnEnd(12_000);
    markInterviewerTurnStart(13_000);

    expect(events()[0].turnLatencyMs).toBe(1_000);
  });

  it("ignores an interviewer turn with no preceding candidate turn", () => {
    expect(markInterviewerTurnStart(5_000)).toBeNull();
    expect(events()).toHaveLength(0);
  });

  it("measures each reply once", () => {
    markCandidateTurnEnd(10_000);
    markInterviewerTurnStart(11_000);
    markInterviewerTurnStart(12_000);

    expect(events()).toHaveLength(1);
  });

  it("falls back to arrival time when media timestamps are unusable", () => {
    markCandidateTurnEnd(10_000);
    // Interviewer start before the candidate end means the media delta is
    // negative, so the arrival-time delta is used instead.
    markInterviewerTurnStart(9_000);

    const [event] = events();
    expect(event.turnLatencyMs).toBeGreaterThanOrEqual(0);
    expect(event.turnLatencyMs).toBe(event.arrivalMs);
  });

  it("drops a pending turn on a new join attempt", () => {
    markCandidateTurnEnd(10_000);
    startJoinTiming();

    expect(markInterviewerTurnStart(11_000)).toBeNull();
  });
});
