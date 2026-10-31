/**
 * Server-only signing for requests to the AI service.
 *
 * The canonical string must stay byte-identical to `build_canonical_request`
 * in `apps/ai-service/app/api/deps.py`:
 * `timestamp\nMETHOD\n/path?query\nsha256_hex(body)`.
 *
 * Uses Web Crypto so it runs in the Node.js route-handler runtime without
 * pulling in a Node-only import in shared client bundles.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(payload));
  return toHex(digest);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(signature);
}

export interface ServiceSignature {
  timestamp: string;
  signature: string;
}

export async function signServiceRequest(params: {
  secret: string;
  method: string;
  pathWithQuery: string;
  payload: string;
  timestampSeconds?: number;
}): Promise<ServiceSignature> {
  const timestamp = String(
    params.timestampSeconds ?? Math.floor(Date.now() / 1000)
  );
  const bodyDigest = await sha256Hex(params.payload);
  const canonical = `${timestamp}\n${params.method.toUpperCase()}\n${params.pathWithQuery}\n${bodyDigest}`;
  const signature = await hmacSha256Hex(params.secret, canonical);
  return { timestamp, signature };
}
