import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InterviewReportPage from "@/app/interview/[id]/report/page";

const state = vi.hoisted(() => ({
  interview: undefined as unknown,
  answers: undefined as unknown,
  segments: undefined as unknown,
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
      case "answers:getTranscriptSegments":
        return state.segments;
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
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const legacyReport = {
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

const rubricReport = {
  _id: "report-2",
  interviewId: "interview-1",
  userId: "user-1",
  overallScore: 7.5,
  summary: "Solid backend answers with room to improve trade-off discussion.",
  strengths: ["Explained indexing clearly"],
  weaknesses: ["Missing complexity analysis"],
  recommendations: ["Practise complexity analysis"],
  questionScores: [
    {
      questionIndex: 0,
      score: 8,
      status: "answered" as const,
      question: "Explain database indexes.",
      answer: "An index is a lookup structure.",
      expectedAnswer: "A data structure that speeds lookups.",
      expectedAnswerSource: "ai_generated" as const,
      evidence: ["An index is a lookup structure."],
      criteria: [
        {
          id: "technical_correctness",
          label: "Technical correctness",
          score: 8.5,
          weight: 30,
          evidence: ["An index is a lookup structure."],
          comment: "Accurate definition.",
        },
      ],
      strengths: ["Clear definition"],
      missingPoints: ["B-tree details"],
      feedback: "Good foundation; add structure details.",
    },
    {
      questionIndex: 1,
      score: null,
      status: "not_evaluable" as const,
      question: "How do you handle migrations?",
      answer: "unverified background chatter",
      notEvaluableReason: "Candidate speech was not reliably transcribed.",
      expectedAnswerSource: "unavailable" as const,
      evidence: [],
      criteria: [],
      strengths: [],
      missingPoints: [],
      feedback: "",
    },
    {
      questionIndex: 2,
      score: null,
      status: "unanswered" as const,
      question: "Describe a rollback.",
      answer: "",
      expectedAnswerSource: "unavailable" as const,
      evidence: [],
      criteria: [],
      strengths: [],
      missingPoints: [],
      feedback: "",
    },
  ],
  version: 2,
  schemaVersion: "report-v1",
  scoreScale: 10,
  completionStatus: "partial" as const,
  counts: {
    questions: 3,
    answered: 1,
    partial: 0,
    unanswered: 1,
    notEvaluable: 1,
    evaluated: 1,
    excludedSegments: 2,
  },
  skillScores: {
    technicalKnowledge: 7,
    problemSolving: 6.5,
    communication: 6,
    conceptualUnderstanding: 5.5,
    relevance: 9,
  },
  qualityWarnings: [
    {
      code: "background_audio_excluded",
      message: "Two background segments were excluded from scoring.",
    },
  ],
  createdAt: Date.now(),
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.interview = interview;
  state.answers = [answer];
  state.segments = [];
  state.report = null;
  state.job = null;

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
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
    state.job = {
      ...job,
      status: "failed",
      error: "The evaluation service is temporarily unavailable. Please retry.",
    };

    render(<InterviewReportPage />);

    expect(screen.getByText("Failed to Generate Report")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The evaluation service is temporarily unavailable. Please retry."
      )
    ).toBeInTheDocument();

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

  it("shows an empty state when there is nothing to evaluate", () => {
    state.answers = [];
    state.segments = [];

    render(<InterviewReportPage />);

    expect(screen.getByText("No report yet")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders a legacy 0-100 report without rubric sections", () => {
    state.report = legacyReport;
    state.job = { ...job, status: "completed" };

    render(<InterviewReportPage />);

    expect(screen.getByText("Performance Report")).toBeInTheDocument();
    expect(screen.getByText("85 / 100")).toBeInTheDocument();
    expect(screen.getByText("Strong React knowledge")).toBeInTheDocument();
    expect(screen.getByText("Practice system design")).toBeInTheDocument();
    expect(screen.getByText("Great")).toBeInTheDocument();
    expect(screen.queryByText("Skill assessment")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the rubric report with counts, skills, evidence, and warnings", () => {
    state.report = rubricReport;
    state.job = { ...job, status: "completed" };

    render(<InterviewReportPage />);

    expect(screen.getByText("7.5 / 10")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Solid backend answers with room to improve trade-off discussion."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Partial evaluation")).toBeInTheDocument();
    expect(screen.getByText("Skill assessment")).toBeInTheDocument();
    expect(screen.getByText("Technical knowledge")).toBeInTheDocument();
    expect(screen.getByText("7.0 / 10")).toBeInTheDocument();
    expect(screen.getByText("Explain database indexes.")).toBeInTheDocument();
    expect(
      screen.getByText(/AI-generated reference, not used for scoring/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("A data structure that speeds lookups.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Good foundation; add structure details.")
    ).toBeInTheDocument();
    expect(screen.getByText("B-tree details")).toBeInTheDocument();
    expect(screen.getByText("Clear definition")).toBeInTheDocument();
    expect(
      screen.getAllByText(/An index is a lookup structure\./)
    ).toHaveLength(2);
    expect(
      screen.getByText(/2 background or unattributed transcript segments were excluded/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Two background segments were excluded from scoring.")
    ).toBeInTheDocument();
  });

  it("never shows unverified speech as a candidate answer", () => {
    state.report = rubricReport;
    state.job = { ...job, status: "completed" };

    render(<InterviewReportPage />);

    expect(
      screen.getByText("Candidate speech was not reliably transcribed.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("unverified background chatter")
    ).not.toBeInTheDocument();
  });

  it("requests a new version without removing the visible report", async () => {
    state.report = rubricReport;
    state.job = { ...job, status: "completed" };

    render(<InterviewReportPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /regenerate report/i })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/report/generate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ interviewId: "interview-1", regenerate: true }),
        })
      )
    );
    expect(screen.getByText("7.5 / 10")).toBeInTheDocument();
  });

  it("keeps the current report visible when a newer version fails", async () => {
    state.report = legacyReport;
    state.job = {
      ...job,
      status: "failed",
      error: "The evaluation service is temporarily unavailable. Please retry.",
    };

    render(<InterviewReportPage />);

    expect(screen.getByText("85 / 100")).toBeInTheDocument();
    expect(
      screen.getByText("A newer report could not be generated.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/report/generate",
        expect.objectContaining({
          body: JSON.stringify({ interviewId: "interview-1", regenerate: true }),
        })
      )
    );
  });
});
