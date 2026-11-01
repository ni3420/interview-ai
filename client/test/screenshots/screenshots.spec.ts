import path from "node:path";
import { expect, test } from "@playwright/test";

// Regenerates the images used by README.md. Run with:
//   bun run capture:screenshots
// Requires the Clerk development keys used by the rest of the app.

const outDir = path.resolve(process.cwd(), "../docs/screenshots");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(90_000);
});

async function hideDevOverlay(page: import("@playwright/test").Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function openLanding(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByRole("link", { name: "InterviewAI" })).toBeVisible();
  await page.waitForTimeout(1_000);
  // A regression here once bounced signed-out visitors to /sign-in.
  expect(new URL(page.url()).pathname).toBe("/");
  await hideDevOverlay(page);
}

test("landing · desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  await page.screenshot({ path: path.join(outDir, "landing-desktop.png") });
});

test("landing · desktop dark", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLanding(page);
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, "landing-desktop-dark.png") });
});

test("landing · mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLanding(page);
  await page.screenshot({ path: path.join(outDir, "landing-mobile.png") });
});
