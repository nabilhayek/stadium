import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@/generated/prisma/client";

const globalForAuth = globalThis as unknown as { authPrisma?: PrismaClient };

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

const prisma = globalForAuth.authPrisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForAuth.authPrisma = prisma;

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: [baseURL],
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const existing = await prisma.user.count();
          if (existing > 0) {
            throw new APIError("FORBIDDEN", { message: "Kitchen accounts are created by an existing desk." });
          }
          return { data: user };
        },
      },
    },
  },
});

export { prisma as authPrisma };
