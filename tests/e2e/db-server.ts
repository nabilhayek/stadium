import http from "node:http";
import { startTestDatabase, stopTestDatabase } from "../support/postgres";
import { assertTestDatabaseUrl } from "../support/env";

/**
 * First `webServer` entry in playwright.config.ts. Playwright starts webServers BEFORE globalSetup, and the app's
 * `next build` already reads the database (generateStaticParams, sitemap), so the test database has to be up
 * before the app builds. This process:
 *   1. starts embedded Postgres (or uses TEST_DATABASE_URL), migrates and seeds it — localhost only, see assertTestDatabaseUrl;
 *   2. opens a tiny HTTP endpoint that Playwright polls for readiness;
 *   3. stops the database on SIGINT/SIGTERM or when `global-teardown.ts` calls /stop.
 */
const PORT = Number(process.env.PLAYWRIGHT_DB_PORT ?? 3199);

async function main() {
  const url = await startTestDatabase();
  assertTestDatabaseUrl(url, "test database");

  let stopping: Promise<void> | null = null;
  const stop = () => {
    stopping ??= stopTestDatabase().catch(() => undefined);
    return stopping;
  };

  const server = http.createServer((req, res) => {
    if (req.url === "/stop") {
      void stop().then(() => {
        res.end("stopped");
        server.close();
        setTimeout(() => process.exit(0), 100);
      });
      return;
    }
    res.end("ready");
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`[e2e-db] ready on ${url} (health: ${PORT})`));

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void stop().then(() => process.exit(0));
    });
  }
}

main().catch((error) => {
  console.error("[e2e-db] failed to start", error);
  process.exit(1);
});
