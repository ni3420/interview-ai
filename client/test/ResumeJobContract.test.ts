import { describe, it, expect } from "vitest";
// The worker owns the job contract; the producer must satisfy it exactly.
import { resumeJobSchema } from "../../worker/src/job";
import { buildResumeJob } from "@/lib/resume-queue";

describe("resume job contract", () => {
  it("producer payload satisfies the worker's validated schema", () => {
    const job = buildResumeJob(
      {
        resumeId: "resume-1",
        interviewId: "interview-1",
        userId: "user-1",
        jobDescription: "A sufficiently long job description used for contract testing.",
      },
      "http://host.docker.internal/api/storage/resume-1"
    );

    expect(resumeJobSchema.safeParse(job).success).toBe(true);
  });

  it("rejects a job description that is too short", () => {
    const job = buildResumeJob(
      {
        resumeId: "resume-1",
        interviewId: "interview-1",
        userId: "user-1",
        jobDescription: "too short",
      },
      "http://host.docker.internal/api/storage/resume-1"
    );

    expect(resumeJobSchema.safeParse(job).success).toBe(false);
  });

  it("rejects a non-URL file location", () => {
    const job = buildResumeJob(
      {
        resumeId: "resume-1",
        interviewId: "interview-1",
        userId: "user-1",
        jobDescription: "A sufficiently long job description used for contract testing.",
      },
      "not-a-url"
    );

    expect(resumeJobSchema.safeParse(job).success).toBe(false);
  });
});
