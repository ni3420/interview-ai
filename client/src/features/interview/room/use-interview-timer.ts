"use client";

import { useEffect, useRef, useState } from "react";

interface UseInterviewTimerOptions {
  /** When the interview started, or null to start counting on mount. */
  startedAt: number | null;
  /** Selected session length in minutes. */
  durationMinutes: number;
  /** Called exactly once when the countdown reaches zero. */
  onExpire: () => void;
}

/**
 * Counts down the remaining interview time and fires `onExpire` once at zero.
 *
 * Timing starts from `startedAt` (persisted when the interview went
 * in_progress) so reloading the room cannot extend a session. Returns the
 * remaining milliseconds, or null before the first tick.
 */
export function useInterviewTimer({
  startedAt,
  durationMinutes,
  onExpire,
}: UseInterviewTimerOptions): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const start = startedAt ?? Date.now();
    const deadline = start + durationMinutes * 60_000;

    const tick = () => {
      const remaining = deadline - Date.now();
      setRemainingMs(Math.max(remaining, 0));
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [startedAt, durationMinutes]);

  return remainingMs;
}
