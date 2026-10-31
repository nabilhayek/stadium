import { test, expect } from "../support/e2e/fixtures";

test.describe("shop", () => {
  test("opens the arena menu with the seeded products", async ({ page }) => {
    await page.goto("/arena");
    await expect(page.getByRole("heading", { level: 1, name: "Metropolis Arena" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Cola 0.5L" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Fries", exact: true })).toBeVisible();
  });

  test("search narrows the menu after three letters and can be cleared", async ({ page }) => {
    await page.goto("/arena");
    const search = page.getByRole("searchbox", { name: "Search the menu" });
    await search.fill("co");
    await expect(page.getByText("Type 3 letters to search.")).toBeVisible();

    await search.fill("cola");
    await expect(page.getByText(/1 match for/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Cola 0.5L" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Cheeseburger" })).toHaveCount(0);

    await search.fill("zzzzzz");
    await expect(page.getByText("Nothing here")).toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("heading", { level: 3, name: "Cheeseburger" })).toBeVisible();
  });

  test("a category chip filters the list", async ({ page }) => {
    await page.goto("/arena");
    const categories = page.getByRole("navigation", { name: "Categories" });
    await categories.getByRole("button", { name: "Beer" }).click();
    await expect(categories.getByRole("button", { name: "Beer" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { level: 3, name: "Lager 0.5L" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Cola 0.5L" })).toHaveCount(0);

    await categories.getByRole("button", { name: "All" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Cola 0.5L" }).first()).toBeVisible();
  });

  test("a QR link opens the seat dialog and confirming saves the seat", async ({ page }) => {
    await page.goto("/arena?section=N&row=1&seat=12");
    const dialog = page.getByRole("dialog", { name: "Is this your seat?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("North Stand")).toBeVisible();
    await expect(dialog.getByLabel("Seat")).toHaveValue("12");
    await expect(dialog.getByLabel("Row (optional)")).toHaveValue("1");

    await dialog.getByRole("button", { name: "Yes, deliver here" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Delivered to/)).toContainText("North Stand");
    await expect(page.getByText(/Delivered to/)).toContainText("Seat 12");

    // Confirmed once: the same QR URL does not nag again in this tab.
    await page.reload();
    await expect(page.getByText(/Delivered to/)).toContainText("Seat 12");
    await expect(dialog).toBeHidden();
  });

  test("dismissing the QR dialog leaves the seat unset", async ({ page }) => {
    await page.goto("/arena?section=E&seat=40");
    const dialog = page.getByRole("dialog", { name: "Is this your seat?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Set your seat so we can find you")).toBeVisible();
  });

  test("adding a product puts it in the cart", async ({ page, seatOnArena }) => {
    void seatOnArena;
    await page.goto("/arena");
    // The seat chip reads localStorage after hydration, so once it shows the page is interactive.
    await expect(page.getByText(/Delivered to/)).toBeVisible();
    // Cola is in both the Popular rail and the Drinks list and they share one cart line. Use the list: with a mouse the
    // rail captures the pointer on pointerdown, so a click on its Add buttons never reaches them (app bug, see report).
    const drinks = page.getByRole("region", { name: "Drinks" });
    await drinks.getByRole("button", { name: "Add Cola 0.5L to cart" }).click();
    await expect(drinks.getByRole("group", { name: "Cola 0.5L quantity" })).toContainText("1");

    await drinks.getByRole("button", { name: "Increase Cola 0.5L" }).click();
    await expect(drinks.getByRole("group", { name: "Cola 0.5L quantity" })).toContainText("2");

    const viewCart = page.getByRole("button", { name: /View cart/ });
    await expect(viewCart).toContainText("2");
    await expect(viewCart).toContainText("7.00");
    await viewCart.click();

    const drawer = page.getByRole("dialog", { name: "Your cart" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Cola 0.5L")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Checkout" }).or(drawer.getByRole("button", { name: "Checkout" }))).toBeVisible();
  });

  test("the language can be switched from the menu", async ({ page }) => {
    await page.goto("/arena");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("radio", { name: "Svenska" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  });
});
