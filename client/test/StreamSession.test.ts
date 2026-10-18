import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchStreamSession,
  StreamNotConfiguredError,
  type StreamSession,
} from "@/features/interview/room/stream-session";

function mockResponse({
  ok = true,
  status = 200,
  body = {},
}: {
  ok?: boolean;
  status?: number;
  body?: unknown;
} = {}): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const validSession: StreamSession = {
  apiKey: "key",
  token: "token",
  callType: "default",
  callId: "interview-1",
  user: { id: "user_1", name: "Candidate" },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchStreamSession", () => {
  it("POSTs the interview id and returns the validated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: validSession }));
    vi.stubGlobal("fetch", fetchMock);

    const session = await fetchStreamSession("interview-1");

    expect(session).toEqual(validSession);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stream/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ interviewId: "interview-1" }),
      })
    );
  });

  it("throws StreamNotConfiguredError when the room is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 503,
          body: { error: "stream_not_configured" },
        })
      )
    );

    await expect(fetchStreamSession("interview-1")).rejects.toBeInstanceOf(
      StreamNotConfiguredError
    );
  });

  it("throws a generic error for other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500 }))
    );

    await expect(fetchStreamSession("interview-1")).rejects.toThrow(
      /Could not start the interview room/i
    );
  });

  it("rejects a malformed session payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({ body: { apiKey: "key", token: "token" } })
      )
    );

    await expect(fetchStreamSession("interview-1")).rejects.toThrow(
      /malformed/i
    );
  });
});
