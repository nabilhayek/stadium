/* Playwright's use callback is not a React hook. */
/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_STRIPE_JS } from "../fake-stripe/stripe-js";

type Fixtures = {
  seatOnArena: void;
  cartOnArena: void;
  englishLocale: void;
  noConsoleErrors: void;
  fakeStripeJs: void;
};

type Options = {
  /** Console messages containing any of these substrings are expected (e.g. the 401 of a wrong-password sign-in). */
  expectedConsoleErrors: string[];
};

async function setStorage(page: Page, origin: string, values: Record<string, string>) {
  await page.addInitScript(
    ({ origin: o, values: v }) => {
      if (location.origin !== o) return;
      for (const [key, value] of Object.entries(v)) localStorage.setItem(key, value);
    },
    { origin, values },
  );
}

export const test = base.extend<Fixtures & Options>({
  expectedConsoleErrors: [[], { option: true }],
  fakeStripeJs: [
    async ({ page }, use) => {
      await page.route("https://js.stripe.com/**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: FAKE_STRIPE_JS,
        });
      });
      // Speed Insights is served by Vercel at /_vercel/*; `next start` answers 404 text/plain, which Chrome logs as errors.
      await page.route("**/_vercel/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      });
      await use();
    },
    { auto: true },
  ],
  noConsoleErrors: [
    async ({ page, expectedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          if (text.includes("Failed to load resource") && text.includes("speed-insights")) return;
          if (text.includes("Download the React DevTools")) return;
          if (expectedConsoleErrors.some((expected) => text.includes(expected))) return;
          errors.push(text);
        }
      });
      await use();
      expect(errors, `Unexpected console errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
  englishLocale: [
    async ({ page, baseURL }, use) => {
      await page.context().addCookies([{ name: "locale", value: "en", url: baseURL! }]);
      await setStorage(page, baseURL!, { locale: "en" });
      await use();
    },
    { auto: true },
  ],
  seatOnArena: async ({ page, baseURL }, use) => {
    await setStorage(page, baseURL!, {
      "seat:v1:arena": JSON.stringify({ sectionCode: "N", sectionName: "North Stand", row: "1", number: "12" }),
    });
    await use();
  },
  cartOnArena: async ({ page, baseURL }, use) => {
    await setStorage(page, baseURL!, {
      "cart:v1:arena": JSON.stringify({
        lines: [{ productId: "cola", name: "Cola 0.5L", qty: 1, unitCents: 350, options: [], note: "" }],
        updatedAt: Date.now(),
      }),
    });
    await use();
  },
});

export { expect };
