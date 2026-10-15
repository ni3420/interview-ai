import { z } from "zod";

export const interviewSetupSchema = z.object({
  resumeId: z
    .string()
    .min(1, "Please upload your resume before starting the interview."),
  jobDescription: z
    .string()
    .min(50, "Job description is too short. Please provide more details."),
});

export type InterviewSetupInput = z.infer<typeof interviewSetupSchema>;
