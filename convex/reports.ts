import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthUserId } from "./auth";

export const saveReport = mutation({
  args: {
    interviewId: v.id("interviews"),
    overallScore: v.number(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    recommendations: v.array(v.string()),
    questionScores: v.array(v.object({
      questionIndex: v.number(),
      score: v.number(),
      feedback: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        overallScore: args.overallScore,
        strengths: args.strengths,
        weaknesses: args.weaknesses,
        recommendations: args.recommendations,
        questionScores: args.questionScores,
      });
      return existing._id;
    }

    return await ctx.db.insert("reports", {
      interviewId: args.interviewId,
      userId,
      overallScore: args.overallScore,
      strengths: args.strengths,
      weaknesses: args.weaknesses,
      recommendations: args.recommendations,
      questionScores: args.questionScores,
      createdAt: now,
    });
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