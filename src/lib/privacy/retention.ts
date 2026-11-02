import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { withDb } from "@/lib/db";
import { ANONYMOUS_DEVICE, retentionDays, stripFanDetails } from "./policy";

export type RetentionSummary = { receipts: number; payments: number; orders: number };

/** Anonymise receipts, payment drafts and legacy orders older than the retention window. */
export async function retainOldReceipts(now = new Date()): Promise<RetentionSummary> {
  const days = retentionDays();
  if (days < 1) return { receipts: 0, payments: 0, orders: 0 };
  const cutoff = new Date(now.getTime() - days * 86_400_000);

  const receipts = await withDb((db) =>
    db.receipt.findMany({
      where: { paidAt: { lt: cutoff }, deviceId: { not: ANONYMOUS_DEVICE } },
      select: { id: true, body: true },
      take: 200,
    }),
  );
  for (const row of receipts) {
    await withDb((db) =>
      db.receipt.update({
        where: { id: row.id },
        data: {
          deviceId: ANONYMOUS_DEVICE,
          token: randomBytes(18).toString("base64url"),
          body: stripFanDetails(row.body) as Prisma.InputJsonValue,
        },
      }),
    );
  }

  const payments = await withDb((db) =>
    db.payment.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, draft: true },
      take: 200,
    }),
  );
  let paymentCount = 0;
  for (const row of payments) {
    const draft = stripFanDetails(row.draft);
    if (JSON.stringify(draft) === JSON.stringify(row.draft)) continue;
    paymentCount += 1;
    await withDb((db) => db.payment.update({ where: { id: row.id }, data: { draft: draft as Prisma.InputJsonValue } }));
  }

  const orders = await withDb((db) =>
    db.order.updateMany({
      where: { createdAt: { lt: cutoff }, OR: [{ note: { not: null } }, { seatRow: { not: null } }, { seatNumber: { not: null } }] },
      data: { note: null, seatRow: null, seatNumber: null },
    }),
  );

  return { receipts: receipts.length, payments: paymentCount, orders: orders.count };
}
