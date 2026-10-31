import { describe, expect, it } from "bun:test";
import { REPORT_QUEUE_NAME, reportJobSchema } from "../src/job";
import {
  REPORT_ERROR_MESSAGES,
  ReportJobError,
  validateReport,
  type ReportEvaluation,
} from "../src/report-processor";

describe("report job contract", () => {
  it("uses the stable queue name shared with the producer", () => {
    expect(REPORT_QUEUE_NAME).toBe("report-evaluation");
  });

  it("accepts an interview id with an optional version", () => {
    expect(reportJobSchema.parse({ interviewId: "interview-1" })).toEqual({
      interviewId: "interview-1",
    });
    expect(
      reportJobSchema.parse({ interviewId: "interview-1", version: 2 })
    ).toEqual({ interviewId: "interview-1", version: 2 });
    expect(reportJobSchema.safeParse({}).success).toBe(false);
    expect(reportJobSchema.safeParse({ interviewId: "" }).success).toBe(false);
    expect(
      reportJobSchema.safeParse({ interviewId: "interview-1", version: 0 })
        .success
    ).toBe(false);
  });
});

function validReport(): ReportEvaluation {
  const answer = "A closure captures variables from its lexical scope.";
  return {
    overall_score: 8,
    summary: "Solid answer.",
    strengths: ["Clear"],
    weaknesses: ["No example"],
    recommendations: ["Add examples"],
    question_scores: [
      {
        question_index: 0,
        question: "What is a closure?",
        answer,
        status: "answered",
        score: 8,
        feedback: "Add an example.",
        expected_answer: "A function plus its environment.",
        expected_answer_source: "ai_generated",
        not_evaluable_reason: null,
        evidence: ["captures variables from its lexical scope"],
        criteria: [
          { id: "technical_correctness", label: "Technical correctness", score: 8, weight: 30, evidence: ["captures variables from its lexical scope"], comment: "" },
          { id: "relevance", label: "Relevance", score: 8, weight: 20, evidence: ["captures variables from its lexical scope"], comment: "" },
          { id: "conceptual_understanding", label: "Conceptual understanding", score: 8, weight: 15, evidence: ["captures variables from its lexical scope"], comment: "" },
          { id: "completeness", label: "Completeness", score: 8, weight: 15, evidence: ["captures variables from its lexical scope"], comment: "" },
          { id: "problem_solving", label: "Problem-solving / practical experience", score: 8, weight: 10, evidence: ["captures variables from its lexical scope"], comment: "" },
          { id: "communication", label: "Communication clarity", score: 8, weight: 10, evidence: ["captures variables from its lexical scope"], comment: "" },
        ],
        strengths: ["Clear"],
        missing_points: ["No example"],
        link_reasons: [],
      },
    ],
    skill_scores: {
      technical_knowledge: 8,
      problem_solving: 8,
      communication: 8,
      conceptual_understanding: 8,
      relevance: 8,
    },
    counts: {
      questions: 1,
      answered: 1,
      partial: 0,
      unanswered: 0,
      not_evaluable: 0,
      evaluated: 1,
      excluded_segments: 1,
    },
    completion_status: "complete",
    quality_warnings: [],
    prompt_version: "report-v3",
    rubric_version: "rubric-v1",
    score_scale: 10,
  };
}

function expectInvalid(report: ReportEvaluation, message: string) {
  expect(() => validateReport(report)).toThrow(ReportJobError);
  expect(() => validateReport(report)).toThrow(message);
}

describe("validateReport", () => {
  it("accepts a report whose scores follow the rubric and evidence is real", () => {
    expect(() => validateReport(validReport())).not.toThrow();
  });

  it("rejects evidence that is not a verbatim part of the answer", () => {
    const report = validReport();
    report.question_scores[0].criteria[0].evidence = [
      "a closure is a garbage-collected heap object",
    ];
    expectInvalid(report, "not in the answer");
  });

  it("rejects a question score that does not follow from the criteria", () => {
    const report = validReport();
    report.question_scores[0].score = 9.5;
    expectInvalid(report, "does not match its criteria");
  });

  it("rejects an overall score that is not the mean of evaluated questions", () => {
    const report = validReport();
    report.overall_score = 6;
    expectInvalid(report, "Overall score does not match");
  });

  it("rejects counts that do not match statuses", () => {
    const report = validReport();
    report.counts.evaluated = 0;
    expectInvalid(report, "counts do not match");
  });

  it("rejects a scored question without rubric criteria", () => {
    const report = validReport();
    report.question_scores[0].criteria = [];
    expectInvalid(report, "does not use the rubric");
  });

  it("allows an insufficient-evidence report with no scored questions", () => {
    const report = validReport();
    report.overall_score = null;
    report.counts = {
      questions: 1,
      answered: 0,
      partial: 0,
      unanswered: 0,
      not_evaluable: 1,
      evaluated: 0,
      excluded_segments: 2,
    };
    report.question_scores[0] = {
      ...report.question_scores[0],
      status: "not_evaluable",
      score: null,
      criteria: [],
      evidence: [],
    };
    expect(() => validateReport(report)).not.toThrow();
  });
});

describe("report error copy", () => {
  it("maps stable codes to user-safe messages", () => {
    expect(REPORT_ERROR_MESSAGES.invalid_model_output).toContain("did not match");
    expect(REPORT_ERROR_MESSAGES.ai_service_unavailable).toContain("unavailable");
    expect(REPORT_ERROR_MESSAGES.stale_report_job).toContain("newer");
  });
});
