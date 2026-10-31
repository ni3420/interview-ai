import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAuthUserId } from "./auth";

export const QUOTA_ACTIONS = [
  "interview_create",
  "resume_process",
  "report_generate",
  "stream_agent",
] as const;

export type QuotaAction = (typeof QUOTA_ACTIONS)[number];

const MINUTE = 60 * 1000;

// Server-owned budgets. The client sends only the action name, never a limit.
export const QUOTA_POLICIES: Record<
  QuotaAction,
  { limit: number; windowMs: number }
> = {
  interview_create: { limit: 10, windowMs: 60 * MINUTE },
  resume_process: { limit: 6, windowMs: 60 * MINUTE },
  report_generate: { limit: 10, windowMs: 60 * MINUTE },
  stream_agent: { limit: 20, windowMs: 60 * MINUTE },
};

export const quotaActionValidator = v.union(
  v.literal("interview_create"),
  v.literal("resume_process"),
  v.literal("report_generate"),
  v.literal("stream_agent")
);

export type QuotaDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

/**
 * Counts one unit against the user's fixed window for `action`.
 *
 * Runs inside the caller's mutation, so the read-modify-write is serialized by
 * Convex and two concurrent requests cannot both take the last unit.
 */
export async function consumeQuota(
  ctx: MutationCtx,
  userId: Id<"users">,
  action: QuotaAction
): Promise<QuotaDecision> {
  const policy = QUOTA_POLICIES[action];
  const key = `${userId}:${action}`;
  const now = Date.now();

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (existing && now - existing.windowStart < policy.windowMs) {
    if (existing.count >= policy.limit) {
      return {
        allowed: false,
        retryAfterMs: existing.windowStart + policy.windowMs - now,
      };
    }
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      updatedAt: now,
    });
    return { allowed: true, remaining: policy.limit - existing.count - 1 };
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      windowStart: now,
      count: 1,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("rateLimits", {
      key,
      windowStart: now,
      count: 1,
      updatedAt: now,
    });
  }

  return { allowed: true, remaining: policy.limit - 1 };
}

/**
 * Charges one unit for a costly server action. Called by the Next.js enqueue
 * routes with the caller's Convex token; identity comes from the JWT.
 */
export const consume = mutation({
  args: { action: quotaActionValidator },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    return await consumeQuota(ctx, userId, args.action as QuotaAction);
  },
});
