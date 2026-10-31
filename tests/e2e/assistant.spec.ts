import { test, expect } from "../support/e2e/fixtures";
import { signInToDesk } from "../support/e2e/desk";

/** A minimal AI SDK UI-message stream: one text reply, no map changes. */
const STUB_STREAM = [
  { type: "start", messageId: "stub-message" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Stubbed assistant reply." },
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "finish" },
]
  .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
  .join("")
  .concat("data: [DONE]\n\n");

test.describe("seat map assistant (stubbed model)", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("opens from the designer and answers through the stubbed agent route", async ({ page, baseURL }) => {
    // Never reach the real workflow / AI gateway: only the exact POST endpoint, not /agent/<runId>.
    let posts = 0;
    await page.route("**/api/seat-map/agent", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts += 1;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "x-vercel-ai-ui-message-stream": "v1",
          "x-workflow-run-id": "run-stub",
        },
        body: STUB_STREAM,
      });
    });

    await signInToDesk(page, baseURL!);
    await page.goto("/arena/management/seat-map");

    const toggle = page.getByRole("button", { name: "Assistant", exact: true });
    await expect(toggle).toBeVisible();
    await toggle.click();

    const panel = page.getByRole("complementary", { name: "Assistant" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Describe the venue you want" })).toBeVisible();

    await panel.getByRole("textbox", { name: "Message the assistant" }).fill("Add a ring of 8000 seats");
    await panel.getByRole("button", { name: "Send" }).click();

    await expect(panel.getByText("Add a ring of 8000 seats")).toBeVisible();
    await expect(panel.getByText("Stubbed assistant reply.")).toBeVisible();
    expect(posts).toBe(1);

    await panel.getByRole("button", { name: "Close assistant" }).click();
    await expect(panel).toBeHidden();
  });
});
