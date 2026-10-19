/**
 * Server copy of receipts. The phone is the source of truth; this is the
 * fallback that makes `/[stadium]/order/[orderNumber]` work on any device.
 */

import type { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import type { Receipt } from "./receipt";
import { publicReceipt, toReceipt } from "./shape";

const HISTORY_LIMIT = 30;

type Row = { body: Prisma.JsonValue; token: string; deviceId: string };

function fromRow(row: Row): Receipt | null {
  const receipt = toReceipt(row.body);
  if (!receipt) return null;
  return { ...receipt, token: row.token, deviceId: row.deviceId };
}

/** Receipt as anyone holding the URL may see it — no write secret. */
export async function getReceipt(stadiumSlug: string, orderNumber: string): Promise<Receipt | null> {
  return withDb(async (db) => {
    const row = await db.receipt.findFirst({
      where: { orderNumber, stadium: { slug: stadiumSlug } },
      select: { body: true, token: true, deviceId: true },
    });
    const receipt = row ? fromRow(row) : null;
    return receipt ? publicReceipt(receipt) : null;
  });
}

/** Everything one install placed at this venue, newest first, secrets included. */
export async function listReceipts(stadiumSlug: string, deviceId: string): Promise<Receipt[]> {
  return withDb(async (db) => {
    const rows = await db.receipt.findMany({
      where: { deviceId, stadium: { slug: stadiumSlug } },
      orderBy: { paidAt: "desc" },
      take: HISTORY_LIMIT,
      select: { body: true, token: true, deviceId: true },
    });
    return rows.map(fromRow).filter((r): r is Receipt => r !== null);
  });
}

/** Receipt including its write token. Server-only — never return this from a public route. */
export async function getOwnedReceipt(stadiumSlug: string, orderNumber: string): Promise<Receipt | null> {
  return withDb(async (db) => {
    const row = await db.receipt.findFirst({
      where: { orderNumber, stadium: { slug: stadiumSlug } },
      select: { body: true, token: true, deviceId: true },
    });
    return row ? fromRow(row) : null;
  });
}

export type PutResult = "created" | "updated" | "forbidden" | "no-stadium" | "payment-required";

/**
 * Upsert keyed by (stadium, orderNumber). Updates need the token the creator minted.
 * Phones can refresh a note or an email. Only a confirmed payment may create the order
 * or change what was charged.
 */
export async function putReceipt(receipt: Receipt, opts?: { authoritative?: boolean }): Promise<PutResult> {
  const { token, deviceId } = receipt;
  if (!token || !deviceId) return "forbidden";

  return withDb(async (db) => {
    const stadium = await db.stadium.findUnique({ where: { slug: receipt.stadiumSlug }, select: { id: true } });
    if (!stadium) return "no-stadium";

    const where = { stadiumId_orderNumber: { stadiumId: stadium.id, orderNumber: receipt.orderNumber } };
    const existing = await db.receipt.findUnique({ where, select: { token: true, body: true } });
    if (!existing && !opts?.authoritative) return "payment-required";
    if (existing && existing.token !== token) return "forbidden";

    // Once the kitchen has touched an order it owns the status, the ETA and any
    // decline reason. A phone re-syncing its copy must not roll those back.
    const previous = existing ? toReceipt(existing.body) : null;
    const kitchenOwned = previous?.kitchenStatus
      ? {
          kitchenStatus: previous.kitchenStatus,
          readyAt: previous.readyAt,
          ...(previous.declineReason ? { declineReason: previous.declineReason } : {}),
        }
      : {};
    // Money and lines stay as the payment wrote them, unless this write is the payment itself.
    const phoneSafe = previous && !opts?.authoritative
      ? {
          ...previous,
          runnerNote: receipt.runnerNote,
          seat: receipt.seat,
          ...(receipt.email ? { email: receipt.email } : {}),
          token,
          deviceId,
        }
      : receipt;
    const merged = { ...phoneSafe, ...kitchenOwned };
    const body = publicReceipt(merged) as unknown as Prisma.InputJsonValue;
    const columns = {
      paidAt: new Date(merged.paidAt),
      readyAt: new Date(merged.readyAt),
      totalCents: merged.totalCents ?? 0,
      currency: merged.currency ?? "EUR",
      body,
    };

    if (existing) {
      await db.receipt.update({ where, data: columns });
      return "updated";
    }
    await db.receipt.create({
      data: { ...columns, stadiumId: stadium.id, orderNumber: receipt.orderNumber, deviceId, token },
    });
    return "created";
  });
}
