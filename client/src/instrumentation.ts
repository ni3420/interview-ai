import * as Sentry from "@sentry/nextjs";
import { buildObservabilityOptions } from "@/lib/sentry-options";

/**
 * Next.js server/edge instrumentation hook (G-02).
 *
 * Registers the Sentry-compatible client only when a DSN is configured, so
 * environments without monitoring never make outbound telemetry calls.
 */
export async function register(): Promise<void> {
  const options = buildObservabilityOptions(
    process.env.NEXT_PUBLIC_SENTRY_DSN,
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown"
  );
  if (!options) return;

  Sentry.init(options);
}

/** Reports unhandled errors thrown while rendering or handling a request. */
export const onRequestError = Sentry.captureRequestError;
