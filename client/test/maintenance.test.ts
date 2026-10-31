import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCtx } from "./helpers";

import * as Maintenance from "../../convex/maintenance";

const unwrap = <R,>(ref: unknown) =>
  (ref as unknown as { _handler: (ctx: unknown, args?: unknown) => R })
    ._handler;

const sweep = unwrap<
  Promise<{ failedReports: number; failedResumes: number }>
>(Maintenance.sweepStaleJobs);

describe("Convex - stale job sweep", () => {
  let mockCtx: ReturnType<typeof createMockCtx>;
  const now = Date.now();

  beforeEach(() => {
    mockCtx = createMockCtx();
    vi.clearAllMocks();
    mockCtx.db.patch.mockResolvedValue(undefined);
  });

  it("fails report jobs that outlived their window", async () => {
    mockCtx.db.collect
      .mockResolvedValueOnce([
        {
          _id: "job-queued-stale",
          status: "queued",
          updatedAt: now - 16 * 60 * 1000,
        },
        {
          _id: "job-queued-fresh",
          status: "queued",
          updatedAt: now - 60 * 1000,
        },
      ])
      .mockResolvedValueOnce([
        {
          _id: "job-processing-stale",
          status: "processing",
          updatedAt: now - 46 * 60 * 1000,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await sweep(mockCtx);

    expect(result).toEqual({ failedReports: 2, failedResumes: 0 });
    expect(mockCtx.db.patch).toHaveBeenCalledWith(
      "job-queued-stale",
      expect.objectContaining({
        status: "failed",
        errorCode: "job_timeout",
      })
    );
    expect(mockCtx.db.patch).toHaveBeenCalledWith(
      "job-processing-stale",
      expect.objectContaining({ status: "failed" })
    );
    expect(mockCtx.db.patch).not.toHaveBeenCalledWith(
      "job-queued-fresh",
      expect.anything()
    );
  });

  it("fails a resume stuck in processing", async () => {
    mockCtx.db.collect
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: "resume-stale",
          status: "processing",
          updatedAt: now - 61 * 60 * 1000,
        },
      ]);

    const result = await sweep(mockCtx);

    expect(result).toEqual({ failedReports: 0, failedResumes: 1 });
    expect(mockCtx.db.patch).toHaveBeenCalledWith(
      "resume-stale",
      expect.objectContaining({ status: "failed" })
    );
  });

  it("leaves fresh work untouched", async () => {
    mockCtx.db.collect
      .mockResolvedValueOnce([
        { _id: "job-queued-fresh", status: "queued", updatedAt: now },
      ])
      .mockResolvedValueOnce([
        { _id: "job-processing-fresh", status: "processing", updatedAt: now },
      ])
      .mockResolvedValueOnce([
        { _id: "resume-fresh", status: "processing", updatedAt: now },
      ]);

    const result = await sweep(mockCtx);

    expect(result).toEqual({ failedReports: 0, failedResumes: 0 });
    expect(mockCtx.db.patch).not.toHaveBeenCalled();
  });
});
