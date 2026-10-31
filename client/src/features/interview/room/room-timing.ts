"use client";

// Join-stage timings for the F9 dispatch and audible budgets. A browser tab has
// one interview room at a time, so module state is enough; startJoinTiming
// resets it on every connect attempt.

let joinStartedAt: number | null = null;
let audibleLogged = false;
let pendingCandidateTurn: {
  endedAtMs: number;
  observedAt: number;
} | null = null;

export function startJoinTiming(): void {
  joinStartedAt = performance.now();
  audibleLogged = false;
  pendingCandidateTurn = null;
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

/**
 * Marks the end of the candidate's latest utterance (Stream `end_time`).
 *
 * Called for every new candidate caption so a run of consecutive utterances
 * measures from the last one. Re-deliveries of an existing utterance do not
 * count.
 */
export function markCandidateTurnEnd(endedAtMs: number): void {
  pendingCandidateTurn = {
    endedAtMs,
    observedAt: performance.now(),
  };
}

/**
 * Logs the candidate-speech-end → interviewer-speech-start latency once.
 *
 * Media timestamps are preferred because caption delivery can batch; arrival
 * time is a fallback when the delta is unusable. The value includes the
 * interviewer ASR completing, so it is an upper bound on the agent's response
 * time, not just model latency.
 */
export function markInterviewerTurnStart(startedAtMs: number): number | null {
  const pending = pendingCandidateTurn;
  if (!pending) return null;
  pendingCandidateTurn = null;

  const mediaMs = startedAtMs - pending.endedAtMs;
  const arrivalMs = performance.now() - pending.observedAt;
  const turnLatencyMs = mediaMs >= 0 && mediaMs <= 60_000 ? mediaMs : arrivalMs;

  logRoomTiming("turn.response", turnLatencyMs, {
    turnLatencyMs: Math.round(turnLatencyMs),
    arrivalMs: Math.round(arrivalMs),
  });
  return turnLatencyMs;
}
