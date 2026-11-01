import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { signServiceRequest } from "@/lib/service-auth";

// Convex and the AI service client need the Node.js runtime.
export const runtime = "nodejs";

// Server-only configuration; the signing secret never reaches the browser.
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY;

/**
 * Asks the AI service to remove the interviewer from the interview's call.
 *
 * The agent waits for the call to end, but a call only ends once every
 * participant has left, so the paid realtime session would otherwise stay open
 * after the candidate finishes. Ownership is checked server-side, exactly as
 * for dispatch.
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

  const interview = await convex
    .query(api.interviews.getInterview, { interviewId })
    .catch(() => null);

  if (!interview) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const callId = `interview-${interviewId}`;
  const endpoint = `${AI_SERVICE_URL}/v1/realtime/leave?call_id=${encodeURIComponent(
    callId
  )}`;

  try {
    const { pathname, search } = new URL(endpoint);
    const { timestamp, signature } = await signServiceRequest({
      secret: AI_SERVICE_API_KEY,
      method: "POST",
      pathWithQuery: `${pathname}${search}`,
      payload: "",
    });
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Service-Timestamp": timestamp,
        "X-Service-Signature": signature,
      },
      signal: AbortSignal.timeout(10_000),
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to stop the AI interviewer", error);
    return NextResponse.json({ error: "agent_unavailable" }, { status: 502 });
  }
}
