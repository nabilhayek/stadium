import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postgresConnectionString } from "@/lib/pg-url";

function createClient() {
  const adapter = new PrismaPg({ connectionString: postgresConnectionString(process.env.DATABASE_URL) });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * `prisma dev` idle-kills pooled connections, which leaves a long-lived client dead in `next dev`, so development
 * opens a short-lived client per query. Everywhere else one client per server process is shared: a new client per
 * query means a new TCP + TLS handshake to Neon every time, which is slow and burns through connection limits on
 * match day.
 */
const perQuery = process.env.NODE_ENV === "development";

const globalForDb = globalThis as unknown as { stadiumPrisma?: PrismaClient };

function shared(): PrismaClient {
  globalForDb.stadiumPrisma ??= createClient();
  return globalForDb.stadiumPrisma;
}

export async function withDb<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  if (!perQuery) return fn(shared());
  const client = createClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
