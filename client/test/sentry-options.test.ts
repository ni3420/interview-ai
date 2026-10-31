import { describe, expect, it } from "vitest";
import { buildObservabilityOptions } from "@/lib/sentry-options";

describe("buildObservabilityOptions", () => {
  it("stays disabled without a DSN", () => {
    expect(buildObservabilityOptions(undefined, "production")).toBeNull();
    expect(buildObservabilityOptions("", "production")).toBeNull();
    expect(buildObservabilityOptions("   ", "production")).toBeNull();
  });

  it("trims the DSN and keeps the requested environment", () => {
    const options = buildObservabilityOptions(
      "  https://key@example.ingest.sentry.io/1  ",
      "staging"
    );

    expect(options).toEqual({
      dsn: "https://key@example.ingest.sentry.io/1",
      environment: "staging",
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it("never enables PII, replay or tracing", () => {
    const options = buildObservabilityOptions(
      "https://key@example.ingest.sentry.io/1",
      "production"
    );

    expect(options?.sendDefaultPii).toBe(false);
    expect(options?.tracesSampleRate).toBe(0);
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
  });
});
