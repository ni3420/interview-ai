import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test";
process.env.STREAM_API_KEY = "stream-key";
process.env.STREAM_API_SECRET = "stream-secret";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getToken: vi.fn(),
  setAuth: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  getOrCreate: vi.fn(),
  generateUserToken: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn(() => ({
    setAuth: mocks.setAuth,
    query: mocks.query,
    mutation: mocks.mutation,
  })),
}));

vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn(() => ({
    video: { call: () => ({ getOrCreate: mocks.getOrCreate }) },
    generateUserToken: mocks.generateUserToken,
  })),
}));

type RouteHandler = (request: unknown) => Promise<Response>;

let POST: RouteHandler;
let StreamClientMock: ReturnType<typeof vi.fn>;

function jsonRequest(body: unknown) {
  return { json: async () => body };
}

beforeAll(async () => {
  ({ POST } = (await import("@/app/api/stream/token/route")) as unknown as {
    POST: RouteHandler;
  });
  const sdk = (await import("@stream-io/node-sdk")) as unknown as {
    StreamClient: ReturnType<typeof vi.fn>;
  };
  StreamClientMock = sdk.StreamClient;
});

beforeEach(() => {
  mocks.auth.mockResolvedValue({
    userId: "clerk-user-1",
    getToken: mocks.getToken,
  });
  mocks.getToken.mockResolvedValue("convex-token");
  mocks.currentUser.mockResolvedValue({
    fullName: null,
    firstName: "Ada",
    imageUrl: "https://img.test/ada.png",
  });
  mocks.query.mockResolvedValue({ _id: "interview-1", userId: "user-1" });
  mocks.mutation.mockResolvedValue({ allowed: true, remaining: 59 });
  mocks.getOrCreate.mockResolvedValue({});
  mocks.generateUserToken.mockReturnValue("stream-token");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/stream/token", () => {
  it("rejects unauthenticated callers before charging or calling Stream", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null, getToken: vi.fn() });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(401);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("requires an interviewId", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("returns 404 for an interview the caller does not own, without charging", async () => {
    mocks.query.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(404);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("returns 429 and issues no token when the budget is spent", async () => {
    mocks.mutation.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 90_000,
    });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
    expect(mocks.generateUserToken).not.toHaveBeenCalled();
  });

  it("fails closed when the budget cannot be read", async () => {
    mocks.mutation.mockRejectedValueOnce(new Error("convex down"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(503);
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
    expect(mocks.generateUserToken).not.toHaveBeenCalled();
  });

  it("charges the token budget, then returns a Stream token", async () => {
    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), {
      action: "stream_token",
    });
    expect(mocks.getOrCreate).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      apiKey: "stream-key",
      token: "stream-token",
      callId: "interview-interview-1",
    });
  });

  it("passes a Stream timeout longer than the SDK's 3s default", async () => {
    await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(StreamClientMock.mock.calls[0]?.[2]).toEqual({ timeout: 10_000 });
  });

  it("retries a transient Clerk token failure and still issues the token", async () => {
    vi.useFakeTimers();
    try {
      mocks.getToken
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValue("convex-token");

      const pending = POST(jsonRequest({ interviewId: "interview-1" }));
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await pending;

      expect(response.status).toBe(200);
      expect(mocks.getToken).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a typed 502 when Clerk keeps failing, without charging the budget", async () => {
    vi.useFakeTimers();
    try {
      mocks.getToken.mockRejectedValue(new Error("fetch failed"));

      const pending = POST(jsonRequest({ interviewId: "interview-1" }));
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await pending;
      const body = (await response.json()) as { error?: string };

      expect(response.status).toBe(502);
      expect(body.error).toBe("auth_service_unavailable");
      expect(mocks.getToken).toHaveBeenCalledTimes(3);
      expect(mocks.mutation).not.toHaveBeenCalled();
      expect(mocks.getOrCreate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries Stream's get-or-create, which is idempotent per call id", async () => {
    mocks.getOrCreate
      .mockRejectedValueOnce(new Error("aborted after 3000ms"))
      .mockResolvedValue({});

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(200);
    expect(mocks.getOrCreate).toHaveBeenCalledTimes(2);
    expect(mocks.generateUserToken).toHaveBeenCalledTimes(1);
  });

  it("degrades to the fallback name when the Clerk profile lookup fails", async () => {
    vi.useFakeTimers();
    try {
      mocks.currentUser.mockRejectedValue(new Error("fetch failed"));

      const pending = POST(jsonRequest({ interviewId: "interview-1" }));
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await pending;
      const body = (await response.json()) as { user?: { name?: string } };

      expect(response.status).toBe(200);
      expect(body.user?.name).toBe("Candidate");
    } finally {
      vi.useRealTimers();
    }
  });
});
