import { z } from "zod";

export const interviewSetupSchema = z.object({
  resumeText: z.string().min(100, "Resume text is too short. Please upload a valid resume."),
  jobDescription: z.string().min(50, "Job description is too short. Please provide more details."),
});

export type InterviewSetupInput = z.infer<typeof interviewSetupSchema>;