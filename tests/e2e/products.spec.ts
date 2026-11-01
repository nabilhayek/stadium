import type { Page } from "@playwright/test";
import { test, expect } from "../support/e2e/fixtures";
import { signInToDesk } from "../support/e2e/desk";

const NAME = "E2E Nachos";

async function rowMenu(page: Page, name: string) {
  await page.getByRole("button", { name: `More actions for ${name}` }).click();
}

test.describe("products desk (signed in)", () => {
  // The products manager and its editor sheet are a desktop layout.
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToDesk(page, baseURL!);
  });

  test("lists the seeded menu and opens the editor without changing anything", async ({ page }) => {
    await page.goto("/arena/management/products");
    await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Filter products" })).toBeVisible();
    await expect(page.getByText("Cola 0.5L").first()).toBeVisible();

    await page.getByRole("button", { name: "Edit Cola 0.5L" }).click();
    const editor = page.getByRole("dialog");
    await expect(editor.getByText("Edit product")).toBeVisible();
    await expect(editor.locator("#product-name")).toHaveValue("Cola 0.5L");
    await expect(editor.getByText("No changes")).toBeVisible();

    // Nothing was touched, so closing needs no "discard" confirmation.
    await editor.getByRole("button", { name: "Cancel" }).click();
    await expect(editor).toBeHidden();
  });

  test("a new product can be created, edited, sold out (shop follows) and deleted", async ({ page }) => {
    // The shop pages are ISR-cached for 60 s, so seeing an edit there can take up to a minute.
    test.setTimeout(180_000);
    await page.goto("/arena/management/products");

    // Create
    await page
      .getByRole("button", { name: /New product/ })
      .first()
      .click();
    const editor = page.getByRole("dialog");
    await editor.locator("#product-name").fill(NAME);
    await editor.locator("#product-price").fill("4.50");
    await editor.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText(`${NAME} added to the menu`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${NAME}` })).toBeVisible();

    // Edit
    await page.getByRole("button", { name: `Edit ${NAME}` }).click();
    await expect(editor.locator("#product-name")).toHaveValue(NAME);
    await editor.locator("#product-price").fill("5.00");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(`${NAME} saved`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${NAME}` }).locator("xpath=ancestor::li[1]")).toContainText("5.00");

    // Sold out
    await rowMenu(page, NAME);
    await page.getByRole("menuitem", { name: "Mark sold out" }).click();
    await expect(page.getByText(`${NAME} marked sold out`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${NAME}` }).locator("xpath=ancestor::li[1]")).toContainText("Sold out");

    // The shop reflects it (revalidated on demand, so poll a little).
    const search = page.getByRole("searchbox", { name: "Search the menu" });
    await expect(async () => {
      await page.goto("/arena");
      await search.fill("nachos");
      await expect(page.getByRole("heading", { level: 3, name: NAME })).toBeVisible({ timeout: 2_000 });
      await expect(page.getByText("Sold out").first()).toBeVisible({ timeout: 2_000 });
      await expect(page.getByRole("button", { name: `Add ${NAME} to cart` })).toHaveCount(0);
    }).toPass({ timeout: 100_000, intervals: [3_000] });

    // Back in stock, then delete so the seeded menu is left as found.
    await page.goto("/arena/management/products");
    await rowMenu(page, NAME);
    await page.getByRole("menuitem", { name: "Back in stock" }).click();
    await expect(page.getByText(`${NAME} is back in stock`)).toBeVisible();

    await rowMenu(page, NAME);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete product" }).click();
    await expect(page.getByText(`${NAME} deleted`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${NAME}` })).toHaveCount(0);
  });
});
