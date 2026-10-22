import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { buildReportJob, getReportQueue } from "@/lib/report-queue";

// Convex and the queue client need the Node.js runtime.
export const runtime = "nodejs";

interface RequestReportState {
  status:
    | "completed"
    | "queued"
    | "processing"
    | "failed"
    | "no_answers"
    | "not_found";
  shouldEnqueue: boolean;
}

/**
 * Starts asynchronous report generation for an interview.
 *
 * Convex owns the job status that the report page observes. This route only
 * authenticates the caller, asks Convex whether work is needed, and pushes a
 * BullMQ job carrying the interview id. The worker fetches the resume text and
 * answers from Convex, calls the AI service, and writes the result back.
 *
 * Keeping the long-running evaluation out of the request means the browser
 * never waits on (or times out) a multi-minute local-model call.
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

  let state: RequestReportState;
  try {
    state = (await convex.mutation(api.reports.requestReport, {
      interviewId,
    })) as RequestReportState;
  } catch (error) {
    console.error("Failed to request report generation", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (state.status === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (state.status === "no_answers") {
    return NextResponse.json(
      { error: "No answers to evaluate" },
      { status: 400 }
    );
  }
  if (state.status === "completed") {
    return NextResponse.json({ status: "completed" });
  }
  if (!state.shouldEnqueue) {
    return NextResponse.json({ status: state.status }, { status: 202 });
  }

  try {
    const queue = getReportQueue();
    // A stable, colon-free id makes repeated requests idempotent while a job is
    // pending or active. (BullMQ rejects custom ids containing ":".)
    const jobId = `report-${interviewId}`;

    // BullMQ ignores `add` when a finished job with this id is still retained.
    // Clear a terminal job so an explicit retry actually runs.
    const existing = await queue.getJob(jobId);
    if (existing) {
      const jobState = await existing.getState();
      if (jobState === "failed" || jobState === "completed") {
        await existing.remove();
      }
    }

    await queue.add("evaluate-interview", buildReportJob(interviewId), {
      jobId,
    });
  } catch (error) {
    console.error("Failed to enqueue report generation", error);
    await convex
      .mutation(api.reports.markReportJobFailed, {
        interviewId,
        error: "Failed to enqueue report generation",
      })
      .catch(() => {});
    return NextResponse.json({ error: "enqueue_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "queued" }, { status: 202 });
}
