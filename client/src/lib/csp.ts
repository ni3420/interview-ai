/**
 * Origin-scoped Content-Security-Policy (G-42).
 *
 * Every external host is named explicitly so a compromised dependency cannot
 * exfiltrate data to an arbitrary origin. The hosts come from the three
 * providers the browser talks to (Clerk, Convex, Stream) plus an optional
 * Sentry/GlitchTip DSN, so the policy must be built from configuration rather
 * than hardcoded.
 *
 * `script-src` keeps `'unsafe-inline'`: the App Router emits inline bootstrap
 * and flight-data scripts, and a nonce-based policy would force every page to
 * render dynamically. That is a known residual weakness; the value here is
 * that every permitted wire destination is listed.
 */

export interface CspInput {
  nodeEnv: string | undefined;
  convexUrl: string | undefined;
  clerkPublishableKey: string | undefined;
  sentryDsn: string | undefined;
}

const CLERK_SCRIPT_ORIGINS = [
  "https://challenges.cloudflare.com",
  "https://*.protect.clerk.com",
];

const CLERK_CONNECT_ORIGINS = [
  "https://clerk-telemetry.com",
  "https://*.clerk-telemetry.com",
  "https://*.protect.clerk.com:*",
  "https://img.clerk.com",
  "https://challenges.cloudflare.com",
];

const CLERK_FRAME_ORIGINS = [
  "https://challenges.cloudflare.com",
  "https://*.protect.clerk.com",
];

// Stream's JS SDK talks to `video.stream-io-api.com` (HTTP + WebSocket) and
// resolves SFU regions through `hint.stream-io-video.com`.
const STREAM_ORIGINS = [
  "https://video.stream-io-api.com",
  "wss://video.stream-io-api.com",
  "https://hint.stream-io-video.com",
];

const CLERK_KEY_PREFIXES = ["pk_test_", "pk_live_"];

/** `pk_test_<base64("host$")>` → `https://host`. */
export function clerkFrontendApiOrigin(
  publishableKey: string | undefined
): string | null {
  const key = publishableKey?.trim();
  if (!key) return null;

  const prefix = CLERK_KEY_PREFIXES.find((candidate) => key.startsWith(candidate));
  if (!prefix) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(key.slice(prefix.length), "base64").toString("utf8");
  } catch {
    return null;
  }

  const host = decoded.split("$")[0]?.trim();
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
  return `https://${host}`;
}

/** Convex serves HTTP and WebSocket on the same host. */
export function convexOrigins(url: string | undefined): string[] {
  const trimmed = url?.trim();
  if (!trimmed) return [];

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return [];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return [];

  const socketProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return [parsed.origin, `${socketProtocol}//${parsed.host}`];
}

/** A Sentry DSN is `https://<key>@<host>/<project>`; only the host is needed. */
export function sentryOrigin(dsn: string | undefined): string | null {
  const trimmed = dsn?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function directive(
  name: string,
  sources: Array<string | null | undefined>
): string {
  const unique = [
    ...new Set(
      sources.filter(
        (source): source is string =>
          typeof source === "string" && source.length > 0
      )
    ),
  ];
  return `${name} ${unique.join(" ")}`;
}

export function buildContentSecurityPolicy(input: CspInput): string {
  const isDev = input.nodeEnv !== "production";
  const clerk = clerkFrontendApiOrigin(input.clerkPublishableKey);
  const convex = convexOrigins(input.convexUrl);
  const convexHttps = convex.filter((origin) => origin.startsWith("https://"));
  const sentry = sentryOrigin(input.sentryDsn);

  const scriptSrc = ["'self'", "'unsafe-inline'", clerk, ...CLERK_SCRIPT_ORIGINS];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = [
    "'self'",
    clerk,
    ...CLERK_CONNECT_ORIGINS,
    ...STREAM_ORIGINS,
    ...convex,
    sentry,
  ];
  if (isDev) connectSrc.push("ws://localhost:*", "ws://127.0.0.1:*");

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    directive("script-src", scriptSrc),
    directive("style-src", ["'self'", "'unsafe-inline'"]),
    directive("img-src", [
      "'self'",
      "data:",
      "blob:",
      "https://img.clerk.com",
      ...convexHttps,
    ]),
    directive("font-src", ["'self'", "data:"]),
    directive("connect-src", connectSrc),
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    directive("frame-src", ["'self'", ...CLERK_FRAME_ORIGINS]),
  ];

  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}
