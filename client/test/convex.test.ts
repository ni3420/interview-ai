import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCtx, mockAuthUserId, mockInterview, mockAnswers, mockReport } from "./helpers";

vi.mock("../../convex/auth", () => ({
  requireAuthUserId: vi.fn().mockResolvedValue(mockAuthUserId),
}));

import { createInterview, getInterviews, getInterview, updateInterviewStatus, saveInterviewPlan } from "../../convex/interviews";
import { saveAnswer, getAnswers, incrementQuestionIndex } from "../../convex/answers";
import { saveReport, getReport, getUserReports } from "../../convex/reports";

describe("Convex - Interviews", () => {
  let mockCtx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mockCtx = createMockCtx();
    vi.clearAllMocks();
  });

  describe("createInterview", () => {
    it("creates an interview with correct data", async () => {
      mockCtx.db.insert.mockResolvedValue("new-interview-id");

      const result = await createInterview(mockCtx, {
        resumeText: "Test resume",
        jobDescription: "Test JD",
      });

      expect(result).toBe("new-interview-id");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("interviews", expect.objectContaining({
        userId: mockAuthUserId,
        resumeText: "Test resume",
        jobDescription: "Test JD",
        status: "setup",
        currentQuestionIndex: 0,
      }));
    });
  });

  describe("getInterviews", () => {
    it("returns user interviews ordered by createdAt desc", async () => {
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([mockInterview]),
      });

      const result = await getInterviews(mockCtx);

      expect(result).toEqual([mockInterview]);
    });
  });

  describe("getInterview", () => {
    it("returns interview when user owns it", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);

      const result = await getInterview(mockCtx, { interviewId: "interview-1" });

      expect(result).toEqual(mockInterview);
    });

    it("returns null when interview not found", async () => {
      mockCtx.db.get.mockResolvedValue(null);

      const result = await getInterview(mockCtx, { interviewId: "not-found" });

      expect(result).toBeNull();
    });

    it("returns null when user doesn't own interview", async () => {
      mockCtx.db.get.mockResolvedValue({ ...mockInterview, userId: "other-user" });

      const result = await getInterview(mockCtx, { interviewId: "interview-1" });

      expect(result).toBeNull();
    });
  });

  describe("updateInterviewStatus", () => {
    it("updates status and sets startedAt for in_progress", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.patch.mockResolvedValue(undefined);

      const result = await updateInterviewStatus(mockCtx, {
        interviewId: "interview-1",
        status: "in_progress",
      });

      expect(result).toEqual({ success: true });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("interview-1", expect.objectContaining({
        status: "in_progress",
        startedAt: expect.any(Number),
      }));
    });

    it("updates status and sets completedAt for completed", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.patch.mockResolvedValue(undefined);

      const result = await updateInterviewStatus(mockCtx, {
        interviewId: "interview-1",
        status: "completed",
      });

      expect(result).toEqual({ success: true });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("interview-1", expect.objectContaining({
        status: "completed",
        completedAt: expect.any(Number),
      }));
    });

    it("throws when interview not found", async () => {
      mockCtx.db.get.mockResolvedValue(null);

      await expect(updateInterviewStatus(mockCtx, {
        interviewId: "not-found",
        status: "in_progress",
      })).rejects.toThrow("Not found");
    });
  });

  describe("saveInterviewPlan", () => {
    it("saves plan and updates status to in_progress", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.patch.mockResolvedValue(undefined);

      const plan = { questions: ["Q1", "Q2"], focus_areas: ["React"] };
      const result = await saveInterviewPlan(mockCtx, {
        interviewId: "interview-1",
        plan,
      });

      expect(result).toEqual({ success: true });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("interview-1", expect.objectContaining({
        plan,
        status: "in_progress",
        startedAt: expect.any(Number),
      }));
    });
  });
});

describe("Convex - Answers", () => {
  let mockCtx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mockCtx = createMockCtx();
    vi.clearAllMocks();
  });

  describe("saveAnswer", () => {
    it("creates new answer when none exists", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        unique: vi.fn().mockResolvedValue(null),
      });
      mockCtx.db.insert.mockResolvedValue("new-answer-id");

      const result = await saveAnswer(mockCtx, {
        interviewId: "interview-1",
        questionIndex: 0,
        question: "Test question",
        answer: "Test answer",
        followUpCount: 0,
      });

      expect(result).toBe("new-answer-id");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("answers", expect.objectContaining({
        interviewId: "interview-1",
        questionIndex: 0,
        question: "Test question",
        answer: "Test answer",
        followUpCount: 0,
      }));
    });

    it("updates existing answer", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        unique: vi.fn().mockResolvedValue({ _id: "existing-answer" }),
      });
      mockCtx.db.patch.mockResolvedValue(undefined);

      const result = await saveAnswer(mockCtx, {
        interviewId: "interview-1",
        questionIndex: 0,
        question: "Test question",
        answer: "Updated answer",
        followUpCount: 1,
      });

      expect(result).toBe("existing-answer");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("existing-answer", {
        answer: "Updated answer",
        followUpCount: 1,
      });
    });
  });

  describe("getAnswers", () => {
    it("returns answers ordered by questionIndex", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue(mockAnswers),
      });

      const result = await getAnswers(mockCtx, { interviewId: "interview-1" });

      expect(result).toEqual(mockAnswers);
    });

    it("returns empty array when interview not found", async () => {
      mockCtx.db.get.mockResolvedValue(null);

      const result = await getAnswers(mockCtx, { interviewId: "not-found" });

      expect(result).toEqual([]);
    });
  });

  describe("incrementQuestionIndex", () => {
    it("increments question index", async () => {
      mockCtx.db.get.mockResolvedValue({ ...mockInterview, currentQuestionIndex: 0 });
      mockCtx.db.patch.mockResolvedValue(undefined);

      const result = await incrementQuestionIndex(mockCtx, { interviewId: "interview-1" });

      expect(result).toEqual({ success: true });
      expect(mockCtx.db.patch).toHaveBeenCalledWith("interview-1", {
        currentQuestionIndex: 1,
        updatedAt: expect.any(Number),
      });
    });
  });
});

describe("Convex - Reports", () => {
  let mockCtx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mockCtx = createMockCtx();
    vi.clearAllMocks();
  });

  describe("saveReport", () => {
    it("creates new report when none exists", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        unique: vi.fn().mockResolvedValue(null),
      });
      mockCtx.db.insert.mockResolvedValue("new-report-id");

      const result = await saveReport(mockCtx, {
        interviewId: "interview-1",
        overallScore: 85,
        strengths: ["Strength 1"],
        weaknesses: ["Weakness 1"],
        recommendations: ["Rec 1"],
        questionScores: [{ questionIndex: 0, score: 90, feedback: "Great" }],
      });

      expect(result).toBe("new-report-id");
      expect(mockCtx.db.insert).toHaveBeenCalledWith("reports", expect.objectContaining({
        interviewId: "interview-1",
        userId: mockAuthUserId,
        overallScore: 85,
      }));
    });

    it("updates existing report", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        unique: vi.fn().mockResolvedValue({ _id: "existing-report" }),
      });
      mockCtx.db.patch.mockResolvedValue(undefined);

      const result = await saveReport(mockCtx, {
        interviewId: "interview-1",
        overallScore: 90,
        strengths: ["Strength 2"],
        weaknesses: ["Weakness 2"],
        recommendations: ["Rec 2"],
        questionScores: [{ questionIndex: 0, score: 95, feedback: "Excellent" }],
      });

      expect(result).toBe("existing-report");
      expect(mockCtx.db.patch).toHaveBeenCalledWith("existing-report", expect.objectContaining({
        overallScore: 90,
        strengths: ["Strength 2"],
      }));
    });
  });

  describe("getReport", () => {
    it("returns report when user owns interview", async () => {
      mockCtx.db.get.mockResolvedValue(mockInterview);
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        unique: vi.fn().mockResolvedValue(mockReport),
      });

      const result = await getReport(mockCtx, { interviewId: "interview-1" });

      expect(result).toEqual(mockReport);
    });

    it("returns null when interview not found", async () => {
      mockCtx.db.get.mockResolvedValue(null);

      const result = await getReport(mockCtx, { interviewId: "not-found" });

      expect(result).toBeNull();
    });
  });

  describe("getUserReports", () => {
    it("returns user reports ordered by createdAt desc", async () => {
      mockCtx.db.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([mockReport]),
      });

      const result = await getUserReports(mockCtx);

      expect(result).toEqual([mockReport]);
    });
  });
});