import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthUserId } from "./auth";
import {
  classifyTranscriptSegment,
  type TranscriptSpeaker,
} from "./transcriptText";

const speakerValidator = v.union(
  v.literal("interviewer"),
  v.literal("candidate"),
  v.literal("unknown")
);

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

/**
 * Persists one finalized caption segment exactly once per utterance key.
 *
 * The original text is never rewritten by the report pipeline; a Stream
 * re-delivery with refined ASR text patches the same row. Classification is
 * derived here, not accepted from the client.
 */
export const saveTranscriptSegment = mutation({
  args: {
    interviewId: v.id("interviews"),
    segmentKey: v.string(),
    speaker: speakerValidator,
    start: v.number(),
    end: v.number(),
    text: v.string(),
    asrConfidence: v.optional(v.number()),
    speakerConfidence: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) throw new Error("Not found");

    if (args.segmentKey.length === 0 || args.segmentKey.length > 200) {
      throw new Error("Invalid segment key");
    }
    if (!Number.isFinite(args.start) || !Number.isFinite(args.end) || args.end < args.start) {
      throw new Error("Invalid segment timestamps");
    }
    if (args.speakerConfidence < 0 || args.speakerConfidence > 1) {
      throw new Error("Invalid speaker confidence");
    }
    if (
      args.asrConfidence !== undefined &&
      (args.asrConfidence < 0 || args.asrConfidence > 1)
    ) {
      throw new Error("Invalid ASR confidence");
    }

    const kind = classifyTranscriptSegment(
      args.text,
      args.speaker as TranscriptSpeaker,
      args.asrConfidence
    );
    const data = {
      interviewId: args.interviewId,
      userId,
      segmentKey: args.segmentKey,
      speaker: args.speaker,
      start: args.start,
      end: args.end,
      text: args.text,
      asrConfidence: args.asrConfidence,
      speakerConfidence: args.speakerConfidence,
      kind,
    };

    const existing = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_interview_segment", (q) =>
        q.eq("interviewId", args.interviewId).eq("segmentKey", args.segmentKey)
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...data, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("transcriptSegments", {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getTranscriptSegments = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const interview = await ctx.db.get(args.interviewId);
    if (!interview || interview.userId !== userId) return [];

    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_interview", (q) => q.eq("interviewId", args.interviewId))
      .collect();

    return segments.sort((a, b) => a.start - b.start);
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