import * as Sentry from "@sentry/nextjs";
import { buildObservabilityOptions } from "@/lib/sentry-options";

/**
 * Browser instrumentation (G-02). Same opt-in rule as the server entry point:
 * no DSN means Sentry is never initialised.
 */
const options = buildObservabilityOptions(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown"
);

if (options) {
  Sentry.init(options);
}
