import { auth, currentUser } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { enforceQuota } from "@/lib/server/quota";

// Stream's server SDK needs the Node.js runtime.
export const runtime = "nodejs";

const CALL_TYPE = "default";
const TOKEN_VALIDITY_SECONDS = 60 * 60;

/** Stream's SDK default is 3000 ms, which a cold `next dev` compile can blow. */
const STREAM_TIMEOUT_MS = 10_000;

/** Mirrors the room's answer-write policy: two retries survive a short blip. */
const UPSTREAM_RETRY_DELAYS_MS = [400, 1200];

/**
 * Retries an idempotent upstream read.
 *
 * Only used for calls that are safe to repeat: Clerk token/profile lookups and
 * Stream's get-or-create, which is keyed by a stable call id.
 */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= UPSTREAM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delay = UPSTREAM_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Issues a short-lived Stream video token for the authenticated owner of an
// interview. The Stream API secret never leaves the server.
export async function POST(request: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const apiKey = process.env.STREAM_API_KEY;
  const secret = process.env.STREAM_API_SECRET;
  if (!apiKey || !secret) {
    return NextResponse.json(
      { error: "stream_not_configured" },
      { status: 503 }
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex is not configured" },
      { status: 503 }
    );
  }

  // A Clerk API failure throws rather than returning null, so it is caught here
  // instead of surfacing as an unhandled 500 the room cannot explain.
  let convexToken: string | null;
  try {
    convexToken = await withRetry(() => getToken({ template: "convex" }));
  } catch (error) {
    console.error("Failed to read the Convex token from Clerk", error);
    return NextResponse.json(
      { error: "auth_service_unavailable" },
      { status: 502 }
    );
  }
  if (!convexToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(convexToken);

  // Authorization: the caller must own the interview before any token is issued.
  let interview: unknown = null;
  try {
    interview = await convex.query(api.interviews.getInterview, {
      interviewId,
    });
  } catch (error) {
    console.error("Failed to load interview for token request", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!interview) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Charged only after ownership, so a rejected request costs nobody a unit.
  const denied = await enforceQuota(convex, "stream_token");
  if (denied) return denied;

  // The profile only supplies the display name, so a Clerk failure degrades to
  // the fallback name rather than ending the interview attempt.
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    user = await withRetry(currentUser);
  } catch (error) {
    console.error("Failed to read the candidate profile from Clerk", error);
  }
  const streamUser = {
    id: userId,
    name: user?.fullName ?? user?.firstName ?? "Candidate",
    image: user?.imageUrl,
  };

  const stream = new StreamClient(apiKey, secret, { timeout: STREAM_TIMEOUT_MS });
  const callId = `interview-${interviewId}`;

  try {
    await withRetry(() =>
      stream.video.call(CALL_TYPE, callId).getOrCreate({
        data: {
          created_by_id: streamUser.id,
          members: [{ user_id: streamUser.id, role: "admin" }],
        },
      })
    );
  } catch (error) {
    console.error("Failed to create Stream call", error);
    return NextResponse.json(
      { error: "Failed to create interview call" },
      { status: 502 }
    );
  }

  const token = stream.generateUserToken({
    user_id: streamUser.id,
    validity_in_seconds: TOKEN_VALIDITY_SECONDS,
  });

  return NextResponse.json({
    apiKey,
    token,
    callType: CALL_TYPE,
    callId,
    user: streamUser,
  });
}
