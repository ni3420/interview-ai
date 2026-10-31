import { internalMutation } from "./_generated/server";

// A queued job older than this was never picked up (Redis lost the enqueue or
// the producer died between the Convex write and `queue.add`). `requestReport`
// already reuses a queued row after 2 minutes; this only closes the UI loop.
const REPORT_QUEUED_STALE_MS = 15 * 60 * 1000;

// Longest legitimate run: two attempts at the 15-minute AI timeout plus
// backoff. Anything older than this will not complete on its own.
const REPORT_PROCESSING_STALE_MS = 45 * 60 * 1000;

// Three attempts at the 15-minute AI timeout plus backoff, with margin.
const RESUME_PROCESSING_STALE_MS = 60 * 60 * 1000;

/**
 * Marks jobs that can no longer finish as failed, so the lobby and report page
 * show an actionable error instead of spinning forever.
 *
 * A late completion still wins: `completeReportJob`/`completeResumeProcessing`
 * overwrite the row and clear the error, so this sweep is safe to race with a
 * slow worker.
 */
export const sweepStaleJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let failedReports = 0;
    let failedResumes = 0;

    const reportWindows = [
      ["queued", REPORT_QUEUED_STALE_MS],
      ["processing", REPORT_PROCESSING_STALE_MS],
    ] as const;

    for (const [status, staleMs] of reportWindows) {
      const jobs = await ctx.db
        .query("reportJobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const job of jobs) {
        if (now - job.updatedAt < staleMs) continue;
        await ctx.db.patch(job._id, {
          status: "failed",
          error: "Job timed out before completion",
          errorCode: "job_timeout",
          completedAt: now,
          updatedAt: now,
        });
        failedReports += 1;
      }
    }

    const resumes = await ctx.db
      .query("resumes")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();
    for (const resume of resumes) {
      if (now - resume.updatedAt < RESUME_PROCESSING_STALE_MS) continue;
      await ctx.db.patch(resume._id, { status: "failed", updatedAt: now });
      failedResumes += 1;
    }

    return { failedReports, failedResumes };
  },
});
