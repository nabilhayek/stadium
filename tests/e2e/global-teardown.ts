const PORT = Number(process.env.PLAYWRIGHT_DB_PORT ?? 3199);

/** Asks the db-server webServer (tests/e2e/db-server.ts) to stop Postgres cleanly. Best effort. */
export default async function globalTeardown() {
  await fetch(`http://127.0.0.1:${PORT}/stop`, { signal: AbortSignal.timeout(45_000) }).catch(() => undefined);
}
