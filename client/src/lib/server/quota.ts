import type { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

export type CostlyAction =
  | "resume_process"
  | "report_generate"
  | "stream_agent"
  | "stream_token";

interface QuotaDecision {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Charges one unit of the caller's server-owned budget before an expensive
 * action is scheduled.
 *
 * Fails closed: if the counter cannot be read or written, the action is not
 * started, so an outage cannot be used to bypass the spend cap.
 */
export async function enforceQuota(
  convex: ConvexHttpClient,
  action: CostlyAction
): Promise<NextResponse | null> {
  let decision: QuotaDecision;
  try {
    decision = (await convex.mutation(api.rateLimits.consume, {
      action,
    })) as QuotaDecision;
  } catch (error) {
    console.error("Quota check failed", error);
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  if (decision.allowed) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((decision.retryAfterMs ?? 60_000) / 1000)
  );
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}
