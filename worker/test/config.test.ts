import { describe, it, expect } from "bun:test";
import { workerConfigProblems } from "../src/config";

const valid = {
  AI_SERVICE_API_KEY: "test-ai-key",
  WORKER_SERVICE_KEY: "test-worker-key",
  CONVEX_SITE_URL: "https://example.convex.site",
};

describe("workerConfigProblems", () => {
  it("accepts a complete configuration", () => {
    expect(workerConfigProblems(valid)).toEqual([]);
  });

  it("accepts a site URL with a path and trailing slash", () => {
    expect(
      workerConfigProblems({
        ...valid,
        CONVEX_SITE_URL: "http://127.0.0.1:3211/",
      })
    ).toEqual([]);
  });

  it("names every missing required variable", () => {
    expect(workerConfigProblems({})).toEqual([
      "AI_SERVICE_API_KEY is required",
      "WORKER_SERVICE_KEY is required",
      "CONVEX_SITE_URL is required",
    ]);
  });

  it("treats a blank value as missing", () => {
    expect(
      workerConfigProblems({ ...valid, WORKER_SERVICE_KEY: "   " })
    ).toEqual(["WORKER_SERVICE_KEY is required"]);
  });

  it("rejects a site URL without a scheme", () => {
    expect(
      workerConfigProblems({ ...valid, CONVEX_SITE_URL: "host.docker.internal:3211" })
    ).toEqual(["CONVEX_SITE_URL must be an http(s) URL"]);
  });

  it("rejects a non-http site URL", () => {
    expect(
      workerConfigProblems({ ...valid, CONVEX_SITE_URL: "ftp://example.com" })
    ).toEqual(["CONVEX_SITE_URL must be an http(s) URL"]);
  });

  it("rejects numeric settings that would otherwise fall back silently", () => {
    expect(
      workerConfigProblems({
        ...valid,
        WORKER_CONCURRENCY: "two",
        REPORT_WORKER_CONCURRENCY: "0",
        REPORT_AI_REQUEST_TIMEOUT_MS: "1.5",
      })
    ).toEqual([
      "REPORT_AI_REQUEST_TIMEOUT_MS must be a positive integer",
      "WORKER_CONCURRENCY must be a positive integer",
      "REPORT_WORKER_CONCURRENCY must be a positive integer",
    ]);
  });

  it("leaves unset numeric settings at their defaults", () => {
    expect(workerConfigProblems(valid)).toEqual([]);
  });
});
