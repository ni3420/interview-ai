import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { generateInterviewPlan, generateNextQuestion, evaluateInterview } from "../src/lib/ai-service";

const server = setupServer(
  http.post("http://localhost:8000/v1/interviews/plan", () => {
    return HttpResponse.json({
      questions: ["Q1", "Q2"],
      focus_areas: ["React", "TypeScript"],
    });
  }),
  http.post("http://localhost:8000/v1/interviews/next-question", () => {
    return HttpResponse.json({
      question: "Follow up question",
      is_follow_up: true,
      follow_up_count: 1,
    });
  }),
  http.post("http://localhost:8000/v1/interviews/evaluate", () => {
    return HttpResponse.json({
      overall_score: 85,
      strengths: ["Strong technical skills"],
      weaknesses: ["Could improve communication"],
      recommendations: ["Practice explaining concepts"],
      question_scores: [
        { question_index: 0, score: 90, feedback: "Great answer" },
      ],
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AI Service Client", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_AI_SERVICE_URL = "http://localhost:8000";
    process.env.AI_SERVICE_API_KEY = "test-key";
  });

  describe("generateInterviewPlan", () => {
    it("calls API and returns plan", async () => {
      const result = await generateInterviewPlan({
        resume_text: "Test resume",
        job_description: "Test JD",
      });

      expect(result).toEqual({
        questions: ["Q1", "Q2"],
        focus_areas: ["React", "TypeScript"],
      });
    });

    it("throws on API error", async () => {
      server.use(
        http.post("http://localhost:8000/v1/interviews/plan", () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      await expect(generateInterviewPlan({
        resume_text: "Test resume",
        job_description: "Test JD",
      })).rejects.toThrow();
    });
  });

  describe("generateNextQuestion", () => {
    it("calls API and returns next question", async () => {
      const result = await generateNextQuestion({
        resume_text: "Test resume",
        job_description: "Test JD",
        current_question: "Q1",
        user_answer: "Answer 1",
        question_index: 0,
        previous_qa: [],
      });

      expect(result).toEqual({
        question: "Follow up question",
        is_follow_up: true,
        follow_up_count: 1,
      });
    });
  });

  describe("evaluateInterview", () => {
    it("calls API and returns evaluation", async () => {
      const result = await evaluateInterview({
        resume_text: "Test resume",
        job_description: "Test JD",
        qa_pairs: [{ question: "Q1", answer: "A1" }],
      });

      expect(result).toEqual({
        overall_score: 85,
        strengths: ["Strong technical skills"],
        weaknesses: ["Could improve communication"],
        recommendations: ["Practice explaining concepts"],
        question_scores: [
          { question_index: 0, score: 90, feedback: "Great answer" },
        ],
      });
    });
  });
});