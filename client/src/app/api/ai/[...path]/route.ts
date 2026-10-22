import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// Server-only configuration. Never expose these to the browser.
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY;

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Local CPU inference (the Ollama fallback) can take minutes. Keep this
// aligned with the AI service's generation budget instead of aborting at 60 s.
const AI_REQUEST_TIMEOUT_MS = intEnv("AI_REQUEST_TIMEOUT_MS", 900_000);

// Only the explicitly supported AI endpoints may be proxied.
const ALLOWED_PATHS = new Set([
  "v1/interviews/plan",
  "v1/interviews/next-question",
  "v1/interviews/evaluate",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const joined = path.join("/");
  if (!ALLOWED_PATHS.has(joined)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!AI_SERVICE_API_KEY) {
    return NextResponse.json(
      { error: "AI service is not configured" },
      { status: 503 }
    );
  }

  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${AI_SERVICE_URL}/${joined}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": AI_SERVICE_API_KEY,
      },
      body,
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      (error as { name?: string } | null)?.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "AI service timed out" : "AI service unavailable" },
      { status: timedOut ? 504 : 502 }
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
