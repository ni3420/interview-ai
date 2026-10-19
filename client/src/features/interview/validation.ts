import { z } from "zod";
import { isInterviewDuration } from "@/lib/interview-timer";

export const interviewSetupSchema = z.object({
  resumeId: z
    .string()
    .min(1, "Please upload your resume before starting the interview."),
  jobDescription: z
    .string()
    .min(50, "Job description is too short. Please provide more details."),
  durationMinutes: z
    .number()
    .int("Choose a valid interview length.")
    .refine(isInterviewDuration, {
      message: "Choose a valid interview length (15, 30, 45 or 60 minutes).",
    }),
});

export type InterviewSetupInput = z.infer<typeof interviewSetupSchema>;
