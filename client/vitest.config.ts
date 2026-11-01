import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    globals: true,
    deps: {
      inline: ["@testing-library/react", "@testing-library/jest-dom"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Some suites import `../convex` and `../worker` directly. Node resolution
      // walks up from those folders, so it never sees this package's install.
      // Point both at the copies declared in package.json to keep the suite
      // self-contained on a fresh clone.
      convex: path.resolve(__dirname, "./node_modules/convex"),
      zod: path.resolve(__dirname, "./node_modules/zod"),
    },
  },
});