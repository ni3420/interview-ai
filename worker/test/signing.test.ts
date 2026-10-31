import { describe, expect, it } from "bun:test";
import http from "node:http";
import { postSignedJson, signServiceRequest } from "../src/http";

const VECTOR = {
  secret: "test-service-secret-0123456789abcdef",
  timestamp: 1767225600,
  method: "POST",
  pathWithQuery: "/v1/interviews/plan",
  payload: '{"resume_text":"a","job_description":"b"}',
  signature:
    "9c79e51b1fc834cea825a15f88a017bf7ef4906951262743b92d25ea8fee790b",
};

describe("signServiceRequest", () => {
  it("matches the fixed cross-language vector", () => {
    const signed = signServiceRequest({
      secret: VECTOR.secret,
      method: VECTOR.method,
      pathWithQuery: VECTOR.pathWithQuery,
      payload: VECTOR.payload,
      timestampSeconds: VECTOR.timestamp,
    });
    expect(signed).toEqual({
      timestamp: String(VECTOR.timestamp),
      signature: VECTOR.signature,
    });
  });

  it("binds the signature to the body, path and method", () => {
    const base = {
      secret: VECTOR.secret,
      method: "POST",
      pathWithQuery: VECTOR.pathWithQuery,
      payload: VECTOR.payload,
      timestampSeconds: VECTOR.timestamp,
    };
    const signature = (overrides: Partial<typeof base>) =>
      signServiceRequest({ ...base, ...overrides }).signature;

    expect(signature({ payload: `${VECTOR.payload} ` })).not.toBe(VECTOR.signature);
    expect(signature({ pathWithQuery: "/v1/interviews/report" })).not.toBe(
      VECTOR.signature
    );
    expect(signature({ method: "GET" })).not.toBe(VECTOR.signature);
    expect(signature({ secret: "another-secret" })).not.toBe(VECTOR.signature);
  });

  it("sends the signed headers and exact payload", async () => {
    let received: { headers: http.IncomingHttpHeaders; body: string } | null =
      null;
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = {
          headers: request.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        };
        response.setHeader("Content-Type", "application/json");
        response.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("test server did not bind a port");
    }

    try {
      const result = await postSignedJson<{ ok: boolean }>(
        `http://127.0.0.1:${address.port}/v1/test`,
        { hello: "world" },
        VECTOR.secret,
        5_000,
        VECTOR.timestamp
      );
      expect(result).toEqual({ ok: true });
    } finally {
      server.close();
    }

    expect(received).not.toBeNull();
    const captured = received as unknown as {
      headers: http.IncomingHttpHeaders;
      body: string;
    };
    expect(captured.body).toBe('{"hello":"world"}');
    const expected = signServiceRequest({
      secret: VECTOR.secret,
      method: "POST",
      pathWithQuery: "/v1/test",
      payload: captured.body,
      timestampSeconds: VECTOR.timestamp,
    });
    expect(captured.headers["x-service-timestamp"]).toBe(expected.timestamp);
    expect(captured.headers["x-service-signature"]).toBe(expected.signature);
    expect(captured.headers["x-api-key"]).toBeUndefined();
  });
});
