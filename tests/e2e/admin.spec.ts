import { test, expect } from "../support/e2e/fixtures";
import { signInToDesk } from "../support/e2e/desk";

test.describe("admin console (signed in)", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToDesk(page, baseURL!);
  });

  test("requires a session", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/arena/management/admin");
    await expect(page).toHaveURL(/\/arena\/management\/login$/);
    await context.close();
  });

  test("loads with its four tabs, Team first", async ({ page }) => {
    await page.goto("/arena/management/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();

    const tabs = page.getByRole("tablist", { name: "Admin sections" });
    for (const name of ["Team", "Kitchens & routing", "Ordering", "Service & payments"]) {
      await expect(tabs.getByRole("tab", { name })).toBeVisible();
    }
    await expect(tabs.getByRole("tab", { name: "Team" })).toHaveAttribute("aria-selected", "true");
  });

  test("each tab can be opened", async ({ page }) => {
    await page.goto("/arena/management/admin");
    const tabs = page.getByRole("tablist", { name: "Admin sections" });
    for (const name of ["Kitchens & routing", "Ordering", "Service & payments", "Team"]) {
      await tabs.getByRole("tab", { name }).click();
      await expect(tabs.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    }
  });
});
