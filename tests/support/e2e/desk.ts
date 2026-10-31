import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Cookie, Page } from "@playwright/test";
import { Client } from "pg";
import { assertTestDatabaseUrl } from "../env";

export const DESK_USER = { name: "E2E Kitchen", email: "kitchen@e2e.test", password: "e2e-password-123" } as const;

const SESSION_FILE = path.join(process.cwd(), "test-results", ".desk-session.json");

/** better-auth rejects state-changing calls without a matching Origin header. */
function authHeaders(baseURL: string) {
  return { origin: baseURL, "content-type": "application/json" };
}

/** better-auth rate-limits sign-in (3 per 10 s) in production builds, so wait the window out and try again. */
async function withRateLimitRetry<T extends { status(): number }>(attempt: () => Promise<T>): Promise<T> {
  let res = await attempt();
  for (let i = 0; i < 2 && res.status() === 429; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10_500));
    res = await attempt();
  }
  return res;
}

/**
 * Creates the kitchen account over the API. Only the first account can ever be created, so on a test database that
 * already has one this answers 403 and that is fine — the caller signs in next.
 */
export async function ensureDeskAccount(request: APIRequestContext, baseURL: string) {
  const res = await withRateLimitRetry(() => request.post("/api/auth/sign-up/email", { data: DESK_USER, headers: authHeaders(baseURL) }));
  // 403: another account already exists (first-account-only hook). 422: this one does.
  if (!res.ok() && res.status() !== 403 && res.status() !== 422)
    throw new Error(`Could not create the e2e kitchen account: ${res.status()} ${await res.text()}`);
}

function readCachedCookies(): Cookie[] | null {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as Cookie[];
  } catch {
    return null;
  }
}

async function hasSession(page: Page) {
  const res = await page.request.get("/api/auth/get-session");
  if (!res.ok()) return false;
  return (await res.json().catch(() => null)) !== null;
}

/**
 * Signs in without the UI (the login form itself is covered by auth.spec.ts) so desk specs start fast. The session
 * cookie is cached for the run: sign-in is rate limited, and auth.spec.ts wipes the accounts, so a cached cookie is
 * checked before it is trusted and replaced when it no longer works.
 */
export async function signInToDesk(page: Page, baseURL: string) {
  const cached = readCachedCookies();
  if (cached) {
    await page.context().addCookies(cached);
    if (await hasSession(page)) return;
    await page.context().clearCookies();
  }

  await ensureDeskAccount(page.request, baseURL);
  const res = await withRateLimitRetry(() =>
    page.request.post("/api/auth/sign-in/email", {
      data: { email: DESK_USER.email, password: DESK_USER.password },
      headers: authHeaders(baseURL),
    }),
  );
  if (!res.ok()) throw new Error(`Could not sign in the e2e kitchen account: ${res.status()} ${await res.text()}`);

  const cookies = (await page.context().cookies(baseURL)).filter((c) => c.name.includes("session"));
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies));
}

/** Removes every auth row so the next visit to the login page offers "create the first account". Test database only. */
export async function resetAuthTables() {
  const url = process.env.PLAYWRIGHT_E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  assertTestDatabaseUrl(url, "PLAYWRIGHT_E2E_DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('TRUNCATE "session", "account", "verification", "user" CASCADE');
  } finally {
    await client.end();
  }
}
