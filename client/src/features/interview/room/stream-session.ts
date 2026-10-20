// Client-side Stream session contract.
//
// The browser never sees the Stream API secret: it asks the same-origin route
// `/api/stream/token` for a short-lived user token. Ownership of the interview
// is enforced server-side before any token is issued.

export interface StreamSessionUser {
  id: string;
  name: string;
  image?: string;
}

export interface StreamSession {
  apiKey: string;
  token: string;
  callType: string;
  callId: string;
  user: StreamSessionUser;
}

/** Thrown when the server has no Stream credentials configured. */
export class StreamNotConfiguredError extends Error {
  constructor() {
    super("The live interview room is not configured.");
    this.name = "StreamNotConfiguredError";
  }
}

function isStreamSession(value: Partial<StreamSession>): value is StreamSession {
  return Boolean(
    value.apiKey &&
      value.token &&
      value.callType &&
      value.callId &&
      value.user?.id
  );
}

/**
 * Requests a Stream token for an interview the caller owns.
 *
 * Distinguishes "not configured" (a deployment state the UI explains) from a
 * generic failure so callers can render the right message.
 */
export async function fetchStreamSession(
  interviewId: string
): Promise<StreamSession> {
  const response = await fetch("/api/stream/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interviewId }),
  });

  if (response.status === 503) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (data.error === "stream_not_configured") {
      throw new StreamNotConfiguredError();
    }
  }

  if (!response.ok) {
    throw new Error("Could not start the interview room.");
  }

  const data = (await response.json()) as Partial<StreamSession>;
  if (!isStreamSession(data)) {
    throw new Error("The interview room session was malformed.");
  }

  return data;
}

/**
 * Asks the server to place the AI interviewer in the interview's call.
 *
 * Only the interview id is sent; the server verifies ownership and reads the
 * grounded context from Convex. Safe to call more than once (the agent is
 * deduplicated per call).
 */
export async function dispatchInterviewerAgent(
  interviewId: string
): Promise<void> {
  const response = await fetch("/api/stream/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interviewId }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    // The AI service returns FastAPI's `detail` (e.g. a missing provider
    // credential); the Next.js route returns `error` for its own failures.
    const reason =
      typeof data.error === "string"
        ? data.error
        : typeof data.detail === "string"
          ? data.detail
          : `Agent dispatch failed (${response.status})`;
    throw new Error(reason);
  }
}
