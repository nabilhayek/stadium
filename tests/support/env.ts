/** Refuse any database URL that is not a local throwaway instance. */
export function assertTestDatabaseUrl(url: string | undefined, name: string) {
  if (!url) throw new Error(`${name} is not set`);
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`${name} must point at localhost (got ${host}). Refusing to run tests against a remote database.`);
  }
}

export const TEST_PG_PORT = Number(process.env.TEST_PG_PORT ?? 54329);
export const TEST_DATABASE_NAME = "stadium_test";

export function testDatabaseUrl(port = TEST_PG_PORT) {
  return `postgresql://postgres:postgres@127.0.0.1:${port}/${TEST_DATABASE_NAME}?sslmode=disable`;
}

/** Apply the localhost-only database URLs and harmless stand-ins for every other secret. */
export function applyTestEnv(opts?: { databaseUrl?: string; stripeBase?: string }) {
  const databaseUrl = opts?.databaseUrl ?? process.env.TEST_DATABASE_URL ?? testDatabaseUrl();
  assertTestDatabaseUrl(databaseUrl, "TEST_DATABASE_URL");

  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL_UNPOOLED = databaseUrl;
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-better-auth-secret-0123456789abcdef";
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3100";
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3100";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stadium_fake";
  process.env.STRIPE_PUB_KEY = process.env.STRIPE_PUB_KEY || "pk_test_stadium_fake";
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_stadium_fake";
  process.env.BLOB_READ_WRITE_TOKEN = "";
  process.env.AI_GATEWAY_API_KEY = "";
  process.env.RESEND_API_KEY = "";
  process.env.SENTRY_AUTH_TOKEN = "";
  process.env.NEXT_PUBLIC_SENTRY_DSN = "";
  process.env.VERCEL_ENV = process.env.VERCEL_ENV || "development";
  if (opts?.stripeBase) process.env.STRIPE_API_BASE = opts.stripeBase;
}
