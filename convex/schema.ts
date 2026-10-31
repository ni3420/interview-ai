import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const questionStatusValidator = v.union(
  v.literal("answered"),
  v.literal("partial"),
  v.literal("unanswered"),
  v.literal("not_evaluable")
);

const criterionScoreValidator = v.object({
  id: v.string(),
  label: v.string(),
  score: v.number(),
  weight: v.number(),
  evidence: v.array(v.string()),
  comment: v.string(),
});

// Reports written before the rubric change have `score` as a plain number.
// Widening it to include null lets a question carry an explicit
// NOT_EVALUABLE result instead of being silently scored 0.
export const reportQuestionScoreValidator = v.object({
  questionIndex: v.number(),
  score: v.union(v.number(), v.null()),
  feedback: v.string(),
  status: v.optional(questionStatusValidator),
  question: v.optional(v.string()),
  answer: v.optional(v.string()),
  expectedAnswer: v.optional(v.string()),
  expectedAnswerSource: v.optional(
    v.union(
      v.literal("ai_generated"),
      v.literal("stored_reference"),
      v.literal("unavailable")
    )
  ),
  notEvaluableReason: v.optional(v.string()),
  evidence: v.optional(v.array(v.string())),
  criteria: v.optional(v.array(criterionScoreValidator)),
  strengths: v.optional(v.array(v.string())),
  missingPoints: v.optional(v.array(v.string())),
  linkReasons: v.optional(v.array(v.string())),
});

export const reportCountsValidator = v.object({
  questions: v.number(),
  answered: v.number(),
  partial: v.number(),
  unanswered: v.number(),
  notEvaluable: v.number(),
  evaluated: v.number(),
  excludedSegments: v.number(),
});

export const skillScoresValidator = v.object({
  technicalKnowledge: v.number(),
  problemSolving: v.number(),
  communication: v.number(),
  conceptualUnderstanding: v.number(),
  relevance: v.number(),
});

export const qualityWarningsValidator = v.array(
  v.object({ code: v.string(), message: v.string() })
);

export const completionStatusValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("insufficient_evidence")
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    // One address, one account. Not unique: Convex has no unique index, and the
    // rows written before this rule share addresses without breaking sign-in.
    .index("by_email", ["email"]),

  interviews: defineTable({
    userId: v.id("users"),
    resumeId: v.optional(v.id("resumes")),
    resumeText: v.optional(v.string()),
    jobDescription: v.string(),
    status: v.union(
      v.literal("setup"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    plan: v.optional(v.any()),
    currentQuestionIndex: v.number(),
    durationMinutes: v.optional(v.number()),
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

  // Raw, finalized caption segments. This is the fidelity layer: the report is
  // derived from these rows and never from a cleaned or reconstructed version
  // of them. `answers` remains the live/review view and is not replaced.
  transcriptSegments: defineTable({
    interviewId: v.id("interviews"),
    userId: v.id("users"),
    /** Stream's stable utterance key, unique within an interview. */
    segmentKey: v.string(),
    speaker: v.union(
      v.literal("interviewer"),
      v.literal("candidate"),
      v.literal("unknown")
    ),
    /** Epoch milliseconds from Stream's caption start/end timestamps. */
    start: v.number(),
    end: v.number(),
    text: v.string(),
    /** Null when the transcription provider does not supply confidence. */
    asrConfidence: v.optional(v.number()),
    speakerConfidence: v.number(),
    kind: v.union(
      v.literal("answer_content"),
      v.literal("greeting"),
      v.literal("small_talk"),
      v.literal("filler_only"),
      v.literal("background"),
      v.literal("noise"),
      v.literal("unverified")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_interview", ["interviewId"])
    .index("by_interview_segment", ["interviewId", "segmentKey"]),

  resumes: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    status: v.union(
      v.literal("uploaded"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    uploadedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  reports: defineTable({
    interviewId: v.id("interviews"),
    userId: v.id("users"),
    // Null only when no question had evaluable evidence (insufficient
    // evidence); never a silent zero. Reports older than the rubric change
    // store a number on the 0-100 scale.
    overallScore: v.union(v.number(), v.null()),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    recommendations: v.array(v.string()),
    questionScores: v.array(reportQuestionScoreValidator),
    // Regeneration version, starting at 1. Old rows have no field and are
    // treated as version 1 by readers.
    version: v.optional(v.number()),
    schemaVersion: v.optional(v.string()),
    // 10 for rubric reports; absent on 0-100 legacy reports.
    scoreScale: v.optional(v.number()),
    summary: v.optional(v.string()),
    completionStatus: v.optional(completionStatusValidator),
    counts: v.optional(reportCountsValidator),
    skillScores: v.optional(skillScoresValidator),
    qualityWarnings: v.optional(qualityWarningsValidator),
    promptVersion: v.optional(v.string()),
    rubricVersion: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_interview", ["interviewId"])
    .index("by_user", ["userId"]),

  // Durable status for the asynchronous report-generation job. The report
  // itself lives in `reports`; this table lets the UI observe queued,
  // processing, completed and failed without holding an HTTP request open.
  reportJobs: defineTable({
    interviewId: v.id("interviews"),
    userId: v.id("users"),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    // Stable machine code shown through UI copy; never a raw provider message.
    errorCode: v.optional(v.string()),
    /** Regeneration version this job evaluates. */
    version: v.optional(v.number()),
    /** 1-based BullMQ attempt for this version. */
    attempt: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
    rubricVersion: v.optional(v.string()),
    reportId: v.optional(v.id("reports")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_interview", ["interviewId"])
    .index("by_user", ["userId"]),
});

