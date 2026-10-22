import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

process.env.AI_SERVICE_URL = "http://ai.test";
process.env.AI_SERVICE_API_KEY = "test-key";
process.env.AI_REQUEST_TIMEOUT_MS = "1234";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

type RouteHandler = (
  request: { text: () => Promise<string> },
  context: { params: Promise<{ path: string[] }> }
) => Promise<Response>;

let POST: RouteHandler;
let fetchMock: ReturnType<typeof vi.fn>;

function request(body = "{}") {
  return { text: async () => body };
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function upstream(body = "{}", status = 200) {
  return {
    status,
    headers: { get: () => "application/json" },
    text: async () => body,
  };
}

beforeAll(async () => {
  ({ POST } = (await import("@/app/api/ai/[...path]/route")) as unknown as {
    POST: RouteHandler;
  });
});

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "user-1" });
  fetchMock = vi.fn().mockResolvedValue(upstream());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/ai/[...path]", () => {
  it("forwards allowed endpoints with the server-only key", async () => {
    const response = await POST(
      request('{"qa_pairs":[]}'),
      context(["v1", "interviews", "evaluate"])
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ai.test/v1/interviews/evaluate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "test-key" }),
      })
    );
  });

  it("uses the configured AI timeout instead of a 60 second cutoff", async () => {
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(new AbortController().signal);

    await POST(request(), context(["v1", "interviews", "evaluate"]));

    expect(timeout).toHaveBeenCalledWith(1234);
  });

  it("returns 504 when the upstream times out", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError")
    );

    const response = await POST(
      request(),
      context(["v1", "interviews", "evaluate"])
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "AI service timed out",
    });
  });

  it("returns 502 for other upstream failures", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));

    const response = await POST(
      request(),
      context(["v1", "interviews", "evaluate"])
    );

    expect(response.status).toBe(502);
  });

  it("rejects unauthenticated callers", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(
      request(),
      context(["v1", "interviews", "evaluate"])
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses endpoints outside the allowlist", async () => {
    const response = await POST(request(), context(["v1", "secrets"]));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
