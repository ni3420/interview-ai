import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthUserId } from "./auth";

export const saveAnswer = mutation({
  args: {
    interviewId: v.id("interviews"),
    questionIndex: v.number(),
    question: v.string(),
    answer: v.string(),
    followUpCount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    const existing = await ctx.db
      .query("answers")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .filter((q) => q.eq(q.field("questionIndex"), args.questionIndex))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        answer: args.answer,
        followUpCount: args.followUpCount,
      });
      return existing._id;
    }

    return await ctx.db.insert("answers", {
      interviewId: args.interviewId,
      questionIndex: args.questionIndex,
      question: args.question,
      answer: args.answer,
      followUpCount: args.followUpCount,
      createdAt: now,
    });
  },
});

export const getAnswers = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) return [];

    return await ctx.db
      .query("answers")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .order("asc")
      .collect();
  },
});

export const incrementQuestionIndex = mutation({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    await ctx.db.patch(args.interviewId, {
      currentQuestionIndex: interview.currentQuestionIndex + 1,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});