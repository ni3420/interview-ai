import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InterviewReviewPage from "@/app/interview/[id]/review/page";

const state = vi.hoisted(() => ({
  interview: undefined as unknown,
  answers: undefined as unknown,
  report: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "interview-1" }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    switch (ref as string) {
      case "interviews:getInterview":
        return state.interview;
      case "answers:getAnswers":
        return state.answers;
      case "reports:getReport":
        return state.report;
      default:
        return undefined;
    }
  },
}));

const interview = {
  _id: "interview-1",
  jobDescription: "Senior frontend engineer",
  status: "completed" as const,
  plan: { questions: [] },
};

describe("InterviewReviewPage", () => {
  beforeEach(() => {
    state.interview = interview;
    state.answers = [];
    state.report = null;
  });

  it("shows the overall score, strengths and weaknesses for a legacy report", () => {
    state.report = {
      overallScore: 85,
      strengths: ["Strong React knowledge"],
      weaknesses: ["Could add metrics"],
      questionScores: [],
    };

    render(<InterviewReviewPage />);

    expect(screen.getByText("85 / 100")).toBeInTheDocument();
    expect(screen.getByText("Strong overall performance")).toBeInTheDocument();
    expect(screen.getByText("Strong React knowledge")).toBeInTheDocument();
    expect(screen.getByText("Could add metrics")).toBeInTheDocument();
  });

  it("uses the rubric scale and explains empty lists for a rubric report", () => {
    state.report = {
      overallScore: 7.5,
      scoreScale: 10,
      strengths: [],
      weaknesses: [],
      questionScores: [],
    };

    render(<InterviewReviewPage />);

    expect(screen.getByText("7.5 / 10")).toBeInTheDocument();
    expect(screen.getByText("Competent overall performance")).toBeInTheDocument();
    expect(
      screen.getByText("No strengths were recorded for this report.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No weaknesses were recorded for this report.")
    ).toBeInTheDocument();
  });

  it("omits the performance summary when no report exists yet", () => {
    render(<InterviewReviewPage />);

    expect(screen.queryByText("Performance Summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/View Full Report/)).not.toBeInTheDocument();
  });
});
