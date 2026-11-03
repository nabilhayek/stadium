import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { roleNeedsTwoFactor } from "@/lib/two-factor-policy";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@/generated/prisma/client";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email/auth-mail";
import { postgresConnectionString } from "@/lib/pg-url";

const globalForAuth = globalThis as unknown as { authPrisma?: PrismaClient };

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: postgresConnectionString(process.env.DATABASE_URL) }),
  });
}

const prisma = globalForAuth.authPrisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForAuth.authPrisma = prisma;

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: process.env.NODE_ENV === "production" ? [baseURL] : [baseURL, "http://localhost:3000"],
  user: {
    additionalFields: {
      // On the session so guards can read it without a query. `input: false`: a sign-up request can't set it.
      isOwner: { type: "boolean", defaultValue: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }, request) => {
      const sent = await sendPasswordResetEmail({ to: user.email, url, request });
      if (!sent.ok) throw new Error(sent.error);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }, request) => {
      const sent = await sendVerificationEmail({ to: user.email, url, request });
      if (!sent.ok) console.error("Verification email failed.");
    },
  },
  plugins: [
    twoFactor({
      issuer: "Seat Service",
      // 30 days, shown as "Trust this device" so a shared kitchen tablet isn't asked every shift.
      trustDeviceMaxAge: 30 * 24 * 60 * 60,
      backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
    }),
  ],
  hooks: {
    // Admins and Managers cannot turn it off. An admin resets it for them from Admin → Team instead.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/disable") return;
      const session = await getSessionFromCtx(ctx);
      if (session && (await roleNeedsTwoFactor(prisma, session.user))) {
        throw new APIError("FORBIDDEN", { message: "Admins and Managers must keep two-factor on." });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const existing = await prisma.user.count();
          if (existing > 0) {
            throw new APIError("FORBIDDEN", { message: "Kitchen accounts are created by an existing desk." });
          }
          // Only the very first account gets this far, and it owns the installation.
          return { data: { ...user, isOwner: true } };
        },
      },
    },
  },
});

export { prisma as authPrisma };
