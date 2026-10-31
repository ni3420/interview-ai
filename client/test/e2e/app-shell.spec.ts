import { expect, test } from "@playwright/test";

// Needs a real Clerk development instance (the signed-out redirect and the
// Clerk-rendered landing page), so this spec is not part of the CI harness job.
test.describe("app shell", () => {
  test("serves the landing page without a session", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "InterviewAI" })).toBeVisible();
  });

  test("redirects an unauthenticated visitor away from the dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });
});
