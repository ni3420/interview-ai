import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuthUserId } from "./auth";

export const questionScoreValidator = v.object({
  questionIndex: v.number(),
  score: v.number(),
  feedback: v.string(),
});

export interface ReportData {
  interviewId: Id<"interviews">;
  userId: Id<"users">;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  questionScores: Array<{
    questionIndex: number;
    score: number;
    feedback: string;
  }>;
}

/**
 * Inserts or replaces the single report belonging to an interview.
 *
 * Shared by the authenticated `saveReport` mutation and the worker's
 * `completeReportJob` mutation so both paths always persist the same shape.
 */
export async function upsertReport(ctx: MutationCtx, data: ReportData) {
  const existing = await ctx.db
    .query("reports")
    .withIndex("by_interview", (q) => q.eq("interviewId", data.interviewId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      overallScore: data.overallScore,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      recommendations: data.recommendations,
      questionScores: data.questionScores,
    });
    return existing._id;
  }

  return await ctx.db.insert("reports", {
    ...data,
    createdAt: Date.now(),
  });
}

export const saveReport = mutation({
  args: {
    interviewId: v.id("interviews"),
    overallScore: v.number(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    recommendations: v.array(v.string()),
    questionScores: v.array(questionScoreValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    return await upsertReport(ctx, {
      interviewId: args.interviewId,
      userId,
      overallScore: args.overallScore,
      strengths: args.strengths,
      weaknesses: args.weaknesses,
      recommendations: args.recommendations,
      questionScores: args.questionScores,
    });
  },
});

// A queued job that has not been picked up after this long is treated as a
// lost enqueue (for example the process died between the Convex mutation and
// Redis) and may be submitted again.
const STALE_QUEUED_MS = 2 * 60 * 1000;

// A processing job is allowed to run for the long local-model evaluation
// before it is considered stuck. BullMQ itself reports stalled jobs earlier,
// so this is only a safety net for status rows that never receive an update.
const STALE_PROCESSING_MS = 30 * 60 * 1000;

/**
 * Requests asynchronous report generation for an interview.
 *
 * Returns whether the caller should enqueue a BullMQ job. Repeated requests
 * are idempotent: an active job is reused, a completed report is returned as
 * completed, and only failed/stale jobs are reset to queued.
 */
export const requestReport = mutation({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) {
      return { status: "not_found" as const, shouldEnqueue: false };
    }

    const existingReport = await ctx.db
      .query("reports")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (existingReport) {
      return { status: "completed" as const, shouldEnqueue: false };
    }

    const answer = await ctx.db
      .query("answers")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .first();
    if (!answer) {
      return { status: "no_answers" as const, shouldEnqueue: false };
    }

    const now = Date.now();
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();

    if (job) {
      const stale =
        (job.status === "queued" && now - job.updatedAt >= STALE_QUEUED_MS) ||
        (job.status === "processing" &&
          now - job.updatedAt >= STALE_PROCESSING_MS);

      if (
        (job.status === "queued" || job.status === "processing") &&
        !stale
      ) {
        return { status: job.status, shouldEnqueue: false };
      }

      await ctx.db.patch(job._id, {
        status: "queued",
        error: undefined,
        startedAt: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
      return { status: "queued" as const, shouldEnqueue: true };
    }

    await ctx.db.insert("reportJobs", {
      interviewId: args.interviewId,
      userId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    return { status: "queued" as const, shouldEnqueue: true };
  },
});

export const getReportJob = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) return null;

    return await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
  },
});

/**
 * Marks a job failed when it could not be handed to Redis. Only the owner may
 * update their own job; the worker's internal mutation is used afterwards.
 */
export const markReportJobFailed = mutation({
  args: { interviewId: v.id("interviews"), error: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
    if (!job) return { success: false };

    await ctx.db.patch(job._id, {
      status: "failed",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const getReport = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) return null;

    return await ctx.db
      .query("reports")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();
  },
});

export const getUserReports = query({
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    return await ctx.db
      .query("reports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});
