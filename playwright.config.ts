import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { assertTestDatabaseUrl, testDatabaseUrl, TEST_PG_PORT } from "./tests/support/env";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const DB_PORT = Number(process.env.PLAYWRIGHT_DB_PORT ?? 3199);
const STRIPE_PORT = Number(process.env.PLAYWRIGHT_STRIPE_PORT ?? 3198);
const baseURL = `http://127.0.0.1:${PORT}`;
// The app's Stripe SDK talks to the local fake API, never to api.stripe.com (see tests/e2e/fake-stripe-server.ts).
const stripeApiBase = process.env.STRIPE_API_BASE || `http://127.0.0.1:${STRIPE_PORT}`;
const databaseUrl = process.env.TEST_DATABASE_URL ?? testDatabaseUrl(TEST_PG_PORT);

// E2E only ever talks to a throwaway localhost database, never the developer's Neon one.
assertTestDatabaseUrl(databaseUrl, "TEST_DATABASE_URL");
process.env.PLAYWRIGHT_E2E_DATABASE_URL = databaseUrl;

// A server left over from a previous run could point at another database, so it is only reused on request.
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === "1";

export default defineConfig({
  testDir: path.join(__dirname, "tests", "e2e"),
  globalSetup: path.join(__dirname, "tests", "e2e", "global-setup.ts"),
  globalTeardown: path.join(__dirname, "tests", "e2e", "global-teardown.ts"),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results/",
  use: {
    baseURL,
    trace: "retry-with-trace",
    screenshot: "only-on-failure",
  },
  // Playwright starts these in order and waits for each, and does so BEFORE globalSetup.
  webServer: [
    {
      // 1. Embedded Postgres (or TEST_DATABASE_URL), migrated and seeded. Ready once its health endpoint answers.
      command: "npx tsx tests/e2e/db-server.ts",
      url: `http://127.0.0.1:${DB_PORT}/`,
      reuseExistingServer,
      timeout: 180_000,
      // TEST_DATABASE_URL stays whatever the caller set (CI's service); unset means "start embedded Postgres".
      env: { ...process.env, PLAYWRIGHT_DB_PORT: String(DB_PORT) } as Record<string, string>,
    },
    {
      // 2. Fake Stripe REST API (fixed port), so checkout can pay without touching real Stripe.
      command: "npx tsx tests/e2e/fake-stripe-server.ts",
      url: `http://127.0.0.1:${STRIPE_PORT}/`,
      reuseExistingServer,
      timeout: 60_000,
      env: { ...process.env, PLAYWRIGHT_STRIPE_PORT: String(STRIPE_PORT) } as Record<string, string>,
    },
    {
      // 3. The app. No `prisma migrate deploy` here: db-server already migrated the test database, and
      // prisma.config.ts loads .env.local with override, which could point a migrate at the real database.
      command: `npx prisma generate && npx next build && npx next start -p ${PORT}`,
      url: baseURL,
      reuseExistingServer,
      timeout: 600_000,
      env: {
        ...process.env,
        PLAYWRIGHT_E2E: "1",
        EXPOSE_TESTING_API: "1",
        DATABASE_URL: databaseUrl,
        DATABASE_URL_UNPOOLED: databaseUrl,
        NEXT_PUBLIC_APP_URL: baseURL,
        BETTER_AUTH_URL: baseURL,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "test-better-auth-secret-0123456789abcdef",
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "sk_test_stadium_fake",
        STRIPE_PUB_KEY: process.env.STRIPE_PUB_KEY || "pk_test_stadium_fake",
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "whsec_stadium_fake",
        STRIPE_API_BASE: stripeApiBase,
        BLOB_READ_WRITE_TOKEN: "",
        AI_GATEWAY_API_KEY: "",
        SENTRY_AUTH_TOKEN: "",
        NEXT_PUBLIC_SENTRY_DSN: "",
        VERCEL_ENV: "development",
        NODE_ENV: "production",
      } as Record<string, string>,
    },
  ],
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
  ],
});
