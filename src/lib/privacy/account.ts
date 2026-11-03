import "server-only";
import { withDb } from "@/lib/db";

export type AccountExport = {
  user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: string };
  staff: { stadium: string; role: string; status: string; name: string; email: string }[];
  sessions: { createdAt: string; expiresAt: string; userAgent: string | null }[];
};

export async function exportAccount(userId: string): Promise<AccountExport | null> {
  return withDb(async (db) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailVerified: true, createdAt: true } });
    if (!user) return null;
    const staff = await db.staffMember.findMany({
      where: { OR: [{ userId }, { email: user.email }] },
      select: { roleId: true, status: true, name: true, email: true, stadium: { select: { slug: true } } },
    });
    const sessions = await db.session.findMany({
      where: { userId },
      select: { createdAt: true, expiresAt: true, userAgent: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      user: { ...user, createdAt: user.createdAt.toISOString() },
      staff: staff.map((row) => ({ stadium: row.stadium.slug, role: row.roleId, status: row.status, name: row.name, email: row.email })),
      sessions: sessions.map((row) => ({ createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), userAgent: row.userAgent })),
    };
  });
}

/**
 * Deletes the signed-in staff account. Refuses when this person is the only active admin
 * at a venue, so the desk is not locked.
 */
export async function deleteAccount(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const blocked = await withDb(async (db) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, isOwner: true } });
    if (!user) return "Account not found.";
    // The owner runs every venue. Deleting it would leave the installation with nobody who can.
    if (user.isOwner) return "The owner account can't be deleted.";
    const memberships = await db.staffMember.findMany({
      where: { status: "ACTIVE", roleId: "admin", OR: [{ userId }, { email: user.email }] },
      select: { stadiumId: true },
    });
    for (const membership of memberships) {
      const others = await db.staffMember.count({
        where: { stadiumId: membership.stadiumId, status: "ACTIVE", roleId: "admin", NOT: { OR: [{ userId }, { email: user.email }] } },
      });
      if (others === 0) return "Invite another admin before deleting this account.";
    }
    return null;
  });
  if (blocked) return { ok: false, error: blocked };

  await withDb(async (db) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;
    await db.pushSubscription.deleteMany({ where: { userId } });
    await db.auditEvent.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null, actorEmail: "deleted" } });
    await db.staffMember.updateMany({
      where: { OR: [{ userId }, { email: user.email }] },
      data: { userId: null, name: "Deleted", email: `deleted-${userId}@invalid.local`, status: "DISABLED" },
    });
    await db.verification.deleteMany({ where: { identifier: user.email } });
    await db.user.delete({ where: { id: userId } });
  });
  return { ok: true };
}
