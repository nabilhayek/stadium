import { test, expect } from "../support/e2e/fixtures";
import { signInToDesk } from "../support/e2e/desk";

test.describe("kitchen desk (signed in)", () => {
  // The desk sidebar and its controls are a desktop layout.
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToDesk(page, baseURL!);
  });

  test("the overview opens after sign-in with the desk navigation", async ({ page }) => {
    await page.goto("/arena/management");
    const nav = page.getByRole("navigation", { name: "Kitchen" });
    await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Products" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Seat map" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
  });

  test("the orders board renders its three columns and is empty on a fresh database", async ({ page }) => {
    await page.goto("/arena/management/orders");
    await expect(page.getByRole("heading", { level: 1, name: "Active orders" })).toBeVisible();
    await expect(page.locator("#column-new")).toBeVisible();
    await expect(page.locator("#column-accepted")).toBeVisible();
    await expect(page.locator("#column-ready")).toBeVisible();
  });

  test("the sidebar board link and the orders link reach the same page", async ({ page }) => {
    await page.goto("/arena/management");
    await page.getByRole("navigation", { name: "Kitchen" }).getByRole("link", { name: "Orders" }).click();
    await expect(page).toHaveURL(/\/arena\/management\/orders$/);
    await expect(page.getByRole("heading", { level: 1, name: "Active orders" })).toBeVisible();
  });

  test("the products page lists the seeded menu", async ({ page }) => {
    await page.goto("/arena/management/products");
    await expect(page.getByText("Cola 0.5L").first()).toBeVisible();
  });
});
