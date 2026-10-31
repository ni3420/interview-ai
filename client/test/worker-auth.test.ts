import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeWorkerRequest,
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  verifyWorkerSignature,
  type WorkerSignatureInput,
} from "../../convex/_lib/workerAuth";

// jsdom does not expose Web Crypto's subtle interface; the Convex runtime does.
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});

// Must match the vector produced by the worker signer. The signature is
// computed with Node/Web Crypto over:
// timestamp\nPOST\n/worker/report-start\nsha256_hex(body)
const VECTOR = {
  secret: "test-worker-service-key-0123456789abcdef",
  timestamp: "1767225600",
  method: "POST",
  pathWithQuery: "/worker/report-start",
  body: '{"interviewId":"interview-123","version":1,"attempt":1}',
  signature:
    "909d743b6134bb6acf1fc4b2093d06738b2f72515a97d4360532025aea6850b1",
};
const NOW_SECONDS = 1767225600;

function verify(
  overrides: Partial<WorkerSignatureInput> = {}
): Promise<boolean> {
  return verifyWorkerSignature({
    ...VECTOR,
    nowSeconds: NOW_SECONDS,
    ...overrides,
  });
}

describe("verifyWorkerSignature", () => {
  it("uses the shared header names", () => {
    expect(WORKER_TIMESTAMP_HEADER).toBe("X-Service-Timestamp");
    expect(WORKER_SIGNATURE_HEADER).toBe("X-Service-Signature");
  });

  it("accepts a valid signed request", async () => {
    expect(await verify()).toBe(true);
  });

  it("rejects the old key-only scheme", async () => {
    expect(await verify({ timestamp: null, signature: null })).toBe(false);
    expect(await verify({ timestamp: VECTOR.timestamp, signature: null })).toBe(
      false
    );
    expect(await verify({ timestamp: null, signature: VECTOR.signature })).toBe(
      false
    );
  });

  it("rejects a tampered body", async () => {
    expect(
      await verify({ body: '{"interviewId":"interview-999","version":1,"attempt":1}' })
    ).toBe(false);
  });

  it("rejects a tampered signature, path, method and secret", async () => {
    expect(await verify({ signature: "0".repeat(64) })).toBe(false);
    expect(await verify({ pathWithQuery: "/worker/report-complete" })).toBe(
      false
    );
    expect(await verify({ method: "GET" })).toBe(false);
    expect(await verify({ secret: "another-worker-secret" })).toBe(false);
    expect(await verify({ secret: "" })).toBe(false);
  });

  it("rejects timestamps outside the tolerance window", async () => {
    expect(await verify({ nowSeconds: NOW_SECONDS + 300 })).toBe(true);
    expect(await verify({ nowSeconds: NOW_SECONDS + 301 })).toBe(false);
    expect(await verify({ nowSeconds: NOW_SECONDS - 301 })).toBe(false);
  });

  it("rejects malformed timestamps", async () => {
    expect(await verify({ timestamp: "1e3" })).toBe(false);
    expect(await verify({ timestamp: "not-a-number" })).toBe(false);
  });
});

function workerRequest(
  path = VECTOR.pathWithQuery,
  body = VECTOR.body
): Request {
  return new Request(`https://example.convex.site${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [WORKER_TIMESTAMP_HEADER]: VECTOR.timestamp,
      [WORKER_SIGNATURE_HEADER]: VECTOR.signature,
    },
    body,
  });
}

describe("authorizeWorkerRequest", () => {
  it("accepts a signed request and leaves the body readable", async () => {
    const request = workerRequest();
    expect(
      await authorizeWorkerRequest(request, VECTOR.secret, NOW_SECONDS)
    ).toBe(true);
    // The handler still needs the body after the verifier clones it.
    expect(await request.json()).toEqual(JSON.parse(VECTOR.body));
  });

  it("rejects an unsigned request", async () => {
    const request = new Request(
      `https://example.convex.site${VECTOR.pathWithQuery}`,
      { method: "POST", body: VECTOR.body }
    );
    expect(
      await authorizeWorkerRequest(request, VECTOR.secret, NOW_SECONDS)
    ).toBe(false);
  });

  it("rejects a signature replayed against another path", async () => {
    const request = workerRequest("/worker/report-complete");
    expect(
      await authorizeWorkerRequest(request, VECTOR.secret, NOW_SECONDS)
    ).toBe(false);
  });

  it("fails closed without a configured secret", async () => {
    expect(
      await authorizeWorkerRequest(workerRequest(), undefined, NOW_SECONDS)
    ).toBe(false);
    expect(await authorizeWorkerRequest(workerRequest(), "", NOW_SECONDS)).toBe(
      false
    );
  });
});
