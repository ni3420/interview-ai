import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

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
