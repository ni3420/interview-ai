import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/csp";

// Baseline security headers for every response (G-42). The interview needs
// camera/microphone/display-capture for this origin, so those features stay
// enabled; everything else in the policy list is denied.
//
// The CSP is origin-scoped: Clerk, Convex, Stream and an optional Sentry/
// GlitchTip DSN contribute their exact hosts, derived from the env at build
// time. There is no `https:`/`wss:` wildcard for script or connect sources.
const contentSecurityPolicy = buildContentSecurityPolicy({
  nodeEnv: process.env.NODE_ENV,
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
];

const nextConfig: NextConfig = {
  // Playwright runs beside a developer's dev server; a separate output dir
  // keeps the two Next dev instances from sharing a lock file.
  distDir: process.env.E2E_DIST_DIR ?? ".next",
  // bullmq/ioredis are Node-only and rely on dynamic requires; keep them
  // external so the server route can load them at runtime.
  serverExternalPackages: ["bullmq", "ioredis"],
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;