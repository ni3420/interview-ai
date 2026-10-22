import { vi } from "vitest";

export const createMockCtx = () => {
  const db = {
    insert: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    query: vi.fn().mockReturnThis(),
    withIndex: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    collect: vi.fn(),
    unique: vi.fn(),
    first: vi.fn(),
    take: vi.fn(),
  };

  return {
    db,
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({
        subject: "test-user-id",
        tokenIdentifier: "test-token",
      }),
    },
  };
};

export const mockAuthUserId = "test-user-id";

export const mockInterview = {
  _id: "interview-1",
  userId: mockAuthUserId,
  resumeText: "Test resume",
  jobDescription: "Test JD",
  status: "setup" as const,
  currentQuestionIndex: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const mockAnswers = [
  {
    _id: "answer-1",
    interviewId: "interview-1",
    questionIndex: 0,
    question: "Test question",
    answer: "Test answer",
    followUpCount: 0,
    createdAt: Date.now(),
  },
];

export const mockReport = {
  _id: "report-1",
  interviewId: "interview-1",
  userId: mockAuthUserId,
  overallScore: 85,
  strengths: ["Strength 1"],
  weaknesses: ["Weakness 1"],
  recommendations: ["Recommendation 1"],
  questionScores: [
    { questionIndex: 0, score: 90, feedback: "Great answer" },
  ],
  createdAt: Date.now(),
};

export const mockReportJob = {
  _id: "report-job-1",
  interviewId: "interview-1",
  userId: mockAuthUserId,
  status: "queued" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};