import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  interviews: defineTable({
    userId: v.id("users"),
    resumeText: v.string(),
    jobDescription: v.string(),
    status: v.union(
      v.literal("setup"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    plan: v.optional(v.any()),
    currentQuestionIndex: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  answers: defineTable({
    interviewId: v.id("interviews"),
    questionIndex: v.number(),
    question: v.string(),
    answer: v.string(),
    followUpCount: v.number(),
    createdAt: v.number(),
  }).index("by_interview", ["interviewId"]),

  reports: defineTable({
    interviewId: v.id("interviews"),
    userId: v.id("users"),
    overallScore: v.number(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    recommendations: v.array(v.string()),
    questionScores: v.array(v.object({
      questionIndex: v.number(),
      score: v.number(),
      feedback: v.string(),
    })),
    createdAt: v.number(),
  }).index("by_interview", ["interviewId"])
    .index("by_user", ["userId"]),
});

