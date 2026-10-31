import { describe, expect, it } from "bun:test";
import { jobTiming, queueWaitMs } from "../src/log";

describe("jobTiming", () => {
  it("derives queue wait, processing and end-to-end time", () => {
    expect(
      jobTiming({ timestamp: 1_000, processedOn: 1_500, finishedOn: 4_000 })
    ).toEqual({
      queueWaitMs: 500,
      processingMs: 2_500,
      endToEndMs: 3_000,
    });
  });

  it("reports only the fields that can be computed", () => {
    expect(jobTiming({ timestamp: 1_000 })).toEqual({});
    expect(jobTiming({ timestamp: 1_000, processedOn: 1_200 })).toEqual({
      queueWaitMs: 200,
    });
    expect(jobTiming({ processedOn: 1_200, finishedOn: 1_900 })).toEqual({
      processingMs: 700,
    });
  });

  it("never reports a negative duration", () => {
    expect(
      jobTiming({ timestamp: 2_000, processedOn: 1_500, finishedOn: 1_000 })
    ).toEqual({ queueWaitMs: 0, processingMs: 0, endToEndMs: 0 });
  });

  it("matches the existing queue-wait helper used by the processors", () => {
    const job = { timestamp: 10, processedOn: 40 };
    expect(jobTiming(job).queueWaitMs).toBe(queueWaitMs(job));
    expect(queueWaitMs({ timestamp: 10 })).toBeUndefined();
  });
});
