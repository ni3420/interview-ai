import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// README asset capture lives outside the regular e2e suite so `test:e2e` never
// rewrites committed screenshots. Run it with `bun run capture:screenshots`.
export default defineConfig({
  ...base,
  testDir: "./test/screenshots",
});
