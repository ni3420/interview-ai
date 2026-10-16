import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { buildResumeJob, getResumeQueue } from "@/lib/resume-queue";

// Convex and the queue client need the Node.js runtime.
export const runtime = "nodejs";

// When the AI service runs in a container, it cannot reach a Convex URL that
// points at the host loopback. Set RESUME_FETCH_HOST (e.g. "host.docker.internal")
// to rewrite the file URL host before handing it to the worker.
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
 * Enqueues resume processing for an interview.
 *
 * Ownership is enforced in Convex before any work is scheduled. The job is
 * pushed onto the BullMQ `resume-processing` queue where the worker extracts,
 * chunks, embeds (Ollama), indexes into Qdrant, generates a resume-grounded
 * interview plan and persists the result back to Convex. The lobby observes
 * progress through Convex rather than waiting on this request.
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
    const queue = getResumeQueue();
    const job = buildResumeJob(context, toServiceReachableUrl(context.fileUrl));
    // A stable, colon-free job id makes re-submitting the same resume for the
    // same interview idempotent while a job is pending or active. (BullMQ
    // rejects custom ids containing ":".)
    await queue.add("process-resume", job, {
      jobId: `${context.interviewId}-${context.resumeId}`,
    });
  } catch (error) {
    console.error("Failed to enqueue resume processing", error);
    await convex
      .mutation(api.resume.markResumeStatus, {
        resumeId: context.resumeId,
        status: "failed",
      })
      .catch(() => {});
    return NextResponse.json({ error: "enqueue_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "processing" }, { status: 202 });
}
