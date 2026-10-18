import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

// Convex and the AI service client need the Node.js runtime.
export const runtime = "nodejs";

const CALL_TYPE = "default";

// Server-only configuration. The API key never reaches the browser. Note we
// use AI_SERVICE_URL (not NEXT_PUBLIC_AI_SERVICE_URL): the public var is the
// browser's escape hatch in `lib/ai-service.ts`, and setting it would make the
// browser call the AI service directly without the X-API-Key header.
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY;

interface InterviewRecord {
  resumeText?: string;
  jobDescription: string;
  plan?: { questions?: string[] } | null;
}

/**
 * Dispatches the realtime AI interviewer into an interview's Stream call.
 *
 * The browser only sends the interview id: ownership is verified against
 * Convex and the grounded context (resume, job description, plan) is read
 * server-side, so a candidate can never inject instructions into the agent.
 * The agent runs asynchronously in the AI service, so this returns quickly.
 */
export async function POST(request: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex is not configured" }, { status: 503 });
  }

  if (!AI_SERVICE_API_KEY) {
    return NextResponse.json(
      { error: "ai_service_not_configured" },
      { status: 503 }
    );
  }

  let interviewId: unknown;
  try {
    ({ interviewId } = (await request.json()) as { interviewId?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof interviewId !== "string" || interviewId.length === 0) {
    return NextResponse.json({ error: "interviewId is required" }, { status: 400 });
  }

  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(convexToken);

  // Authorization: the caller must own the interview.
  const interview = (await convex
    .query(api.interviews.getInterview, { interviewId })
    .catch(() => null)) as InterviewRecord | null;

  if (!interview) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${AI_SERVICE_URL}/v1/realtime/join-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": AI_SERVICE_API_KEY,
      },
      body: JSON.stringify({
        call_id: `interview-${interviewId}`,
        call_type: CALL_TYPE,
        interview_id: interviewId,
        resume_text: interview.resumeText ?? "",
        job_description: interview.jobDescription,
        questions: interview.plan?.questions ?? [],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("Failed to dispatch AI interviewer", error);
    return NextResponse.json({ error: "agent_unavailable" }, { status: 502 });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
