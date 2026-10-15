import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// Server-only configuration. Never expose these to the browser.
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY;

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
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 502 }
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
