import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  clerkFrontendApiOrigin,
  convexOrigins,
  sentryOrigin,
} from "@/lib/csp";

const clerkKey = `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`;

function directiveFor(policy: string, name: string): string {
  const found = policy.split("; ").find((part) => part.startsWith(`${name} `));
  expect(found, `missing ${name}`).toBeDefined();
  return found as string;
}

describe("clerkFrontendApiOrigin", () => {
  it("decodes the frontend API host from a publishable key", () => {
    expect(clerkFrontendApiOrigin(clerkKey)).toBe("https://clerk.example.com");
  });

  it("returns null for missing, malformed or non-Clerk keys", () => {
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
    expect(clerkFrontendApiOrigin("")).toBeNull();
    expect(clerkFrontendApiOrigin("sk_test_123")).toBeNull();
    expect(clerkFrontendApiOrigin("pk_test_")).toBeNull();
  });
});

describe("convexOrigins", () => {
  it("allows the deployment over https and wss", () => {
    expect(convexOrigins("https://fast-otter-123.convex.cloud")).toEqual([
      "https://fast-otter-123.convex.cloud",
      "wss://fast-otter-123.convex.cloud",
    ]);
  });

  it("keeps the local deployment on http and ws", () => {
    expect(convexOrigins("http://127.0.0.1:3210")).toEqual([
      "http://127.0.0.1:3210",
      "ws://127.0.0.1:3210",
    ]);
  });

  it("ignores empty or non-http values", () => {
    expect(convexOrigins(undefined)).toEqual([]);
    expect(convexOrigins("not a url")).toEqual([]);
    expect(convexOrigins("ftp://example.com")).toEqual([]);
  });
});

describe("sentryOrigin", () => {
  it("keeps only the DSN origin", () => {
    expect(sentryOrigin("https://abc123@o1.ingest.sentry.io/42")).toBe(
      "https://o1.ingest.sentry.io"
    );
    expect(sentryOrigin(undefined)).toBeNull();
  });
});

describe("buildContentSecurityPolicy", () => {
  const production = buildContentSecurityPolicy({
    nodeEnv: "production",
    convexUrl: "https://fast-otter-123.convex.cloud",
    clerkPublishableKey: clerkKey,
    sentryDsn: "https://abc123@o1.ingest.sentry.io/42",
  });

  it("locks down embeddable and plugin content", () => {
    expect(directiveFor(production, "default-src")).toBe("default-src 'self'");
    expect(directiveFor(production, "object-src")).toBe("object-src 'none'");
    expect(directiveFor(production, "frame-ancestors")).toBe(
      "frame-ancestors 'none'"
    );
    expect(directiveFor(production, "base-uri")).toBe("base-uri 'self'");
    expect(directiveFor(production, "form-action")).toBe("form-action 'self'");
  });

  it("names every browser wire destination instead of allowing the web", () => {
    const connect = directiveFor(production, "connect-src");
    expect(connect).toContain("https://clerk.example.com");
    expect(connect).toContain("https://fast-otter-123.convex.cloud");
    expect(connect).toContain("wss://fast-otter-123.convex.cloud");
    expect(connect).toContain("https://video.stream-io-api.com");
    expect(connect).toContain("wss://video.stream-io-api.com");
    expect(connect).toContain("https://o1.ingest.sentry.io");

    const sources = connect.split(" ").slice(1);
    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("wss:");
    expect(sources).not.toContain("*");
  });

  it("allows Clerk's scripts and bot-protection frame", () => {
    const script = directiveFor(production, "script-src");
    expect(script).toContain("'self'");
    expect(script).toContain("'unsafe-inline'");
    expect(script).toContain("https://clerk.example.com");
    expect(script).toContain("https://challenges.cloudflare.com");
    expect(script).not.toContain("'unsafe-eval'");

    expect(directiveFor(production, "frame-src")).toContain(
      "https://challenges.cloudflare.com"
    );
  });

  it("upgrades insecure requests only in production", () => {
    expect(production).toContain("upgrade-insecure-requests");

    const development = buildContentSecurityPolicy({
      nodeEnv: "development",
      convexUrl: "http://127.0.0.1:3210",
      clerkPublishableKey: clerkKey,
      sentryDsn: undefined,
    });
    expect(development).not.toContain("upgrade-insecure-requests");
    expect(directiveFor(development, "script-src")).toContain("'unsafe-eval'");
    const connect = directiveFor(development, "connect-src");
    expect(connect).toContain("ws://127.0.0.1:3210");
    expect(connect).toContain("ws://localhost:*");
  });

  it("omits absent providers without leaving empty sources", () => {
    const minimal = buildContentSecurityPolicy({
      nodeEnv: "production",
      convexUrl: undefined,
      clerkPublishableKey: undefined,
      sentryDsn: undefined,
    });
    expect(minimal).not.toContain("undefined");
    expect(directiveFor(minimal, "script-src")).toBe(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.protect.clerk.com"
    );
    expect(directiveFor(minimal, "connect-src")).not.toContain("  ");
  });
});
