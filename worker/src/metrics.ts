/**
 * In-process queue counters.
 *
 * These are process-lifetime counters, not durable metrics: they exist so a
 * heartbeat log line shows whether a worker is draining work or quietly
 * failing. A restart resets them to zero.
 */

export type QueueKey = "resume" | "report";

export interface QueueCounters {
  active: number;
  completed: number;
  failed: number;
  stalled: number;
  lastCompletedAt?: number;
  lastFailedAt?: number;
}

const counters: Record<QueueKey, QueueCounters> = {
  resume: { active: 0, completed: 0, failed: 0, stalled: 0 },
  report: { active: 0, completed: 0, failed: 0, stalled: 0 },
};

function counter(queue: QueueKey): QueueCounters {
  return counters[queue];
}

export function recordActive(queue: QueueKey): void {
  counter(queue).active += 1;
}

export function recordCompleted(queue: QueueKey, at = Date.now()): void {
  const current = counter(queue);
  current.active = Math.max(0, current.active - 1);
  current.completed += 1;
  current.lastCompletedAt = at;
}

export function recordFailed(queue: QueueKey, at = Date.now()): void {
  const current = counter(queue);
  current.active = Math.max(0, current.active - 1);
  current.failed += 1;
  current.lastFailedAt = at;
}

export function recordStalled(queue: QueueKey): void {
  counter(queue).stalled += 1;
}

export function snapshot(): Record<QueueKey, QueueCounters> {
  return {
    resume: { ...counters.resume },
    report: { ...counters.report },
  };
}
