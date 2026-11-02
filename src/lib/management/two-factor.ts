import "server-only";
import { authPrisma } from "@/lib/auth";
import { withDb } from "@/lib/db";
import { roleNeedsTwoFactor } from "@/lib/two-factor-policy";
import { writeAudit, type AuditActor } from "./audit";

/** True when this account is an Admin or Manager anywhere and has not turned two-factor on yet. */
export async function twoFactorRequired(user: { id: string; email: string; twoFactorEnabled?: boolean | null }): Promise<boolean> {
  if (user.twoFactorEnabled) return false;
  return withDb((db) => roleNeedsTwoFactor(db, user));
}

/** Whether this signed-in user is an Admin on this stadium. Only they may reset someone else's two-factor. */
export async function isStadiumAdmin(stadiumSlug: string, user: { id: string; email: string }): Promise<boolean> {
  const row = await withDb((db) =>
    db.staffMember.findFirst({
      where: {
        stadium: { slug: stadiumSlug },
        status: "ACTIVE",
        roleId: "admin",
        OR: [{ userId: user.id }, { email: { equals: user.email, mode: "insensitive" } }],
      },
      select: { id: true },
    }),
  );
  return row !== null;
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/**
 * Admin recovery for a lost phone: removes the person's authenticator and backup codes and signs them out.
 * Admin and Manager are asked to set it up again at their next sign-in.
 */
export async function resetTwoFactor(stadiumSlug: string, memberId: string, actor: AuditActor & { userId: string; email: string }): Promise<ResetResult> {
  if (!(await isStadiumAdmin(stadiumSlug, { id: actor.userId, email: actor.email }))) return { ok: false, error: "Only an admin can reset two-factor." };

  const member = await withDb((db) =>
    db.staffMember.findFirst({ where: { id: memberId, stadium: { slug: stadiumSlug } }, select: { email: true, userId: true } }),
  );
  if (!member) return { ok: false, error: "Person not found." };

  const user = await authPrisma.user.findFirst({
    where: member.userId ? { id: member.userId } : { email: { equals: member.email, mode: "insensitive" } },
    select: { id: true, email: true, twoFactorEnabled: true },
  });
  if (!user) return { ok: false, error: "That person has not signed in yet." };
  if (!user.twoFactorEnabled) return { ok: false, error: "Two-factor is not on for that person." };

  await authPrisma.$transaction([
    authPrisma.twoFactor.deleteMany({ where: { userId: user.id } }),
    authPrisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } }),
    authPrisma.session.deleteMany({ where: { userId: user.id } }),
    // "Trust this device" records: identifier `trust-device-<random>`, value is the user id.
    authPrisma.verification.deleteMany({ where: { identifier: { startsWith: "trust-device-" }, value: user.id } }),
  ]);
  await writeAudit({ stadiumSlug, action: "staff.two_factor_reset", actor, detail: { email: user.email } });
  return { ok: true };
}
