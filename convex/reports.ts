import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuthUserId } from "./auth";
import { reportQuestionScoreValidator } from "./schema";

// The worker persists the exact question shape produced by the AI service.
// Kept as an alias so existing imports keep working.
export const questionScoreValidator = reportQuestionScoreValidator;

export interface ReportCriterion {
  id: string;
  label: string;
  score: number;
  weight: number;
  evidence: string[];
  comment: string;
}

export interface ReportQuestionScore {
  questionIndex: number;
  score: number | null;
  feedback: string;
  status?: "answered" | "partial" | "unanswered" | "not_evaluable";
  question?: string;
  answer?: string;
  expectedAnswer?: string;
  expectedAnswerSource?: "ai_generated" | "stored_reference" | "unavailable";
  notEvaluableReason?: string;
  evidence?: string[];
  criteria?: ReportCriterion[];
  strengths?: string[];
  missingPoints?: string[];
  linkReasons?: string[];
}

export interface ReportCounts {
  questions: number;
  answered: number;
  partial: number;
  unanswered: number;
  notEvaluable: number;
  evaluated: number;
  excludedSegments: number;
}

export interface SkillScores {
  technicalKnowledge: number;
  problemSolving: number;
  communication: number;
  conceptualUnderstanding: number;
  relevance: number;
}

export interface ReportData {
  interviewId: Id<"interviews">;
  userId: Id<"users">;
  overallScore: number | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  questionScores: ReportQuestionScore[];
  version: number;
  schemaVersion?: string;
  scoreScale?: number;
  summary?: string;
  completionStatus?: "complete" | "partial" | "insufficient_evidence";
  counts?: ReportCounts;
  skillScores?: SkillScores;
  qualityWarnings?: Array<{ code: string; message: string }>;
  promptVersion?: string;
  rubricVersion?: string;
}

function reportFields(data: ReportData) {
  return {
    overallScore: data.overallScore,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    recommendations: data.recommendations,
    questionScores: data.questionScores,
    version: data.version,
    schemaVersion: data.schemaVersion,
    scoreScale: data.scoreScale,
    summary: data.summary,
    completionStatus: data.completionStatus,
    counts: data.counts,
    skillScores: data.skillScores,
    qualityWarnings: data.qualityWarnings,
    promptVersion: data.promptVersion,
    rubricVersion: data.rubricVersion,
  };
}

/**
 * Inserts or replaces the report for an interview version.
 *
 * Regeneration never overwrites an older version: the new report is a new row,
 * and readers show the newest one. Legacy rows have no `version` and are
 * treated as version 1.
 */
export async function upsertReport(ctx: MutationCtx, data: ReportData) {
  const rows = await ctx.db
    .query("reports")
    .withIndex("by_interview", (q) => q.eq("interviewId", data.interviewId))
    .collect();

  const existing = rows.find(
    (row) => (row.version ?? 1) === data.version
  );

  if (existing) {
    await ctx.db.patch(existing._id, reportFields(data));
    return existing._id;
  }

  return await ctx.db.insert("reports", {
    interviewId: data.interviewId,
    userId: data.userId,
    ...reportFields(data),
    createdAt: Date.now(),
  });
}

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
 * Repeated requests are idempotent per version: an active job is reused and a
 * completed report is returned without enqueueing. `regenerate: true` starts
 * the next version while leaving the previous report intact.
 */
export const requestReport = mutation({
  args: {
    interviewId: v.id("interviews"),
    regenerate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) {
      return { status: "not_found" as const, shouldEnqueue: false };
    }

    const reports = await ctx.db
      .query("reports")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .collect();
    const latestVersion = reports.reduce(
      (max, report) => Math.max(max, report.version ?? 1),
      0
    );

    if (latestVersion > 0 && !args.regenerate) {
      return {
        status: "completed" as const,
        shouldEnqueue: false,
        version: latestVersion,
      };
    }

    const answer = await ctx.db
      .query("answers")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .first();
    const segment = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .first();
    if (!answer && !segment) {
      return { status: "no_answers" as const, shouldEnqueue: false };
    }

    const now = Date.now();
    const job = await ctx.db
      .query("reportJobs")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();

    const targetVersion =
      latestVersion > 0 ? latestVersion + 1 : (job?.version ?? 1);

    if (job) {
      const stale =
        (job.status === "queued" && now - job.updatedAt >= STALE_QUEUED_MS) ||
        (job.status === "processing" &&
          now - job.updatedAt >= STALE_PROCESSING_MS);
      const active =
        (job.status === "queued" || job.status === "processing") && !stale;

      if (active && (job.version ?? 1) === targetVersion) {
        return {
          status: job.status,
          shouldEnqueue: false,
          version: targetVersion,
        };
      }

      await ctx.db.patch(job._id, {
        status: "queued",
        version: targetVersion,
        error: undefined,
        errorCode: undefined,
        startedAt: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
      return {
        status: "queued" as const,
        shouldEnqueue: true,
        version: targetVersion,
      };
    }

    await ctx.db.insert("reportJobs", {
      interviewId: args.interviewId,
      userId,
      status: "queued",
      version: targetVersion,
      createdAt: now,
      updatedAt: now,
    });

    return {
      status: "queued" as const,
      shouldEnqueue: true,
      version: targetVersion,
    };
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
      errorCode: "enqueue_failed",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/** Newest report for an interview; regeneration adds versions, never deletes. */
export const getReport = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) return null;

    return await ctx.db
      .query("reports")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .order("desc")
      .first();
  },
});

/** Latest report per interview for the dashboard. */
export const getUserReports = query({
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const seen = new Set<string>();
    return reports.filter((report) => {
      if (seen.has(report.interviewId)) return false;
      seen.add(report.interviewId);
      return true;
    });
  },
});
