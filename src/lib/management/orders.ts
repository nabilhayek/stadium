import { withDb } from "@/lib/db";
import { formatSeat } from "@/lib/seat/store";
import type { Fulfillment, KitchenStatus, Timing } from "@/lib/orders/receipt";
import { toReceipt } from "@/lib/orders/shape";
import {
  ACCEPT_WINDOW_MS,
  DEFAULT_PREP_MINUTES,
  fromDbStatus,
  isBoardStatus,
  type BoardStatus,
  type DeskOrder,
} from "./board";

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
          acceptedAt: receipt.acceptedAt ?? null,
          scheduledAt: receipt.timing === "scheduled" ? receipt.scheduledAt : null,
          totalCents: row.totalCents,
          currency: row.currency,
          fulfillment: receipt.fulfillment,
          seat: receipt.seat ? formatSeat(receipt.seat, true) : null,
          confirmCode: receipt.confirmCode,
          runnerNote: receipt.runnerNote,
          lines: receipt.lines.map((l) => ({
            qty: l.qty,
            name: l.name,
            ...(l.options?.length ? { options: l.options.map((o) => o.name) } : {}),
            ...(l.note ? { note: l.note } : {}),
            ...(l.unitCents != null ? { unitCents: l.unitCents } : {}),
          })),
        },
      ];
    });
  });
}

export const RANGES = {
  "12h": { label: "Last 12 hours", start: "12h ago", spanMs: 12 * 3_600_000, buckets: 12 },
  "24h": { label: "Last 24 hours", start: "24h ago", spanMs: 24 * 3_600_000, buckets: 24 },
  "7d": { label: "Last 7 days", start: "7d ago", spanMs: 7 * 86_400_000, buckets: 28 },
} as const;

export type RangeKey = keyof typeof RANGES;

export function toRange(value: string | string[] | undefined): RangeKey {
  return typeof value === "string" && value in RANGES ? (value as RangeKey) : "12h";
}

/** One value per bucket; `null` where there is nothing to average. */
export type Series = (number | null)[];

export type Metric = { total: number | null; previous: number | null; series: Series };

export type RecentOrder = {
  orderNumber: string;
  status: KitchenStatus;
  fulfillment: Fulfillment;
  timing: Timing;
  seat: string | null;
  items: number;
  summary: string;
  totalCents: number;
  paidAt: number;
};

export type BoardSummary = {
  board: Record<BoardStatus, number>;
  /** New tickets past the same warning rule the cards use. */
  waiting: number;
};

export async function boardSummary(stadiumSlug: string): Promise<BoardSummary> {
  const now = Date.now();
  return withDb(async (db) => {
    const open = await db.receipt.findMany({
      where: { stadium: { slug: stadiumSlug }, kitchenStatus: { in: ["NEW", "ACCEPTED", "READY"] } },
      select: { body: true, kitchenStatus: true, paidAt: true },
    });
    const board: Record<BoardStatus, number> = { new: 0, accepted: 0, ready: 0 };
    let waiting = 0;
    for (const row of open) {
      const status = fromDbStatus(row.kitchenStatus);
      if (!isBoardStatus(status)) continue;
      board[status] += 1;
      if (status !== "new") continue;
      const receipt = toReceipt(row.body);
      const late =
        receipt?.timing === "scheduled" && receipt.scheduledAt != null
          ? receipt.scheduledAt - now <= DEFAULT_PREP_MINUTES * 60_000
          : now - row.paidAt.getTime() > ACCEPT_WINDOW_MS;
      if (late) waiting += 1;
    }
    return { board, waiting };
  });
}

export type Overview = {
  orders: Metric;
  revenue: Metric;
  acceptSeconds: Metric;
  declined: Metric;
  recent: RecentOrder[];
  /** The instant the buckets end at. */
  now: number;
};

const RECENT_LIMIT = 50;

export async function kitchenOverview(stadiumSlug: string, range: RangeKey): Promise<Overview> {
  const now = Date.now();
  const { spanMs, buckets } = RANGES[range];
  const start = now - spanMs;
  const bucketMs = spanMs / buckets;

  return withDb(async (db) => {
    const rows = await db.receipt.findMany({
      where: { stadium: { slug: stadiumSlug }, paidAt: { gte: new Date(start - spanMs) } },
      orderBy: { paidAt: "desc" },
      select: { body: true, kitchenStatus: true, paidAt: true, totalCents: true },
    });

    const orders = new Array<number>(buckets).fill(0);
    const revenue = new Array<number>(buckets).fill(0);
    const declined = new Array<number>(buckets).fill(0);
    const acceptSum = new Array<number>(buckets).fill(0);
    const acceptCount = new Array<number>(buckets).fill(0);
    const prev = { orders: 0, revenue: 0, declined: 0, acceptSum: 0, acceptCount: 0 };
    const recent: RecentOrder[] = [];

    for (const row of rows) {
      const paidAt = row.paidAt.getTime();
      const status = fromDbStatus(row.kitchenStatus);
      const receipt = toReceipt(row.body);
      const served = status !== "declined";
      const acceptMs =
        receipt?.timing === "asap" && receipt.acceptedAt != null && receipt.acceptedAt >= paidAt
          ? receipt.acceptedAt - paidAt
          : null;

      if (paidAt < start) {
        prev.orders += 1;
        if (served) prev.revenue += row.totalCents;
        else prev.declined += 1;
        if (acceptMs != null) {
          prev.acceptSum += acceptMs;
          prev.acceptCount += 1;
        }
        continue;
      }

      const i = Math.min(buckets - 1, Math.floor((paidAt - start) / bucketMs));
      orders[i] += 1;
      if (served) revenue[i] += row.totalCents;
      else declined[i] += 1;
      if (acceptMs != null) {
        acceptSum[i] += acceptMs;
        acceptCount[i] += 1;
      }

      if (receipt && recent.length < RECENT_LIMIT) {
        recent.push({
          orderNumber: receipt.orderNumber,
          status,
          fulfillment: receipt.fulfillment,
          timing: receipt.timing,
          seat: receipt.seat ? formatSeat(receipt.seat, true) : null,
          items: receipt.lines.reduce((n, l) => n + l.qty, 0),
          summary: receipt.lines.map((l) => (l.qty > 1 ? `${l.qty}× ${l.name}` : l.name)).join(", "),
          totalCents: row.totalCents,
          paidAt,
        });
      }
    }

    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const acceptTotal = sum(acceptCount);

    return {
      orders: { total: sum(orders), previous: prev.orders, series: orders },
      revenue: { total: sum(revenue), previous: prev.revenue, series: revenue },
      declined: { total: sum(declined), previous: prev.declined, series: declined },
      acceptSeconds: {
        total: acceptTotal ? Math.round(sum(acceptSum) / acceptTotal / 1000) : null,
        previous: prev.acceptCount ? Math.round(prev.acceptSum / prev.acceptCount / 1000) : null,
        series: acceptSum.map((ms, i) => (acceptCount[i] ? Math.round(ms / acceptCount[i] / 1000) : null)),
      },
      recent,
      now,
    };
  });
}
