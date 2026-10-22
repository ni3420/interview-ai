// AI Service client.
//
// Requests go through a Clerk-authenticated same-origin proxy at `/api/ai/*`
// (see `src/app/api/ai/[...path]/route.ts`), which attaches the server-only
// `X-API-Key` header and forwards to the Python FastAPI service. The browser
// never sees the AI service URL or API key.
//
// Types below mirror the Python Pydantic schemas in
// `apps/ai-service/app/schemas/interview.py` (snake_case fields).
//
// `NEXT_PUBLIC_AI_SERVICE_URL` is an optional escape hatch for local
// development against a directly-reachable service; leave it unset to use the
// authenticated proxy. Read lazily so tests can override it per case.
function getApiBase(): string {
  return (process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "/api/ai").replace(
    /\/$/,
    ""
  );
}

export interface InterviewPlanRequest {
  resume_text: string;
  job_description: string;
}

export interface InterviewPlanResponse {
  questions: string[];
  focus_areas: string[];
}

export interface PreviousQA {
  question: string;
  answer: string;
}

export interface NextQuestionRequest {
  resume_text: string;
  job_description: string;
  current_question: string;
  user_answer: string;
  question_index: number;
  previous_qa: PreviousQA[];
}

export interface NextQuestionResponse {
  question: string;
  is_follow_up: boolean;
  follow_up_count: number;
}

export interface EvaluateInterviewRequest {
  resume_text: string;
  job_description: string;
  qa_pairs: PreviousQA[];
}

export interface QuestionScore {
  question_index: number;
  score: number;
  feedback: string;
}

export interface EvaluateInterviewResponse {
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  question_scores: QuestionScore[];
}

async function postJson<TResponse>(
  path: string,
  body: unknown
): Promise<TResponse> {
  const response = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Forward the proxy's message (for example a timeout) so the UI can show a
    // useful error instead of only the status code.
    const detail = await response
      .json()
      .then((body: { error?: unknown } | null) =>
        typeof body?.error === "string" ? `: ${body.error}` : ""
      )
      .catch(() => "");
    throw new Error(`AI service request failed (${response.status})${detail}`);
  }

  return response.json() as Promise<TResponse>;
}

export async function generateInterviewPlan(
  request: InterviewPlanRequest
): Promise<InterviewPlanResponse> {
  return postJson<InterviewPlanResponse>("/v1/interviews/plan", request);
}

export async function generateNextQuestion(
  request: NextQuestionRequest
): Promise<NextQuestionResponse> {
  return postJson<NextQuestionResponse>("/v1/interviews/next-question", request);
}

export async function evaluateInterview(
  request: EvaluateInterviewRequest
): Promise<EvaluateInterviewResponse> {
  return postJson<EvaluateInterviewResponse>("/v1/interviews/evaluate", request);
}
