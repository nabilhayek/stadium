import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/e2e/fixtures";

/** Only serious and critical findings fail the run; minor and moderate ones are noise at this stage. */
async function blockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
}

test.describe("accessibility", () => {
  test("the shop has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/arena");
    await expect(page.getByRole("heading", { level: 1, name: "Metropolis Arena" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Cola 0.5L" }).first()).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("the seat dialog has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/arena?section=N&row=1&seat=12");
    await expect(page.getByRole("dialog", { name: "Is this your seat?" })).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("the kitchen login has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/arena/management/login");
    await expect(page.getByRole("heading", { level: 1, name: "Metropolis Arena" })).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });
});
