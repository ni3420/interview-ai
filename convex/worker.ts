import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { questionScoreValidator, upsertReport } from "./reports";

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

    return {
      interviewId: interview._id,
      userId: interview.userId,
      resumeText: interview.resumeText ?? "",
      jobDescription: interview.jobDescription,
      qaPairs: orderedAnswers.map((answer) => ({
        questionIndex: answer.questionIndex,
        question: answer.question,
        answer: answer.answer,
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
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (!job) return { success: false };

    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "processing",
      startedAt: job.startedAt ?? now,
      error: undefined,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * Persists a successful evaluation and completes the job. The upsert is
 * idempotent, so a retried attempt can safely overwrite a previous partial
 * result.
 */
export const completeReportJob = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    overallScore: v.number(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    recommendations: v.array(v.string()),
    questionScores: v.array(questionScoreValidator),
  },
  handler: async (ctx, args) => {
    const interview = await ctx.db.get(args.interviewId);
    if (!interview) throw new Error("Interview not found");

    if (args.overallScore < 0 || args.overallScore > 100) {
      throw new Error("Invalid overall score");
    }
    for (const score of args.questionScores) {
      if (score.score < 0 || score.score > 100) {
        throw new Error("Invalid question score");
      }
    }

    const reportId = await upsertReport(ctx, {
      interviewId: args.interviewId,
      userId: interview.userId,
      overallScore: args.overallScore,
      strengths: args.strengths,
      weaknesses: args.weaknesses,
      recommendations: args.recommendations,
      questionScores: args.questionScores,
    });

    const now = Date.now();
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (job) {
      await ctx.db.patch(job._id, {
        status: "completed",
        error: undefined,
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
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (!job) return { success: false };

    await ctx.db.patch(job._id, {
      status: "failed",
      error: (args.error ?? "Report generation failed").slice(0, 500),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
