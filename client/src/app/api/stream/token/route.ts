import { auth, currentUser } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

// Stream's server SDK needs the Node.js runtime.
export const runtime = "nodejs";

const CALL_TYPE = "default";
const TOKEN_VALIDITY_SECONDS = 60 * 60;

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

  const convexToken = await getToken({ template: "convex" });
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

  const user = await currentUser();
  const streamUser = {
    id: userId,
    name: user?.fullName ?? user?.firstName ?? "Candidate",
    image: user?.imageUrl,
  };

  const stream = new StreamClient(apiKey, secret);
  const callId = `interview-${interviewId}`;

  try {
    await stream.video.call(CALL_TYPE, callId).getOrCreate({
      data: {
        created_by_id: streamUser.id,
        members: [{ user_id: streamUser.id, role: "admin" }],
      },
    });
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
