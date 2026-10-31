/**
 * Error-monitoring options shared by the server and browser instrumentation
 * entry points.
 *
 * Telemetry is opt-in: with no DSN the app must stay silent (local dev, CI and
 * any deployment that has not configured a project). Session replay and
 * performance tracing stay off, and PII is not sent, so interview audio,
 * video and transcripts are never attached to an event.
 */
export interface ObservabilityOptions {
  dsn: string;
  environment: string;
  sendDefaultPii: false;
  tracesSampleRate: 0;
}

export function buildObservabilityOptions(
  dsn: string | undefined,
  environment: string
): ObservabilityOptions | null {
  const trimmed = dsn?.trim();
  if (!trimmed) return null;

  return {
    dsn: trimmed,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}
