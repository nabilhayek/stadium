import "server-only";
import { withDb } from "@/lib/db";
import type { Receipt } from "@/lib/orders/receipt";
import { deskText, fanText } from "./copy";
import { pushTopic, sendPush, type PushTarget } from "./send";

const TARGET = { id: true, endpoint: true, p256dh: true, auth: true, locale: true } as const;

type Row = PushTarget & { locale: string };

function byLocale(rows: Row[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.locale, [...(groups.get(row.locale) ?? []), row]);
  return groups;
}

/** Tells the phones following this order that the kitchen moved it. */
export async function sendOrderPush(receipt: Receipt): Promise<void> {
  const rows = await withDb((db) =>
    db.pushSubscription.findMany({ where: { orderNumber: receipt.orderNumber, stadium: { slug: receipt.stadiumSlug } }, select: TARGET }),
  );
  const urgent = receipt.kitchenStatus === "ready" || receipt.kitchenStatus === "declined";
  const tag = `order-${receipt.orderNumber}`;
  await Promise.all(
    [...byLocale(rows)].map(async ([locale, group]) => {
      const text = fanText(receipt, locale);
      if (!text) return;
      await sendPush(
        group,
        { ...text, url: `/${receipt.stadiumSlug}/order/${receipt.orderNumber}`, tag },
        { ttl: urgent ? 30 * 60 : 10 * 60, urgency: urgent ? "high" : "normal", topic: pushTopic(tag) },
      );
    }),
  );
}

/** Tells every kitchen device that opted in at this stadium about a new paid order. */
export async function sendDeskPush(receipt: Receipt): Promise<void> {
  const rows = await withDb((db) => db.pushSubscription.findMany({ where: { userId: { not: null }, stadium: { slug: receipt.stadiumSlug } }, select: TARGET }));
  await Promise.all(
    [...byLocale(rows)].map(([locale, group]) =>
      sendPush(
        group,
        { ...deskText(receipt, locale), url: `/${receipt.stadiumSlug}/management/orders`, tag: `desk-${receipt.orderNumber}` },
        { ttl: 10 * 60, urgency: "high" },
      ),
    ),
  );
}
