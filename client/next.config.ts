import type { NextConfig } from "next";

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
};

export default nextConfig;