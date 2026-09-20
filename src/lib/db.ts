import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Open a short-lived client per query.
 * `prisma dev` idle-kills pooled connections, which leaves a singleton PrismaClient dead in `next dev`.
 */
export async function withDb<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = createClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
