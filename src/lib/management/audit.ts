import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import { dayRange } from "@/lib/time/day-range";

export type AuditActor = {
  userId?: string | null;
  email?: string | null;
};

export type AuditWrite = {
  stadiumSlug: string;
  action: string;
  orderNumber?: string | null;
  actor?: AuditActor | null;
  detail?: Record<string, unknown> | null;
};

/** Append-only desk event. Failures are logged; callers keep going. */
export async function writeAudit(event: AuditWrite): Promise<void> {
  try {
    await withDb(async (db) => {
      const stadium = await db.stadium.findUnique({ where: { slug: event.stadiumSlug }, select: { id: true } });
      if (!stadium) return;
      await db.auditEvent.create({
        data: {
          stadiumId: stadium.id,
          action: event.action,
          orderNumber: event.orderNumber ?? null,
          actorUserId: event.actor?.userId ?? null,
          actorEmail: event.actor?.email ?? null,
          detail: (event.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    });
  } catch (error) {
    console.error("audit write failed", event.action, event.orderNumber, error);
  }
}

export type AuditRow = {
  id: string;
  action: string;
  orderNumber: string | null;
  actorEmail: string | null;
  createdAt: string;
  detail: unknown;
};

/** Newest first. `day` is YYYY-MM-DD in the venue timezone. `actorEmail` is an exact match. */
export type AuditList = { rows: AuditRow[]; actors: string[]; counts: Record<string, number>; currency: string; timezone: string };

export async function listAudit(stadiumSlug: string, filter: { actorEmail?: string; day?: string; action?: string }): Promise<AuditList | null> {
  return withDb(async (db) => {
    const stadium = await db.stadium.findUnique({ where: { slug: stadiumSlug }, select: { id: true, timezone: true, currency: true } });
    if (!stadium) return null;
    const where: Prisma.AuditEventWhereInput = { stadiumId: stadium.id };
    if (filter.actorEmail) where.actorEmail = filter.actorEmail;
    if (filter.day) {
      const range = dayRange(filter.day, stadium.timezone);
      where.createdAt = { gte: range.start, lt: range.end };
    }
    // Counts ignore the action filter so the summary chips stay put while one is selected.
    const rowWhere: Prisma.AuditEventWhereInput = filter.action ? { ...where, action: filter.action } : where;
    const [rows, actors, grouped] = await Promise.all([
      db.auditEvent.findMany({
        where: rowWhere,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, action: true, orderNumber: true, actorEmail: true, detail: true, createdAt: true },
      }),
      db.auditEvent.findMany({
        where: { stadiumId: stadium.id, actorEmail: { not: null } },
        distinct: ["actorEmail"],
        select: { actorEmail: true },
        orderBy: { actorEmail: "asc" },
        take: 100,
      }),
      db.auditEvent.groupBy({ by: ["action"], where, _count: { _all: true } }),
    ]);
    return {
      rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      actors: actors.flatMap((row) => (row.actorEmail ? [row.actorEmail] : [])),
      counts: Object.fromEntries(grouped.map((g) => [g.action, g._count._all])),
      currency: stadium.currency,
      timezone: stadium.timezone,
    };
  });
}
