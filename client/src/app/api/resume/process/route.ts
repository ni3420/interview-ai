import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

// Convex and the AI service SDKs need the Node.js runtime.
export const runtime = "nodejs";

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY;

// When the AI service runs in a container, it cannot reach a Convex URL that
// points at the host loopback. Set RESUME_FETCH_HOST (e.g. "host.docker.internal")
// to rewrite the file URL host before handing it to the service.
const PROCESS_TIMEOUT_MS = 120_000;

function toServiceReachableUrl(rawUrl: string): string {
  const host = process.env.RESUME_FETCH_HOST;
  if (!host) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.hostname = host;
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Kicks off resume processing for an interview.
 *
 * The authenticated owner's resume PDF is extracted, chunked, embedded (Ollama)
 * and indexed into Qdrant by the Python AI service. Ownership is enforced in
 * Convex before any file URL is resolved, and the resume status is moved
 * through processing → ready/failed so the lobby reflects real progress.
 */
export async function POST(request: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex is not configured" },
      { status: 503 }
    );
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
    return NextResponse.json(
      { error: "interviewId is required" },
      { status: 400 }
    );
  }

  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(convexToken);

  // Authorization: the caller must own the interview and its resume.
  const context = await convex.query(api.resume.getProcessingContext, {
    interviewId,
  });
  if (!context) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await convex.mutation(api.resume.markResumeStatus, {
    resumeId: context.resumeId,
    status: "processing",
  });

  try {
    const response = await fetch(`${AI_SERVICE_URL}/v1/resumes/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": AI_SERVICE_API_KEY,
      },
      body: JSON.stringify({
        resume_id: context.resumeId,
        user_id: context.userId,
        file_url: toServiceReachableUrl(context.fileUrl),
      }),
      signal: AbortSignal.timeout(PROCESS_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "Resume processing failed",
        response.status,
        detail.slice(0, 200)
      );
      await convex.mutation(api.resume.markResumeStatus, {
        resumeId: context.resumeId,
        status: "failed",
      });
      return NextResponse.json({ error: "processing_failed" }, { status: 502 });
    }

    const result = (await response.json()) as { chunk_count?: number };
    await convex.mutation(api.resume.markResumeStatus, {
      resumeId: context.resumeId,
      status: "ready",
    });

    return NextResponse.json({
      status: "ready",
      chunkCount: result.chunk_count ?? 0,
    });
  } catch (error) {
    console.error("Resume processing request failed", error);
    await convex
      .mutation(api.resume.markResumeStatus, {
        resumeId: context.resumeId,
        status: "failed",
      })
      .catch(() => {});
    return NextResponse.json({ error: "processing_failed" }, { status: 502 });
  }
}
