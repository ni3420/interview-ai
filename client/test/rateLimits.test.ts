import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCtx, mockAuthUserId } from "./helpers";

vi.mock("../../convex/auth", () => ({
  requireAuthUserId: vi.fn().mockResolvedValue(mockAuthUserId),
}));

import { requireAuthUserId } from "../../convex/auth";
import * as RateLimits from "../../convex/rateLimits";

const unwrap = <R,>(ref: unknown) =>
  (ref as unknown as { _handler: (ctx: unknown, args?: unknown) => R })
    ._handler;

const consume = unwrap<Promise<unknown>>(RateLimits.consume);

function quotaLookup(row: unknown) {
  return {
    withIndex: vi.fn().mockReturnThis(),
    unique: vi.fn().mockResolvedValue(row),
  };
}

describe("Convex - rate limits", () => {
  let mockCtx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mockCtx = createMockCtx();
    vi.clearAllMocks();
  });

  it("inserts the first unit under a user-scoped key", async () => {
    mockCtx.db.query.mockReturnValue(quotaLookup(null));

    const result = await consume(mockCtx, { action: "report_generate" });

    expect(result).toEqual({ allowed: true, remaining: 9 });
    expect(mockCtx.db.insert).toHaveBeenCalledWith(
      "rateLimits",
      expect.objectContaining({
        key: `${mockAuthUserId}:report_generate`,
        count: 1,
      })
    );
  });

  it("increments an active window", async () => {
    mockCtx.db.query.mockReturnValue(
      quotaLookup({
        _id: "limit-1",
        windowStart: Date.now(),
        count: 3,
      })
    );

    const result = await consume(mockCtx, { action: "resume_process" });

    expect(result).toEqual({ allowed: true, remaining: 2 });
    expect(mockCtx.db.patch).toHaveBeenCalledWith("limit-1", {
      count: 4,
      updatedAt: expect.any(Number),
    });
  });

  it("denies once the window budget is spent", async () => {
    mockCtx.db.query.mockReturnValue(
      quotaLookup({
        _id: "limit-1",
        windowStart: Date.now(),
        count: RateLimits.QUOTA_POLICIES.report_generate.limit,
      })
    );

    const result = (await consume(mockCtx, {
      action: "report_generate",
    })) as { allowed: boolean; retryAfterMs: number };

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(mockCtx.db.patch).not.toHaveBeenCalled();
    expect(mockCtx.db.insert).not.toHaveBeenCalled();
  });

  it("starts a fresh window after the old one expires", async () => {
    mockCtx.db.query.mockReturnValue(
      quotaLookup({
        _id: "limit-1",
        windowStart: Date.now() - 61 * 60 * 1000,
        count: RateLimits.QUOTA_POLICIES.report_generate.limit,
      })
    );

    const result = await consume(mockCtx, { action: "report_generate" });

    expect(result).toEqual({ allowed: true, remaining: 9 });
    expect(mockCtx.db.patch).toHaveBeenCalledWith("limit-1", {
      windowStart: expect.any(Number),
      count: 1,
      updatedAt: expect.any(Number),
    });
  });

  it("keys the budget to the authenticated user", async () => {
    vi.mocked(requireAuthUserId).mockResolvedValueOnce(
      "other-user" as never
    );
    mockCtx.db.query.mockReturnValue(quotaLookup(null));

    await consume(mockCtx, { action: "stream_agent" });

    expect(mockCtx.db.insert).toHaveBeenCalledWith(
      "rateLimits",
      expect.objectContaining({ key: "other-user:stream_agent" })
    );
  });
});
