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

export interface JobTiming {
  queueWaitMs?: number;
  processingMs?: number;
  endToEndMs?: number;
}

/**
 * Latency of one BullMQ attempt, taken from the job's own timestamps.
 *
 * `endToEndMs` on a `failed` event covers that attempt only. A job with
 * retries left is not finished; treat `attemptsMade >= attempts` as terminal.
 */
export function jobTiming(job: {
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
}): JobTiming {
  const timing: JobTiming = {};
  if (job.timestamp !== undefined && job.processedOn !== undefined) {
    timing.queueWaitMs = Math.max(0, job.processedOn - job.timestamp);
  }
  if (job.processedOn !== undefined && job.finishedOn !== undefined) {
    timing.processingMs = Math.max(0, job.finishedOn - job.processedOn);
  }
  if (job.timestamp !== undefined && job.finishedOn !== undefined) {
    timing.endToEndMs = Math.max(0, job.finishedOn - job.timestamp);
  }
  return timing;
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
