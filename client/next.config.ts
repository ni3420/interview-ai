import type { NextConfig } from "next";

// Baseline security headers for every response (G-42). The interview needs
// camera/microphone/display-capture for this origin, so those features stay
// enabled; everything else in the policy list is denied.
//
// The CSP is deliberately narrow: it blocks embedding and plugin content but
// does not restrict script/style/connect sources yet. A full origin-scoped CSP
// needs its own pass because Clerk, Convex, Stream and Sentry each add hosts.
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
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
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