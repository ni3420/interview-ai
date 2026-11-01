// Closed-caption start ordering.
//
// Started straight after `call.join()` (an empty room) captions once produced
// `call.closed_captions_started` with no `call.closed_caption` events for the
// rest of the call (live call on 2026-11-01); a stop/start with both
// participants present delivered content within seconds. The interviewer takes
// ~20s to appear after the candidate joins, so captions start after a bounded
// wait and are restarted once the interviewer actually joins. The wait doubles
// as the caption-start latency metric.

import type {
  StartClosedCaptionsRequest,
  StopClosedCaptionsRequest,
} from "@stream-io/video-client";

/** How long to wait for the interviewer before starting captions anyway. */
export const CAPTION_PARTICIPANT_TIMEOUT_MS = 15_000;

export interface CaptionCall {
  state: { remoteParticipants: ReadonlyArray<unknown> };
  on: (
    event: "call.session_participant_joined",
    handler: () => void
  ) => () => void;
  startClosedCaptions: (
    options?: StartClosedCaptionsRequest
  ) => Promise<unknown>;
  stopClosedCaptions: (
    options?: StopClosedCaptionsRequest
  ) => Promise<unknown>;
}

export interface CaptionSession {
  /** Time spent waiting before captions were first started. */
  waitedForParticipantMs: number;
  /** True when another participant was in the call before captions started. */
  startedAfterParticipant: boolean;
  /**
   * Resolves true once captions were restarted because the interviewer joined
   * late, or false when no restart was needed or it failed.
   */
  restarted: Promise<boolean>;
  /** Stops watching for a late interviewer join. */
  dispose: () => void;
}

function hasRemoteParticipant(call: CaptionCall): boolean {
  return call.state.remoteParticipants.length > 0;
}

/** Resolves true when a remote participant is present, false on timeout. */
export function waitForRemoteParticipant(
  call: CaptionCall,
  timeoutMs: number = CAPTION_PARTICIPANT_TIMEOUT_MS
): Promise<boolean> {
  if (hasRemoteParticipant(call)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};

    const finish = (joined: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(joined);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    unsubscribe = call.on("call.session_participant_joined", () => {
      if (hasRemoteParticipant(call)) finish(true);
    });
  });
}

async function restartCaptions(
  call: CaptionCall,
  language: "en"
): Promise<boolean> {
  try {
    await call.stopClosedCaptions();
    await call.startClosedCaptions({ language });
    return true;
  } catch (error) {
    console.warn("Closed caption restart failed", error);
    return false;
  }
}

/**
 * Starts English closed captions once the interviewer is in the call.
 *
 * Falls back to starting them after the timeout so a failed agent dispatch
 * cannot suppress the transcript entirely, and restarts them when the
 * interviewer joins after that fallback.
 */
export async function startCaptionsWhenPresent(
  call: CaptionCall,
  options: { language?: "en"; timeoutMs?: number } = {}
): Promise<CaptionSession> {
  const language = options.language ?? "en";
  const waitingStartedAt = performance.now();
  const startedAfterParticipant = await waitForRemoteParticipant(
    call,
    options.timeoutMs ?? CAPTION_PARTICIPANT_TIMEOUT_MS
  );
  const waitedForParticipantMs = performance.now() - waitingStartedAt;

  await call.startClosedCaptions({ language });

  if (startedAfterParticipant) {
    return {
      waitedForParticipantMs,
      startedAfterParticipant,
      restarted: Promise.resolve(false),
      dispose: () => {},
    };
  }

  let resolveRestarted: (restarted: boolean) => void = () => {};
  const restarted = new Promise<boolean>((resolve) => {
    resolveRestarted = resolve;
  });
  const unsubscribe = call.on("call.session_participant_joined", () => {
    if (!hasRemoteParticipant(call)) return;
    unsubscribe();
    void restartCaptions(call, language).then(resolveRestarted);
  });

  return {
    waitedForParticipantMs,
    startedAfterParticipant,
    restarted,
    dispose: unsubscribe,
  };
}
