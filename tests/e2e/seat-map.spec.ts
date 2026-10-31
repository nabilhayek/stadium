import { test, expect } from "../support/e2e/fixtures";
import { signInToDesk } from "../support/e2e/desk";

test.describe("seat map designer (signed in)", () => {
  // The designer needs a wide screen; narrower viewports only show a read-only preview.
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToDesk(page, baseURL!);
    await page.goto("/arena/management/seat-map");
    await expect(page.getByRole("heading", { level: 1, name: "Seat map" })).toBeVisible();
  });

  test("loads the canvas, the tool rail and the history buttons", async ({ page }) => {
    await expect(page.locator("canvas").first()).toBeVisible();

    const rail = page.getByRole("navigation", { name: "Tools" });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("button", { name: "Select and move" })).toHaveAttribute("aria-pressed", "true");
    await expect(rail.getByRole("button", { name: "Pan" })).toBeVisible();

    // Nothing to undo on a freshly opened draft.
    await expect(page.getByRole("button", { name: /^Undo/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Redo/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: /Draft saved|Unsaved changes|Saving draft/ })).toBeVisible();
  });

  test("picking a tool and the shortcut keys switch the active tool", async ({ page }) => {
    const rail = page.getByRole("navigation", { name: "Tools" });
    await rail.getByRole("button", { name: "Pan" }).click();
    await expect(rail.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
    await expect(rail.getByRole("button", { name: "Select and move" })).toHaveAttribute("aria-pressed", "false");

    // Escape returns to select; V does the same from anywhere outside a field.
    await page.keyboard.press("Escape");
    await expect(rail.getByRole("button", { name: "Select and move" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("h");
    await expect(rail.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the publish dialog opens and shows the outcome, then cancels without publishing", async ({ page }) => {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Publish seat map" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/\d[\d,]* sections and [\d,]+ seats go live/);

    // Either blocked by validation errors (Publish disabled) or allowed; both are valid states to assert on.
    const confirm = dialog.getByRole("button", { name: "Publish", exact: true });
    await expect(confirm).toBeVisible();
    if (await dialog.getByText(/^Fix (this|these)/).count()) await expect(confirm).toBeDisabled();
    else await expect(confirm).toBeEnabled();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    // Cancelling published nothing, so the designer is still on its draft with Publish available.
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  });

  test("a category edit can be undone and redone; the draft autosaves and is restored", async ({ page }) => {
    const undo = page.getByRole("button", { name: /^Undo/ });
    const redo = page.getByRole("button", { name: /^Redo/ });
    const tiers = page.getByRole("alertdialog", { name: "Categories" });

    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await expect(tiers).toBeVisible();
    await tiers.getByRole("button", { name: "Add category" }).click();
    await tiers.getByPlaceholder(/^Category \d+$/).last().fill("E2E tier");
    await tiers.getByRole("button", { name: "Save", exact: true }).click();
    await expect(tiers).toBeHidden();

    // The edit is in history now; the venue panel lists the new category.
    await expect(page.getByText("E2E tier")).toBeVisible();
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();

    await undo.click();
    await expect(page.getByText("E2E tier")).toBeHidden();
    await expect(redo).toBeEnabled();

    await redo.click();
    await expect(page.getByText("E2E tier")).toBeVisible();

    // Leave the seeded draft as found (a draft only; nothing is published) and let autosave settle on it.
    await undo.click();
    await expect(page.getByText("E2E tier")).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 15_000 });
  });
});