import { startTestDatabase, stopTestDatabase } from "../support/postgres";

/** Starts embedded Postgres (or uses CI's TEST_DATABASE_URL), migrates and seeds once for the whole run. */
export default async function setup() {
  await startTestDatabase();
  return async () => {
    await stopTestDatabase();
  };
}
