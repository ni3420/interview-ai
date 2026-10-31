import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { config } from "./config";

/** HTTP failure with the response body preserved for stable error-code mapping. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    url: string
  ) {
    super(`Request to ${url} failed (${status}): ${body.slice(0, 200)}`);
  }
}

/**
 * Minimal JSON POST helper.
 *
 * Deliberately does NOT use the global `fetch`: undici applies a 5 minute
 * `headersTimeout`, which a slow local model (minutes per plan or evaluation)
 * can exceed even though the request is healthy. This uses a single total
 * timeout instead.
 */
export function postJson<TResponse>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number = config.aiRequestTimeoutMs
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = JSON.stringify(body);
    const client = target.protocol === "https:" ? https : http;

    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new HttpError(status, text, url));
            return;
          }
          try {
            resolve(JSON.parse(text) as TResponse);
          } catch {
            reject(new Error(`Invalid JSON response from ${url}`));
          }
        });
      }
    );

    // A single total timeout; there is no inactivity timeout so a slow but
    // healthy generation is never cut off early.
    const timer = setTimeout(() => {
      request.destroy(
        new Error(`Request to ${url} timed out after ${timeoutMs}ms`)
      );
    }, timeoutMs);

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on("close", () => clearTimeout(timer));

    request.write(payload);
    request.end();
  });
}
