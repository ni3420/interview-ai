import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setAuth: vi.fn(),
  mutation: vi.fn(),
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  queueRemove: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn(() => ({
    setAuth: mocks.setAuth,
    mutation: mocks.mutation,
  })),
}));

// The route only talks to the queue through this module, so Redis is never
// opened during unit tests. The payload builder is kept real to exercise the
// worker contract.
vi.mock("@/lib/report-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/report-queue")>();
  return {
    ...actual,
    getReportQueue: () => ({
      add: mocks.queueAdd,
      getJob: mocks.queueGetJob,
    }),
  };
});

type RouteHandler = (request: unknown) => Promise<Response>;

let POST: RouteHandler;

function jsonRequest(body: unknown) {
  return { json: async () => body };
}

function existingJob(state: string) {
  return {
    getState: vi.fn().mockResolvedValue(state),
    remove: mocks.queueRemove,
  };
}

beforeAll(async () => {
  ({ POST } = (await import("@/app/api/report/generate/route")) as unknown as {
    POST: RouteHandler;
  });
});

beforeEach(() => {
  mocks.auth.mockResolvedValue({
    userId: "clerk-user-1",
    getToken: vi.fn().mockResolvedValue("convex-token"),
  });
  mocks.mutation.mockResolvedValue({ status: "queued", shouldEnqueue: true });
  mocks.queueAdd.mockResolvedValue({ id: "report-interview-1" });
  mocks.queueGetJob.mockResolvedValue(null);
  mocks.queueRemove.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/report/generate", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null, getToken: vi.fn() });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(401);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("requires an interviewId", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller does not own the interview", async () => {
    mocks.mutation.mockResolvedValueOnce({
      status: "not_found",
      shouldEnqueue: false,
    });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(404);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("returns 400 when there are no answers", async () => {
    mocks.mutation.mockResolvedValueOnce({
      status: "no_answers",
      shouldEnqueue: false,
    });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(400);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("returns the existing report without enqueueing", async () => {
    mocks.mutation.mockResolvedValueOnce({
      status: "completed",
      shouldEnqueue: false,
    });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "completed" });
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("leaves an in-flight job untouched", async () => {
    mocks.mutation.mockResolvedValueOnce({
      status: "processing",
      shouldEnqueue: false,
    });

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "processing" });
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("enqueues a stable report job", async () => {
    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "queued" });
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "evaluate-interview",
      { interviewId: "interview-1" },
      { jobId: "report-interview-1" }
    );
  });

  it("clears a terminal job before re-enqueueing", async () => {
    mocks.queueGetJob.mockResolvedValue(existingJob("failed"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    expect(mocks.queueRemove).toHaveBeenCalledOnce();
    expect(mocks.queueAdd).toHaveBeenCalledOnce();
  });

  it("marks the job failed when enqueueing fails", async () => {
    mocks.mutation
      .mockResolvedValueOnce({ status: "queued", shouldEnqueue: true })
      .mockResolvedValueOnce({ success: true });
    mocks.queueAdd.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(502);
    expect(mocks.mutation).toHaveBeenLastCalledWith(expect.anything(), {
      interviewId: "interview-1",
      error: "Failed to enqueue report generation",
    });
  });
});
