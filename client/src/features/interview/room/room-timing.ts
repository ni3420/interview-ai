"use client";

// Join-stage timings for the F9 dispatch and audible budgets. A browser tab has
// one interview room at a time, so module state is enough; startJoinTiming
// resets it on every connect attempt.

let joinStartedAt: number | null = null;
let audibleLogged = false;

export function startJoinTiming(): void {
  joinStartedAt = performance.now();
  audibleLogged = false;
}

export function logRoomTiming(
  stage: string,
  durationMs: number,
  fields: Record<string, unknown> = {}
): void {
  console.info(
    JSON.stringify({
      level: "info",
      message: "room timing",
      stage,
      durationMs: Math.round(durationMs),
      ...fields,
    })
  );
}

export function joinElapsedMs(): number | null {
  return joinStartedAt === null ? null : performance.now() - joinStartedAt;
}

/** Logs once, when the interviewer's first caption proves the agent is audible. */
export function logAgentAudibleOnce(): void {
  if (audibleLogged) return;
  const elapsed = joinElapsedMs();
  if (elapsed === null) return;
  audibleLogged = true;
  logRoomTiming("agent.audible", elapsed, {
    agentAudibleMs: Math.round(elapsed),
  });
}
