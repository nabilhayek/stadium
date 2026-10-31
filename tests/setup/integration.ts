import { beforeEach } from "vitest";
import { applyTestEnv, testDatabaseUrl, TEST_PG_PORT } from "../support/env";
import { resetDb } from "../support/postgres";
import { resetStripeClient } from "@/lib/stripe";

const url = process.env.TEST_DATABASE_URL || testDatabaseUrl(TEST_PG_PORT);
applyTestEnv({ databaseUrl: url });

beforeEach(async () => {
  resetStripeClient();
  await resetDb();
});
