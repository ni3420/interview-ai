import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3927);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bunx next dev -p ${port}`,
    url: baseURL,
    // A wrong port must fail loudly rather than silently drive another app.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_HARNESS: "1",
      NEXT_PUBLIC_E2E_HARNESS: "1",
      E2E_DIST_DIR: ".next-e2e",
    },
  },
});
