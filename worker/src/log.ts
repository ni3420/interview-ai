/**
 * Structured worker logs.
 *
 * `stage` and `durationMs` are stable field names: rule F9 / gate Q9 greps for
 * them, so keep them when adding new measurements.
 */

export type LogLevel = "info" | "error";

export function logEvent(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

/** Time a job spent waiting in the queue before a worker picked it up. */
export function queueWaitMs(job: {
  timestamp?: number;
  processedOn?: number;
}): number | undefined {
  if (!job.processedOn || job.timestamp === undefined) return undefined;
  return Math.max(0, job.processedOn - job.timestamp);
}

export function logStage(
  stage: string,
  startedAt: number,
  fields: Record<string, unknown> = {}
): void {
  logEvent("info", "stage timing", {
    stage,
    durationMs: Math.round(performance.now() - startedAt),
    ...fields,
  });
}
