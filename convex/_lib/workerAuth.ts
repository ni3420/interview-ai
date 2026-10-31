/**
 * Verifies the HMAC the worker attaches to `/worker/*` HTTP actions.
 *
 * The canonical string is shared with `signServiceRequest` in
 * `worker/src/http.ts` and must stay byte-identical to the FastAPI scheme:
 * `timestamp\nMETHOD\n/path?query\nsha256_hex(body)`.
 *
 * Lives outside `http.ts` so it can be tested without booting Convex. Uses the
 * web-standard Web Crypto API, which the default Convex runtime provides.
 */

export const WORKER_TIMESTAMP_HEADER = "X-Service-Timestamp";
export const WORKER_SIGNATURE_HEADER = "X-Service-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function timingSafeEqual(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return difference === 0;
}

export interface WorkerSignatureInput {
  secret: string;
  method: string;
  pathWithQuery: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  /** Fixed clock for tests; production uses the current time. */
  nowSeconds?: number;
}

export async function verifyWorkerSignature(
  input: WorkerSignatureInput
): Promise<boolean> {
  if (!input.secret) return false;
  if (!input.timestamp || !input.signature) return false;
  // Reject forms like "1e3" that Number() would accept but Python's int()
  // (used by the FastAPI verifier) would not.
  if (!/^\d+$/.test(input.timestamp)) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(input.timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const bodyDigest = await sha256Hex(input.body);
  const canonical = `${input.timestamp}\n${input.method.toUpperCase()}\n${input.pathWithQuery}\n${bodyDigest}`;
  const expected = await hmacSha256Hex(input.secret, canonical);
  return timingSafeEqual(expected, input.signature.toLowerCase());
}

/** Applies `verifyWorkerSignature` to an HTTP action request. */
export async function authorizeWorkerRequest(
  request: Request,
  secret: string | undefined,
  nowSeconds?: number
): Promise<boolean> {
  if (!secret) return false;
  const url = new URL(request.url);
  return verifyWorkerSignature({
    secret,
    method: request.method,
    pathWithQuery: `${url.pathname}${url.search}`,
    // Clone so the handler can still parse the body after verification.
    body: await request.clone().text(),
    timestamp: request.headers.get(WORKER_TIMESTAMP_HEADER),
    signature: request.headers.get(WORKER_SIGNATURE_HEADER),
    nowSeconds,
  });
}
