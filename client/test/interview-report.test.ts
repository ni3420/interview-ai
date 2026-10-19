import { describe, it, expect } from "vitest";
import {
  buildQuestionBreakdown,
  mergeAnswersByQuestion,
} from "@/lib/interview-report";

describe("buildQuestionBreakdown", () => {
  it("uses the actual question asked, not the static plan", () => {
    const breakdown = buildQuestionBreakdown(
      [
        {
          questionIndex: 0,
          question: "Tell me about your React experience (follow-up).",
          answer: "I built several apps.",
        },
      ],
      [],
      ["Generic planned question"]
    );

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].question).toBe(
      "Tell me about your React experience (follow-up)."
    );
  });

  it("keeps every answered question in interview order, including follow-ups", () => {
    const breakdown = buildQuestionBreakdown(
      [
        { questionIndex: 2, question: "Follow-up two?", answer: "a2" },
        { questionIndex: 0, question: "First question?", answer: "a0" },
        { questionIndex: 1, question: "Follow-up one?", answer: "a1" },
      ],
      [],
      ["Planned 0", "Planned 1"]
    );

    expect(breakdown.map((item) => item.questionIndex)).toEqual([0, 1, 2]);
    expect(breakdown.map((item) => item.question)).toEqual([
      "First question?",
      "Follow-up one?",
      "Follow-up two?",
    ]);
  });

  it("matches scores by exact question index", () => {
    const breakdown = buildQuestionBreakdown(
      [
        { questionIndex: 0, question: "Q0", answer: "A0" },
        { questionIndex: 1, question: "Q1", answer: "A1" },
      ],
      [
        { questionIndex: 1, score: 55, feedback: "weak" },
        { questionIndex: 0, score: 95, feedback: "great" },
      ]
    );

    expect(breakdown[0].score).toBe(95);
    expect(breakdown[0].feedback).toBe("great");
    expect(breakdown[1].score).toBe(55);
    expect(breakdown[1].feedback).toBe("weak");
  });

  it("falls back to positional alignment when the model returns 1-based indices", () => {
    const breakdown = buildQuestionBreakdown(
      [
        { questionIndex: 0, question: "Q0", answer: "A0" },
        { questionIndex: 1, question: "Q1", answer: "A1" },
      ],
      [
        { questionIndex: 1, score: 90, feedback: "first answer" },
        { questionIndex: 2, score: 60, feedback: "second answer" },
      ]
    );

    expect(breakdown[0].score).toBe(90);
    expect(breakdown[0].feedback).toBe("first answer");
    expect(breakdown[1].score).toBe(60);
    expect(breakdown[1].feedback).toBe("second answer");
  });

  it("leaves scores undefined instead of misaligning a partial score set", () => {
    const breakdown = buildQuestionBreakdown(
      [
        { questionIndex: 0, question: "Q0", answer: "A0" },
        { questionIndex: 1, question: "Q1", answer: "A1" },
        { questionIndex: 2, question: "Q2", answer: "A2" },
      ],
      [{ questionIndex: 9, score: 70, feedback: "only one" }]
    );

    expect(breakdown.every((item) => item.score === undefined)).toBe(true);
  });

  it("falls back to the plan question then a positional label when the answer has no text", () => {
    const breakdown = buildQuestionBreakdown(
      [
        { questionIndex: 0, question: "   ", answer: "A0" },
        { questionIndex: 1, question: "", answer: "A1" },
      ],
      [],
      ["Planned question 0"]
    );

    expect(breakdown[0].question).toBe("Planned question 0");
    expect(breakdown[1].question).toBe("Question 2");
  });

  it("returns an empty list when there are no answers", () => {
    expect(
      buildQuestionBreakdown(
        [],
        [{ questionIndex: 0, score: 90, feedback: "orphan" }]
      )
    ).toEqual([]);
  });

  it("merges consecutive answers that share the same question", () => {
    const breakdown = buildQuestionBreakdown([
      { questionIndex: 0, question: "What is React?", answer: "A UI" },
      { questionIndex: 1, question: "What is React?", answer: "library." },
    ]);

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].question).toBe("What is React?");
    expect(breakdown[0].answer).toBe("A UI library.");
  });

  it("keeps distinct questions as separate entries", () => {
    const breakdown = buildQuestionBreakdown([
      { questionIndex: 0, question: "Q1", answer: "A1" },
      { questionIndex: 1, question: "Q2", answer: "A2" },
    ]);

    expect(breakdown).toHaveLength(2);
  });
});

describe("mergeAnswersByQuestion", () => {
  it("collapses consecutive same-question rows and preserves order", () => {
    const merged = mergeAnswersByQuestion([
      { questionIndex: 2, question: "Q2", answer: "A2" },
      { questionIndex: 0, question: "Q1", answer: "part 1" },
      { questionIndex: 1, question: "Q1", answer: "part 2" },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      questionIndex: 0,
      question: "Q1",
      answer: "part 1 part 2",
    });
    expect(merged[1]).toMatchObject({ questionIndex: 2, question: "Q2" });
  });

  it("does not merge rows with an empty question", () => {
    const merged = mergeAnswersByQuestion([
      { questionIndex: 0, question: "", answer: "A1" },
      { questionIndex: 1, question: "", answer: "A2" },
    ]);

    expect(merged).toHaveLength(2);
  });
});
