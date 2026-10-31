import { instant } from "@next/playwright";
import { test, expect } from "../support/e2e/fixtures";

test.describe("instant shop", () => {
  test("the menu is in the first paint", async ({ page, baseURL }) => {
    await instant(
      page,
      async () => {
        await page.goto("/arena");
        await expect(page.getByRole("heading", { level: 1, name: "Metropolis Arena" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 3, name: "Cola 0.5L" }).first()).toBeVisible();
      },
      { baseURL },
    );
  });

  test("a product opens from the menu", async ({ page }) => {
    await page.goto("/arena");
    const product = page.getByRole("link", { name: /Cola 0\.5L/ }).first();
    await instant(page, async () => {
      await product.click();
      await page.waitForURL(/\/arena\/product\//);
    });
    await expect(page.getByRole("heading", { level: 1, name: "Cola 0.5L" })).toBeVisible();
  });
});
