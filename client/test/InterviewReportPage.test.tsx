import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InterviewReportPage from "@/app/interview/[id]/report/page";

const state = vi.hoisted(() => ({
  interview: undefined as unknown,
  answers: undefined as unknown,
  report: undefined as unknown,
  job: undefined as unknown,
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
      case "reports:getReportJob":
        return state.job;
      default:
        return undefined;
    }
  },
}));

const interview = {
  _id: "interview-1",
  userId: "user-1",
  resumeText: "Test resume",
  jobDescription: "Test job description",
  status: "completed" as const,
  plan: { questions: ["Q1"] },
  currentQuestionIndex: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const answer = {
  _id: "answer-1",
  interviewId: "interview-1",
  questionIndex: 0,
  question: "Q1",
  answer: "A1",
  followUpCount: 0,
  createdAt: Date.now(),
};

const job = {
  _id: "report-job-1",
  interviewId: "interview-1",
  userId: "user-1",
  status: "queued" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const report = {
  _id: "report-1",
  interviewId: "interview-1",
  userId: "user-1",
  overallScore: 85,
  strengths: ["Strong React knowledge"],
  weaknesses: ["Could add metrics"],
  recommendations: ["Practice system design"],
  questionScores: [{ questionIndex: 0, score: 90, feedback: "Great" }],
  createdAt: Date.now(),
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.interview = interview;
  state.answers = [answer];
  state.report = undefined;
  state.job = undefined;

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: "queued" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InterviewReportPage", () => {
  it("shows progress while the background job is queued", () => {
    state.job = job;

    render(<InterviewReportPage />);

    expect(screen.getByText("Analyzing Performance")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the job error and retries through the API route", async () => {
    state.job = { ...job, status: "failed", error: "Quota exhausted" };

    render(<InterviewReportPage />);

    expect(screen.getByText("Failed to Generate Report")).toBeInTheDocument();
    expect(screen.getByText("Quota exhausted")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /retry generation/i })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/report/generate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ interviewId: "interview-1" }),
        })
      )
    );
  });

  it("renders a completed report from Convex", () => {
    state.report = report;
    state.job = { ...job, status: "completed" };

    render(<InterviewReportPage />);

    expect(screen.getByText("Performance Report")).toBeInTheDocument();
    expect(screen.getByText("Strong React knowledge")).toBeInTheDocument();
    expect(screen.getByText("Practice system design")).toBeInTheDocument();
    expect(screen.getByText("Great")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
