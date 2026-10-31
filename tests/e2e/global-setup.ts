import { assertTestDatabaseUrl } from "../support/env";

const PORT = Number(process.env.PLAYWRIGHT_DB_PORT ?? 3199);

/**
 * The database itself is started by the first `webServer` entry (tests/e2e/db-server.ts), because Playwright
 * starts webServers before globalSetup and `next build` needs the database. This hook is the safety net: it
 * refuses to run the suite unless that endpoint is up and the configured URL is a localhost test database.
 */
export default async function globalSetup() {
  assertTestDatabaseUrl(process.env.PLAYWRIGHT_E2E_DATABASE_URL, "PLAYWRIGHT_E2E_DATABASE_URL");
  const res = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw new Error(`The e2e test database is not running (health endpoint on port ${PORT} did not answer).`);
}
