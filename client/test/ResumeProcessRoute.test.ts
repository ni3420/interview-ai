import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  setAuth: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  queueRemove: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn(() => ({
    setAuth: mocks.setAuth,
    query: mocks.query,
    mutation: mocks.mutation,
  })),
}));

// The route only talks to the queue through this module, so the Redis
// connection itself is never opened during unit tests. The payload builder is
// kept real so the contract test also exercises it.
vi.mock("@/lib/resume-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resume-queue")>();
  return {
    ...actual,
    getResumeQueue: () => ({
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

const context = {
  resumeId: "resume-1",
  userId: "user-1",
  fileUrl: "http://convex.test/api/storage/resume-1",
  interviewId: "interview-1",
  jobDescription: "A sufficiently long job description used for contract testing.",
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
  mocks.queueAdd.mockResolvedValue({ id: "resume:resume-1" });
  mocks.queueGetJob.mockResolvedValue(null);
  mocks.queueRemove.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RESUME_FETCH_HOST;
});

describe("POST /api/resume/process", () => {
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
    mocks.query.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(404);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("marks the resume processing and enqueues a stable job", async () => {
    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "processing" });

    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), {
      resumeId: "resume-1",
      status: "processing",
    });

    // The job payload matches the worker's validated contract.
    const [name, payload, options] = mocks.queueAdd.mock.calls[0];
    expect(name).toBe("process-resume");
    expect(payload).toEqual({
      resumeId: "resume-1",
      interviewId: "interview-1",
      userId: "user-1",
      fileUrl: "http://convex.test/api/storage/resume-1",
      jobDescription: context.jobDescription,
    });
    expect(options).toEqual({ jobId: "interview-1-resume-1" });
  });

  it("clears a terminally failed job so a retry re-enqueues", async () => {
    mocks.queueGetJob.mockResolvedValue(existingJob("failed"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    expect(mocks.queueRemove).toHaveBeenCalledOnce();
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "process-resume",
      expect.anything(),
      { jobId: "interview-1-resume-1" }
    );
  });

  it("re-runs a previously completed job", async () => {
    mocks.queueGetJob.mockResolvedValue(existingJob("completed"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    expect(mocks.queueRemove).toHaveBeenCalledOnce();
    expect(mocks.queueAdd).toHaveBeenCalledOnce();
  });

  it("leaves an in-flight job in place", async () => {
    mocks.queueGetJob.mockResolvedValue(existingJob("active"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    expect(mocks.queueRemove).not.toHaveBeenCalled();
    expect(mocks.queueAdd).toHaveBeenCalledOnce();
  });

  it("marks the resume failed when enqueueing fails", async () => {
    mocks.queueAdd.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(502);
    expect(mocks.mutation).toHaveBeenLastCalledWith(expect.anything(), {
      resumeId: "resume-1",
      status: "failed",
    });
  });

  it("rewrites the file host when RESUME_FETCH_HOST is set", async () => {
    process.env.RESUME_FETCH_HOST = "host.docker.internal";

    const response = await POST(jsonRequest({ interviewId: "interview-1" }));

    expect(response.status).toBe(202);
    const [, payload] = mocks.queueAdd.mock.calls[0];
    expect(payload.fileUrl).toBe(
      "http://host.docker.internal/api/storage/resume-1"
    );
  });
});
