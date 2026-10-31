import { z } from "zod";

/**
 * Cross-service job contract for resume processing.
 *
 * The producer (a Next.js server route) enqueues this exact payload; the worker
 * validates it before doing any work so malformed jobs fail fast instead of
 * being half-processed.
 */
export const resumeJobSchema = z.object({
  /** Convex `resumes` document id. */
  resumeId: z.string().min(1),
  /** Convex `interviews` document id the questions belong to. */
  interviewId: z.string().min(1),
  /** Convex `users` document id (owner). */
  userId: z.string().min(1),
  /** Short-lived, server-generated URL for the uploaded PDF. */
  fileUrl: z.string().url(),
  /** Job description text used to ground question generation. */
  jobDescription: z.string().min(50),
});

export type ResumeJob = z.infer<typeof resumeJobSchema>;

/** Name of the BullMQ queue shared by producer and consumer. */
export const RESUME_QUEUE_NAME = "resume-processing";

/**
 * Cross-service job contract for asynchronous interview evaluation.
 *
 * Only the interview id travels through Redis. The worker fetches the resume
 * text and answers from Convex over the authenticated HTTP bridge.
 */
export const reportJobSchema = z.object({
  /** Convex `interviews` document id. */
  interviewId: z.string().min(1),
  /** Report version; omitted by older producers and treated as 1. */
  version: z.number().int().min(1).optional(),
});

export type ReportJob = z.infer<typeof reportJobSchema>;

export const REPORT_QUEUE_NAME = "report-evaluation";
