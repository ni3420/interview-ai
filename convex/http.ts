import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Machine-to-machine endpoint used by the resume-processing worker. It is
// authenticated with a shared service key (never exposed to browsers) so only
// the worker can move resume state and persist interview plans.
const http = httpRouter();

function isAuthorizedWorker(request: Request): boolean {
  const configured = process.env.WORKER_SERVICE_KEY;
  if (!configured) return false;
  const provided = request.headers.get("X-Worker-Key");
  return typeof provided === "string" && provided.length > 0 && provided === configured;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

function optionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const COMPLETION_STATUSES = new Set([
  "complete",
  "partial",
  "insufficient_evidence",
]);

http.route({
  path: "/worker/resume-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorizedWorker(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const questions = asStringArray((body.plan as { questions?: unknown })?.questions);
    const focusAreas = asStringArray((body.plan as { focusAreas?: unknown })?.focusAreas);
    if (!questions || !focusAreas || typeof body.resumeText !== "string") {
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(internal.worker.completeResumeProcessing, {
        resumeId: optionalId(body.resumeId) as never,
        interviewId: optionalId(body.interviewId) as never,
        resumeText: body.resumeText,
        chunkCount: typeof body.chunkCount === "number" ? body.chunkCount : 0,
        plan: { questions, focusAreas },
      });
    } catch (error) {
      // Invalid document ids from a non-worker caller are a client error. Never
      // leak the internal validation detail back to the caller.
      console.error("worker/resume-complete rejected", error);
      return new Response("Invalid payload", { status: 400 });
    }

    return jsonResponse({ success: true });
  }),
});

http.route({
  path: "/worker/resume-failed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorizedWorker(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // An empty body is acceptable; we still mark the resume failed.
    }

    try {
      await ctx.runMutation(internal.worker.failResumeProcessing, {
        resumeId: optionalId(body.resumeId) as never,
        interviewId: optionalId(body.interviewId) as never,
        error: typeof body.error === "string" ? body.error : undefined,
      });
    } catch (error) {
      console.error("worker/resume-failed rejected", error);
      return new Response("Invalid payload", { status: 400 });
    }

    return jsonResponse({ success: true });
  }),
});

http.route({
  path: "/worker/report-context",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorizedWorker(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const interviewId = optionalId(body.interviewId);
    if (!interviewId) {
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      const context = await ctx.runQuery(internal.worker.getReportContext, {
        interviewId: interviewId as never,
      });
      if (!context) return new Response("Not found", { status: 404 });
      return jsonResponse(context);
    } catch (error) {
      console.error("worker/report-context rejected", error);
      return new Response("Invalid payload", { status: 400 });
    }
  }),
});

http.route({
  path: "/worker/report-start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorizedWorker(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const interviewId = optionalId(body.interviewId);
    if (!interviewId) {
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(internal.worker.startReportJob, {
        interviewId: interviewId as never,
        version: optionalNumber(body.version),
        attempt: optionalNumber(body.attempt),
      });
    } catch (error) {
      console.error("worker/report-start rejected", error);
      return new Response("Invalid payload", { status: 400 });
    }

    return jsonResponse({ success: true });
  }),
});

http.route({
  path: "/worker/report-complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorizedWorker(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const interviewId = optionalId(body.interviewId);
    const strengths = asStringArray(body.strengths);
    const weaknesses = asStringArray(body.weaknesses);
    const recommendations = asStringArray(body.recommendations);
    const rawScores = body.questionScores;
    const overallScore =
      body.overallScore === null
        ? null
        : typeof body.overallScore === "number"
          ? body.overallScore
          : undefined;
    const completionStatus =
      typeof body.completionStatus === "string" &&
      COMPLETION_STATUSES.has(body.completionStatus)
        ? body.completionStatus
        : undefined;

    if (
      !interviewId ||
      overallScore === undefined ||
      !strengths ||
      !weaknesses ||
      !recommendations ||
      !Array.isArray(rawScores) ||
      (body.completionStatus !== undefined && !completionStatus) ||
      (body.counts !== undefined && typeof body.counts !== "object") ||
      (body.skillScores !== undefined && typeof body.skillScores !== "object") ||
      (body.qualityWarnings !== undefined && !Array.isArray(body.qualityWarnings))
    ) {
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(internal.worker.completeReportJob, {
        interviewId: interviewId as never,
        overallScore,
        strengths,
        weaknesses,
        recommendations,
        // Convex argument validators enforce the full question shape; an
        // invalid score or evidence entry is rejected below as a 400.
        questionScores: rawScores as never,
        version: optionalNumber(body.version),
        attempt: optionalNumber(body.attempt),
        summary: typeof body.summary === "string" ? body.summary : undefined,
        completionStatus: completionStatus as never,
        counts: body.counts as never,
        skillScores: body.skillScores as never,
        qualityWarnings: body.qualityWarnings as never,
        promptVersion:
          typeof body.promptVersion === "string" ? body.promptVersion : undefined,
        rubricVersion:
          typeof body.rubricVersion === "string" ? body.rubricVersion : undefined,
      });
    } catch (error) {
      console.error("worker/report-complete rejected", error);
      return new Response("Invalid payload", { status: 400 });
    }

    return jsonResponse({ success: true });
  }),
});

http.route({
  path: "/worker/report-failed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isAuthorizedWorker(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // An empty body is acceptable; we still mark the job failed.
    }

    const interviewId = optionalId(body.interviewId);
    if (!interviewId) {
      return new Response("Invalid payload", { status: 400 });
    }

    try {
      await ctx.runMutation(internal.worker.failReportJob, {
        interviewId: interviewId as never,
        error: typeof body.error === "string" ? body.error : undefined,
        errorCode:
          typeof body.errorCode === "string" ? body.errorCode : undefined,
        version: optionalNumber(body.version),
      });
    } catch (error) {
      console.error("worker/report-failed rejected", error);
      return new Response("Invalid payload", { status: 400 });
    }

    return jsonResponse({ success: true });
  }),
});

export default http;
