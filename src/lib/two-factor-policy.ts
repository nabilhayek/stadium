import type { PrismaClient } from "@/generated/prisma/client";

/** Roles that cannot use the desk without an authenticator app. Kitchen and Runner may opt in. */
export const TWO_FACTOR_ROLES = ["admin", "manager"] as const;

/** Admin and Manager accounts, whether or not they have set it up yet. */
export async function roleNeedsTwoFactor(db: Pick<PrismaClient, "staffMember">, user: { id: string; email: string }): Promise<boolean> {
  const row = await db.staffMember.findFirst({
    where: {
      status: { not: "DISABLED" },
      roleId: { in: [...TWO_FACTOR_ROLES] },
      OR: [{ userId: user.id }, { email: { equals: user.email, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  return row !== null;
}
