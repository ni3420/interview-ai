import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  formatCountdown,
  getInterviewDeadline,
  isInterviewDuration,
  isTimeRunningLow,
  DEFAULT_INTERVIEW_DURATION,
} from "@/lib/interview-timer";
import { useInterviewTimer } from "@/features/interview/room/use-interview-timer";

describe("interview timer helpers", () => {
  it("computes the deadline from the start time", () => {
    expect(getInterviewDeadline(1_000, 15)).toBe(1_000 + 15 * 60_000);
  });

  it("formats remaining time as M:SS", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(15 * 60_000)).toBe("15:00");
    expect(formatCountdown(-500)).toBe("0:00");
  });

  it("flags the last two minutes as running low", () => {
    expect(isTimeRunningLow(90_000)).toBe(true);
    expect(isTimeRunningLow(5 * 60_000)).toBe(false);
  });

  it("validates allowed durations", () => {
    expect(isInterviewDuration(15)).toBe(true);
    expect(isInterviewDuration(30)).toBe(true);
    expect(isInterviewDuration(12)).toBe(false);
    expect(DEFAULT_INTERVIEW_DURATION).toBe(30);
  });
});

describe("useInterviewTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down from the persisted start time and fires onExpire once", () => {
    const onExpire = vi.fn();
    const startedAt = Date.now();
    const { result } = renderHook(() =>
      useInterviewTimer({ startedAt, durationMinutes: 15, onExpire })
    );

    expect(result.current).toBe(15 * 60_000);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(14 * 60_000);

    act(() => {
      vi.advanceTimersByTime(14 * 60_000);
    });
    expect(result.current).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not extend when mounting partway through the session", () => {
    const onExpire = vi.fn();
    const startedAt = Date.now() - 10 * 60_000;
    const { result } = renderHook(() =>
      useInterviewTimer({ startedAt, durationMinutes: 15, onExpire })
    );

    expect(result.current).toBe(5 * 60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
