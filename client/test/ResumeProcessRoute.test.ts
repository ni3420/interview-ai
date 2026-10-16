import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test";
process.env.AI_SERVICE_URL = "http://ai.test";
process.env.AI_SERVICE_API_KEY = "test-key";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setAuth: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn(() => ({
    setAuth: mocks.setAuth,
    query: mocks.query,
    mutation: mocks.mutation,
  })),
}));

type RouteHandler = (request: unknown) => Promise<Response>;

let POST: RouteHandler;

function jsonRequest(body: unknown) {
  return { json: async () => body };
}

const context = {
  resumeId: "resume-1",
  userId: "user-1",
  fileUrl: "http://convex.test/api/storage/resume-1",
  interviewId: "interview-1",
  jobDescription: "A sufficiently long job description for testing.",
};

beforeAll(async () => {
  ({ POST } = (await import("@/app/api/resume/process/route")) as unknown as {
    POST: RouteHandler;
  });
});

beforeEach(() => {
  mocks.auth.mockResolvedValue({
    userId: "clerk-user-1",
    getToken: vi.fn().mockResolvedValue("convex-token"),
  });
  mocks.query.mockResolvedValue(context);
  mocks.mutation.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/resume/process", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null, getToken: vi.fn() });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(401);
  });

  it("requires an interviewId", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the caller does not own the interview", async () => {
    mocks.query.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(404);
  });

  it("indexes the resume and marks it ready", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ chunk_count: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      chunkCount: 3,
    });

    // Sends the resume to the AI service with the service API key.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ai.test/v1/resumes/process");
    expect((init as RequestInit).headers).toMatchObject({
      "X-API-Key": "test-key",
    });
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload).toMatchObject({
      resume_id: "resume-1",
      user_id: "user-1",
    });

    // processing then ready.
    expect(mocks.mutation).toHaveBeenNthCalledWith(1, expect.anything(), {
      resumeId: "resume-1",
      status: "processing",
    });
    expect(mocks.mutation).toHaveBeenNthCalledWith(2, expect.anything(), {
      resumeId: "resume-1",
      status: "ready",
    });
  });

  it("marks the resume failed when the AI service errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => "unusable",
      })
    );

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(502);
    expect(mocks.mutation).toHaveBeenLastCalledWith(expect.anything(), {
      resumeId: "resume-1",
      status: "failed",
    });
  });

  it("rewrites the file host when RESUME_FETCH_HOST is set", async () => {
    process.env.RESUME_FETCH_HOST = "host.docker.internal";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ chunk_count: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    // Route reads env at call time for the host rewrite.
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.file_url).toBe(
      "http://host.docker.internal/api/storage/resume-1"
    );

    delete process.env.RESUME_FETCH_HOST;
  });
});
