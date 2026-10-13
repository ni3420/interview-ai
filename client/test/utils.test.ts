import { describe, it, expect } from "vitest";
import { interviewSetupSchema } from "@/features/interview/validation";
import { formatDistanceToNow } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

describe("Interview Setup Validation", () => {
  describe("interviewSetupSchema", () => {
    it("passes with valid resume and job description", () => {
      const result = interviewSetupSchema.safeParse({
        resumeText: "Software engineer with 5 years experience in React, Node.js, TypeScript. Built scalable web applications. Led team of 4 developers.",
        jobDescription: "Senior Frontend Engineer role. Requirements: React, TypeScript, Next.js, GraphQL, 5+ years experience. Responsible for building user-facing features.",
      });

      expect(result.success).toBe(true);
    });

    it("fails when resume text is too short", () => {
      const result = interviewSetupSchema.safeParse({
        resumeText: "short",
        jobDescription: "Valid job description with enough content to pass validation",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("resumeText");
        expect(result.error.errors[0].message).toContain("too short");
      }
    });

    it("fails when job description is too short", () => {
      const result = interviewSetupSchema.safeParse({
        resumeText: "Valid resume with enough content to pass the minimum length requirement",
        jobDescription: "short",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const jdError = result.error.errors.find(e => e.path.includes("jobDescription"));
        expect(jdError).toBeDefined();
        expect(jdError?.message).toContain("too short");
      }
    });

    it("fails when both fields are too short", () => {
      const result = interviewSetupSchema.safeParse({
        resumeText: "short",
        jobDescription: "short",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.length).toBe(2);
      }
    });
  });
});

describe("Date Utils", () => {
  it("formats date correctly", () => {
    const now = Date.now();
    const result = formatDistanceToNow(new Date(now));
    expect(typeof result).toBe("string");
  });
});

describe("Utility Functions", () => {
  it("cn joins classes correctly", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("a", false && "b")).toBe("a");
    expect(cn("a", null, "b")).toBe("a b");
  });
});