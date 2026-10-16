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

export default http;
