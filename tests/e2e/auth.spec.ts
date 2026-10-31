import { test, expect } from "../support/e2e/fixtures";
import { DESK_USER, resetAuthTables } from "../support/e2e/desk";

const LOGIN = "/arena/management/login";

// The steps share one database: the first account is created, then signed out and back in.
test.describe.configure({ mode: "serial" });
// The wrong-password step makes the browser log the 401 of the failed sign-in request.
test.use({ expectedConsoleErrors: ["status of 401"] });

test.describe("kitchen sign-in", () => {
  test.beforeAll(async () => {
    await resetAuthTables();
  });

  test("the desk is private: visitors are sent to the login page", async ({ page }) => {
    await page.goto("/arena/management/orders");
    await expect(page).toHaveURL(/\/arena\/management\/login$/);
  });

  test("the first visit offers to create the kitchen account, which signs in", async ({ page, isMobile }) => {
    await page.goto(LOGIN);
    await expect(page.getByRole("heading", { level: 1, name: "Metropolis Arena" })).toBeVisible();
    await expect(page.getByText("Create the first kitchen account to open the desk.")).toBeVisible();

    await page.getByLabel("Name").fill(DESK_USER.name);
    await page.getByLabel("Email").fill(DESK_USER.email);
    await page.getByLabel("Password").fill(DESK_USER.password);
    await page.getByRole("button", { name: "Create kitchen account" }).click();

    await expect(page).toHaveURL(/\/arena\/management$/);
    // The signed-in email is shown in the desktop sidebar only.
    if (!isMobile) await expect(page.getByText(DESK_USER.email)).toBeVisible();
  });

  test("with an account in place the login page only offers sign in", async ({ page }) => {
    await page.goto(LOGIN);
    await expect(page.getByText("Sign in to run the desk.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create kitchen account" })).toHaveCount(0);
    await expect(page.getByLabel("Name")).toHaveCount(0);
  });

  test("a wrong password shows an error and stays on the login page", async ({ page }) => {
    await page.goto(LOGIN);
    await page.getByLabel("Email").fill(DESK_USER.email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText(/invalid (email or )?password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the right password opens the desk, and signing out returns to the login page", async ({ page, isMobile }) => {
    await page.goto(LOGIN);
    await page.getByLabel("Email").fill(DESK_USER.email);
    await page.getByLabel("Password").fill(DESK_USER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/arena\/management$/);

    // The sign-out button lives in the desktop sidebar.
    if (isMobile) return;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
