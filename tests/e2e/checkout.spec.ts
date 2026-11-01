import type { Page } from "@playwright/test";
import { test, expect } from "../support/e2e/fixtures";

/**
 * The fake Stripe REST API runs as its own Playwright webServer (tests/e2e/fake-stripe-server.ts) and the app is
 * pointed at it through STRIPE_API_BASE, so PaymentIntents the app creates really exist there. Only the browser SDK
 * is faked (page.route), and its confirmCardPayment confirms the intent on that API just like Stripe.js would.
 */
const STRIPE_API = process.env.STRIPE_API_BASE || `http://127.0.0.1:${process.env.PLAYWRIGHT_STRIPE_PORT ?? 3198}`;

/** Fake Stripe.js whose card fields report "complete" and whose confirm hits the fake API via a Node-side bridge. */
const FAKE_STRIPE_JS_WITH_CARD = `
window.Stripe = function Stripe() {
  function element() {
    return {
      mount: function () {},
      unmount: function () {},
      destroy: function () {},
      update: function () {},
      off: function () {},
      on: function (event, cb) {
        if (event === "change") setTimeout(function () { cb({ complete: true, error: undefined, empty: false }); }, 0);
      },
    };
  }
  return {
    elements: function () {
      return { create: function () { return element(); }, getElement: function () { return element(); } };
    },
    paymentRequest: function () {
      return { canMakePayment: async function () { return null; }, on: function () {}, off: function () {}, show: function () {}, update: function () {} };
    },
    // react-stripe-js rejects a "stripe" object that lacks these, so they exist even though checkout never calls them.
    createToken: async function () { return { error: { message: "unused" } }; },
    createPaymentMethod: async function () { return { error: { message: "unused" } }; },
    confirmCardPayment: async function (clientSecret) {
      var id = String(clientSecret).split("_secret")[0];
      var intent = await window.__fakeStripeConfirm(id);
      return { paymentIntent: intent, error: null };
    },
  };
};
window.Stripe.version = "fake";
`;

async function fakeCardStripe(page: Page) {
  await page.exposeFunction("__fakeStripeConfirm", async (id: string) => {
    const res = await fetch(`${STRIPE_API}/v1/payment_intents/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    return res.json();
  });
  // Registered after the auto fixture's route, so this one answers first.
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_STRIPE_JS_WITH_CARD }),
  );
}

async function addColaAndOpenCheckout(page: Page) {
  await page.goto("/arena");
  // The seat chip reads localStorage after hydration, so once it shows the page is interactive.
  await expect(page.getByText(/Delivered to/)).toBeVisible();
  // Use the Drinks list: mouse clicks on the Popular rail's Add buttons never reach them (pointer capture).
  const drinks = page.getByRole("region", { name: "Drinks" });
  await drinks.getByRole("button", { name: "Add Cola 0.5L to cart" }).click();
  await expect(drinks.getByRole("group", { name: "Cola 0.5L quantity" })).toContainText("1");

  await page.getByRole("button", { name: /View cart/ }).click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("link", { name: "Checkout" })
    .or(drawer.getByRole("button", { name: "Checkout" }))
    .click();
  await expect(page).toHaveURL(/\/arena\/checkout$/);
}

test.describe("checkout", () => {
  test("an empty cart sends the fan back to the shop", async ({ page }) => {
    await page.goto("/arena/checkout");
    await expect(page.getByRole("heading", { level: 1, name: "Nothing to check out" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the shop" })).toBeVisible();
  });

  test("the cart drawer leads to checkout with delivery, pickup, the line item and a Pay button", async ({ page, seatOnArena }) => {
    void seatOnArena;
    await addColaAndOpenCheckout(page);

    await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();

    const fulfillment = page.getByRole("tablist", { name: "Delivery or pickup" });
    await expect(fulfillment.getByRole("tab", { name: /Delivery/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("North Stand", { exact: false }).first()).toBeVisible();

    await fulfillment.getByRole("tab", { name: /Pickup/ }).click();
    await expect(fulfillment.getByRole("tab", { name: /Pickup/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Collect at")).toBeVisible();
    await fulfillment.getByRole("tab", { name: /Delivery/ }).click();
    await expect(page.getByText("Deliver to")).toBeVisible();

    const order = page.getByRole("list").filter({ hasText: "Cola 0.5L" });
    await expect(order).toContainText("Cola 0.5L");
    await expect(order).toContainText("3.50");

    await expect(page.getByRole("radiogroup", { name: "Payment method" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay\b.*3\.50/ })).toBeVisible();
  });

  test("paying by card through the fake Stripe API places the order", async ({ page, seatOnArena }) => {
    void seatOnArena;
    await fakeCardStripe(page);
    await addColaAndOpenCheckout(page);

    // With no wallet available the card fields open on their own.
    await expect(page.getByText("Credit or debit")).toBeVisible();
    const pay = page.getByRole("button", { name: /^Pay\b.*3\.50/ });
    await expect(pay).toBeEnabled();
    // The cart is priced and a PaymentIntent created on the fake API ~400 ms after the page settles.
    await pay.click();

    await expect(page).toHaveURL(/\/arena\/order\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByText(/Cola 0\.5L/).first()).toBeVisible();
  });
});
