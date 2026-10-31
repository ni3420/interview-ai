import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  completionStatusValidator,
  qualityWarningsValidator,
  reportCountsValidator,
  reportQuestionScoreValidator,
  skillScoresValidator,
} from "./schema";
import { upsertReport } from "./reports";

// Shape of the interview plan produced by the AI service and persisted for the
// live interview. `questions` is what the lobby and interview page consume.
const planValidator = v.object({
  questions: v.array(v.string()),
  focusAreas: v.array(v.string()),
});

/**
 * Persists the result of the resume-processing worker.
 *
 * This is an internal mutation: it is only reachable from the authenticated
 * HTTP action in `http.ts`, never directly from a client. It marks the resume
 * ready and stores the extracted text plus the generated plan on the interview.
 */
export const completeResumeProcessing = internalMutation({
  args: {
    resumeId: v.optional(v.id("resumes")),
    interviewId: v.optional(v.id("interviews")),
    resumeText: v.string(),
    chunkCount: v.number(),
    plan: planValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.resumeId) {
      const resume = await ctx.db.get(args.resumeId);
      if (resume) {
        await ctx.db.patch(args.resumeId, { status: "ready", updatedAt: now });
      }
    }

    if (args.interviewId) {
      const interview = await ctx.db.get(args.interviewId);
      if (interview) {
        await ctx.db.patch(args.interviewId, {
          resumeText: args.resumeText,
          plan: args.plan,
          // A successful retry must clear a failure recorded by an earlier
          // terminal attempt, otherwise the interview stays "failed" forever.
          ...(interview.status === "failed" ? { status: "setup" as const } : {}),
          updatedAt: now,
        });
      }
    }

    return { success: true };
  },
});

/**
 * Marks a resume/interview failed so the lobby surfaces the error instead of
 * waiting on progress that will never arrive.
 */
export const failResumeProcessing = internalMutation({
  args: {
    resumeId: v.optional(v.id("resumes")),
    interviewId: v.optional(v.id("interviews")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.resumeId) {
      const resume = await ctx.db.get(args.resumeId);
      if (resume) {
        await ctx.db.patch(args.resumeId, { status: "failed", updatedAt: now });
      }
    }

    if (args.interviewId) {
      const interview = await ctx.db.get(args.interviewId);
      if (interview && interview.status !== "completed") {
        await ctx.db.patch(args.interviewId, {
          status: "failed",
          updatedAt: now,
        });
      }
    }

    return { success: true };
  },
});

/**
 * Everything the worker needs to evaluate an interview. Fetched by the worker
 * over the authenticated HTTP bridge so resume text and answers never travel
 * through the Redis job payload.
 */
export const getReportContext = internalQuery({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const interview = await ctx.db.get(args.interviewId);
    if (!interview) return null;

    const answers = await ctx.db
      .query("answers")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .collect();

    // The index is ordered by creation time, which is not guaranteed to match
    // question order after a rejoin or an out-of-order retry. Sort explicitly
    // so the model's zero-based positions align with the real questions.
    const orderedAnswers = [...answers].sort(
      (a, b) => a.questionIndex - b.questionIndex
    );

    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .collect();
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();

    return {
      interviewId: interview._id,
      userId: interview.userId,
      resumeText: interview.resumeText ?? "",
      jobDescription: interview.jobDescription,
      version: job?.version ?? 1,
      attempt: job?.attempt ?? 1,
      qaPairs: orderedAnswers.map((answer) => ({
        questionIndex: answer.questionIndex,
        question: answer.question,
        answer: answer.answer,
      })),
      // Raw, finalized captions. The AI service re-classifies these; the
      // stored `kind` is intentionally not forwarded as authoritative.
      segments: segments
        .sort((a, b) => a.start - b.start)
        .map((segment) => ({
          id: segment._id,
          speaker: segment.speaker,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          asrConfidence: segment.asrConfidence,
          speakerConfidence: segment.speakerConfidence,
        })),
    };
  },
});

/**
 * Marks a report job as actively being processed. Called by the worker after it
 * dequeues the job, so the UI can distinguish "waiting in Redis" from "calling
 * the model".
 */
export const startReportJob = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    version: v.optional(v.number()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (!job) return { success: false };

    // A stale worker for an older version must not mark the current version as
    // processing.
    if (
      args.version !== undefined &&
      job.version !== undefined &&
      job.version !== args.version
    ) {
      return { success: false, stale: true };
    }

    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "processing",
      version: args.version ?? job.version ?? 1,
      attempt: args.attempt ?? job.attempt ?? 1,
      startedAt: job.startedAt ?? now,
      error: undefined,
      errorCode: undefined,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Persists a successful evaluation and completes the job. The upsert is
 * idempotent per version, so a retried attempt can safely overwrite its own
 * previous result without destroying older versions.
 */
export const completeReportJob = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    overallScore: v.union(v.number(), v.null()),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    recommendations: v.array(v.string()),
    questionScores: v.array(reportQuestionScoreValidator),
    version: v.optional(v.number()),
    attempt: v.optional(v.number()),
    summary: v.optional(v.string()),
    completionStatus: v.optional(completionStatusValidator),
    counts: v.optional(reportCountsValidator),
    skillScores: v.optional(skillScoresValidator),
    qualityWarnings: v.optional(qualityWarningsValidator),
    promptVersion: v.optional(v.string()),
    rubricVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interview = await ctx.db.get(args.interviewId);
    if (!interview) throw new Error("Interview not found");

    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    const version = args.version ?? job?.version ?? 1;

    // Ignore completion from a superseded attempt (regeneration started while
    // the old version was still running). The old report is not written.
    if (job?.version !== undefined && job.version !== version) {
      return { success: false, stale: true };
    }

    if (
      args.overallScore !== null &&
      (args.overallScore < 0 || args.overallScore > 10)
    ) {
      throw new Error("Invalid overall score");
    }
    const scored = args.questionScores.filter(
      (score) => score.score !== null
    );
    for (const score of scored) {
      if (score.score === null || score.score < 0 || score.score > 10) {
        throw new Error("Invalid question score");
      }
    }
    if (args.overallScore === null && scored.length > 0) {
      throw new Error("Missing overall score");
    }
    if (args.overallScore !== null && scored.length === 0) {
      throw new Error("Overall score without evaluated questions");
    }
    if (args.counts && args.counts.evaluated !== scored.length) {
      throw new Error("Evaluation counts do not match scores");
    }

    const reportId = await upsertReport(ctx, {
      interviewId: args.interviewId,
      userId: interview.userId,
      overallScore: args.overallScore,
      strengths: args.strengths,
      weaknesses: args.weaknesses,
      recommendations: args.recommendations,
      questionScores: args.questionScores,
      version,
      schemaVersion: "report-v1",
      scoreScale: 10,
      summary: args.summary,
      completionStatus: args.completionStatus,
      counts: args.counts,
      skillScores: args.skillScores,
      qualityWarnings: args.qualityWarnings,
      promptVersion: args.promptVersion,
      rubricVersion: args.rubricVersion,
    });

    const now = Date.now();
    if (job) {
      await ctx.db.patch(job._id, {
        status: "completed",
        version,
        attempt: args.attempt ?? job.attempt,
        promptVersion: args.promptVersion,
        rubricVersion: args.rubricVersion,
        reportId,
        error: undefined,
        errorCode: undefined,
        completedAt: now,
        updatedAt: now,
      });
    }

    return { success: true, reportId };
  },
});

/** Records a terminal report-generation failure for the report page. */
export const failReportJob = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (!job) return { success: false };

    if (
      args.version !== undefined &&
      job.version !== undefined &&
      job.version !== args.version
    ) {
      return { success: false, stale: true };
    }

    await ctx.db.patch(job._id, {
      status: "failed",
      // Never persist a raw provider message; the UI maps the stable code.
      error: (args.error ?? "Report generation failed").slice(0, 500),
      errorCode: args.errorCode ?? "report_generation_failed",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
