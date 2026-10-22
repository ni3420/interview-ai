import { describe, expect, it } from "bun:test";
import { REPORT_QUEUE_NAME, reportJobSchema } from "../src/job";
import { alignQuestionScores } from "../src/report-processor";

describe("report job contract", () => {
  it("uses the stable queue name shared with the producer", () => {
    expect(REPORT_QUEUE_NAME).toBe("report-evaluation");
  });

  it("accepts an interview id and rejects an empty payload", () => {
    expect(reportJobSchema.parse({ interviewId: "interview-1" })).toEqual({
      interviewId: "interview-1",
    });
    expect(reportJobSchema.safeParse({}).success).toBe(false);
    expect(reportJobSchema.safeParse({ interviewId: "" }).success).toBe(false);
  });
});

describe("alignQuestionScores", () => {
  it("maps model positions back to the real answer indices", () => {
    const answers = [
      { questionIndex: 2 },
      { questionIndex: 5 },
      { questionIndex: 7 },
    ];
    const scores = [
      { question_index: 0, score: 80, feedback: "first" },
      { question_index: 2, score: 90, feedback: "third" },
    ];

    expect(alignQuestionScores(answers, scores)).toEqual([
      { questionIndex: 2, score: 80, feedback: "first" },
      { questionIndex: 7, score: 90, feedback: "third" },
    ]);
  });

  it("skips out-of-range, invalid and duplicate positions", () => {
    const answers = [{ questionIndex: 1 }, { questionIndex: 4 }];
    const scores = [
      { question_index: 2, score: 50, feedback: "out of range" },
      { question_index: -1, score: 50, feedback: "negative" },
      { question_index: 1.5, score: 50, feedback: "fractional" },
      { question_index: 1, score: 70, feedback: "valid" },
      { question_index: 1, score: 60, feedback: "duplicate" },
    ];

    expect(alignQuestionScores(answers, scores)).toEqual([
      { questionIndex: 4, score: 70, feedback: "valid" },
    ]);
  });

  it("sorts the aligned scores by question index", () => {
    const answers = [{ questionIndex: 9 }, { questionIndex: 3 }];
    const scores = [
      { question_index: 0, score: 70, feedback: "later" },
      { question_index: 1, score: 80, feedback: "earlier" },
    ];

    expect(alignQuestionScores(answers, scores)).toEqual([
      { questionIndex: 3, score: 80, feedback: "earlier" },
      { questionIndex: 9, score: 70, feedback: "later" },
    ]);
  });
});
