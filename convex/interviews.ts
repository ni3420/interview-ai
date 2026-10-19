import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthUserId } from "./auth";

export const createInterview = mutation({
  args: {
    resumeId: v.optional(v.id("resumes")),
    resumeText: v.optional(v.string()),
    jobDescription: v.string(),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const now = Date.now();

    return await ctx.db.insert("interviews", {
      userId,
      resumeId: args.resumeId,
      resumeText: args.resumeText ?? "",
      jobDescription: args.jobDescription,
      status: "setup",
      currentQuestionIndex: 0,
      durationMinutes: args.durationMinutes ?? 30,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getInterviews = query({
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    return await ctx.db
      .query("interviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getInterview = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) return null;
    return interview;
  },
});

export const updateInterviewStatus = mutation({
  args: {
    interviewId: v.id("interviews"),
    status: v.union(
      v.literal("setup"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    plan: v.optional(v.any()),
    currentQuestionIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.plan !== undefined) updates.plan = args.plan;
    if (args.currentQuestionIndex !== undefined) updates.currentQuestionIndex = args.currentQuestionIndex;
    if (args.status === "in_progress" && !interview.startedAt) updates.startedAt = Date.now();
    if (args.status === "completed") updates.completedAt = Date.now();

    await ctx.db.patch(args.interviewId, updates);
    return { success: true };
  },
});

export const saveInterviewPlan = mutation({
  args: {
    interviewId: v.id("interviews"),
    plan: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    await ctx.db.patch(args.interviewId, {
      plan: args.plan,
      status: "in_progress",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});