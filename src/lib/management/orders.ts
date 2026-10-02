import { withDb } from "@/lib/db";
import { formatSeat } from "@/lib/seat/store";
import type { KitchenStatus } from "@/lib/orders/receipt";
import { toReceipt } from "@/lib/orders/shape";
import { fromDbStatus, isBoardStatus, type DeskOrder } from "./board";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Everything currently on the board, oldest first so the kitchen works top-down. */
export async function listDeskOrders(stadiumSlug: string): Promise<DeskOrder[]> {
  return withDb(async (db) => {
    const rows = await db.receipt.findMany({
      where: { stadium: { slug: stadiumSlug }, kitchenStatus: { in: ["NEW", "ACCEPTED", "READY"] } },
      orderBy: { paidAt: "asc" },
      select: { body: true, kitchenStatus: true, paidAt: true, readyAt: true, totalCents: true, currency: true },
    });

    return rows.flatMap((row) => {
      const receipt = toReceipt(row.body);
      const status = fromDbStatus(row.kitchenStatus);
      if (!receipt || !isBoardStatus(status)) return [];
      return [
        {
          orderNumber: receipt.orderNumber,
          status,
          paidAt: row.paidAt.getTime(),
          readyAt: row.readyAt.getTime(),
          scheduledAt: receipt.timing === "scheduled" ? receipt.scheduledAt : null,
          totalCents: row.totalCents,
          currency: row.currency,
          fulfillment: receipt.fulfillment,
          seat: receipt.seat ? formatSeat(receipt.seat, true) : null,
          confirmCode: receipt.confirmCode,
          runnerNote: receipt.runnerNote,
          lines: receipt.lines.map((l) => ({ qty: l.qty, name: l.name, ...(l.note ? { note: l.note } : {}) })),
        },
      ];
    });
  });
}

export type DeskStats = {
  todayCount: number;
  todayCents: number;
  openCount: number;
  averageCents: number;
  byStatus: Record<KitchenStatus, number>;
  hours: { hour: number; count: number }[];
};

export async function deskStats(stadiumSlug: string): Promise<DeskStats> {
  const today = startOfToday();
  return withDb(async (db) => {
    const rows = await db.receipt.findMany({
      where: { stadium: { slug: stadiumSlug }, paidAt: { gte: today } },
      select: { paidAt: true, totalCents: true, kitchenStatus: true },
    });
    const openCount = await db.receipt.count({
      where: { stadium: { slug: stadiumSlug }, kitchenStatus: { in: ["NEW", "ACCEPTED", "READY"] } },
    });

    const byStatus: Record<KitchenStatus, number> = { new: 0, accepted: 0, ready: 0, done: 0, declined: 0 };
    const hourCounts = new Array<number>(24).fill(0);
    let todayCents = 0;
    let served = 0;
    for (const row of rows) {
      const status = fromDbStatus(row.kitchenStatus);
      byStatus[status] += 1;
      hourCounts[row.paidAt.getHours()] += 1;
      if (status !== "declined") {
        todayCents += row.totalCents;
        served += 1;
      }
    }

    const first = hourCounts.findIndex((n) => n > 0);
    let last = -1;
    for (let i = hourCounts.length - 1; i >= 0; i--) {
      if (hourCounts[i] > 0) {
        last = i;
        break;
      }
    }
    const hours =
      first === -1 ? [] : hourCounts.slice(first, last + 1).map((count, i) => ({ hour: first + i, count }));

    return {
      todayCount: rows.length,
      todayCents,
      openCount,
      averageCents: served ? Math.round(todayCents / served) : 0,
      byStatus,
      hours,
    };
  });
}
