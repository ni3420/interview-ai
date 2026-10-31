import { expect, test } from "@playwright/test";

// Credential-free: the harness renders the real panel against a scripted call,
// so CI can run it with placeholder Clerk/Convex env. The app-shell flows that
// need a live Clerk instance live in app-shell.spec.ts.
interface RoomTimingEvent {
  message: string;
  stage: string;
  durationMs: number;
  turnLatencyMs?: number;
}

test.describe("interview room", () => {
  test("renders a scripted Q/A and logs audible + turn latency", async ({
    page,
  }) => {
    const events: RoomTimingEvent[] = [];
    page.on("console", (message) => {
      if (message.type() !== "info") return;
      try {
        const parsed = JSON.parse(message.text()) as RoomTimingEvent;
        if (parsed.message === "room timing") events.push(parsed);
      } catch {
        // Dev-server or hydration noise that is not a timing line.
      }
    });

    await page.goto("/e2e/room-harness");

    const firstGroup = page.getByTestId("transcript-group").first();
    await expect(firstGroup).toContainText(
      "Tell me about your React experience."
    );
    await expect(firstGroup).toContainText("I built several design systems.");

    await expect
      .poll(() => events.find((event) => event.stage === "agent.audible"))
      .toBeTruthy();
    await expect
      .poll(() => events.find((event) => event.stage === "turn.response"))
      .toMatchObject({ durationMs: 1500, turnLatencyMs: 1500 });
  });
});
