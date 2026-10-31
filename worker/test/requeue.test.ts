import { describe, it, expect } from "bun:test";
import { parseRequeueArgs } from "../src/requeue";

describe("requeue CLI arguments", () => {
  it("defaults to the resume queue with a bounded scan", () => {
    expect(parseRequeueArgs([])).toEqual({
      queueName: "resume-processing",
      limit: 100,
    });
  });

  it("targets a single job on the report queue", () => {
    expect(
      parseRequeueArgs(["--queue", "report", "--job", "report-abc-v2", "--limit", "5"])
    ).toEqual({
      queueName: "report-evaluation",
      jobId: "report-abc-v2",
      limit: 5,
    });
  });

  it("rejects an unknown queue", () => {
    expect(() => parseRequeueArgs(["--queue", "other"])).toThrow(
      "--queue must be 'resume' or 'report'"
    );
  });

  it("rejects a non-positive limit", () => {
    expect(() => parseRequeueArgs(["--limit", "0"])).toThrow(
      "--limit must be a positive integer"
    );
  });

  it("rejects unknown flags instead of silently ignoring them", () => {
    expect(() => parseRequeueArgs(["--all"])).toThrow("Unknown argument: --all");
  });
});
