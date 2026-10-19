// Interview timing helpers.
//
// The setup flow lets a candidate pick a fixed session length. The live room
// counts down from `startedAt + durationMinutes` and ends the interview when it
// reaches zero, so access is time-boxed rather than unlimited.

export const INTERVIEW_DURATIONS = [15, 30, 45, 60] as const;

export type InterviewDuration = (typeof INTERVIEW_DURATIONS)[number];

export const DEFAULT_INTERVIEW_DURATION: InterviewDuration = 30;

export function isInterviewDuration(value: number): value is InterviewDuration {
  return (INTERVIEW_DURATIONS as readonly number[]).includes(value);
}

/** Absolute time (ms since epoch) the interview should end. */
export function getInterviewDeadline(
  startedAt: number,
  durationMinutes: number
): number {
  return startedAt + durationMinutes * 60_000;
}

/** Formats remaining milliseconds as `M:SS` (or `MM:SS` past ten minutes). */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** True once two minutes or less remain (used for the "running out" state). */
export function isTimeRunningLow(remainingMs: number): boolean {
  return remainingMs <= 2 * 60_000;
}
