import "server-only";
import { withDb } from "@/lib/db";

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

type Result = { ok: true } | { ok: false; error: "forbidden" | "no-stadium" };

type Owner = { orderNumber: string } | { userId: string };

/**
 * One row per browser endpoint. Fan (`orderNumber`) and desk (`userId`) can share that row when
 * they are for the same stadium; following the other stadium clears the mismatched owner.
 */
async function save(stadiumId: string, owner: Owner, locale: string, sub: BrowserSubscription) {
  await withDb(async (db) => {
    const existing = await db.pushSubscription.findUnique({
      where: { endpoint: sub.endpoint },
      select: { stadiumId: true, orderNumber: true, userId: true },
    });
    const sameStadium = existing?.stadiumId === stadiumId;
    const data = {
      stadiumId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      locale,
      orderNumber: "orderNumber" in owner ? owner.orderNumber : sameStadium ? (existing?.orderNumber ?? null) : null,
      userId: "userId" in owner ? owner.userId : sameStadium ? (existing?.userId ?? null) : null,
    };
    await db.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
  });
}

/** Drop one owner from the row; delete the row when nothing is left to notify. */
async function clearOwner(endpoint: string, owner: Owner) {
  await withDb(async (db) => {
    const where = "orderNumber" in owner ? { endpoint, orderNumber: owner.orderNumber } : { endpoint, userId: owner.userId };
    const row = await db.pushSubscription.findFirst({ where, select: { id: true, orderNumber: true, userId: true } });
    if (!row) return;
    const orderNumber = "orderNumber" in owner ? null : row.orderNumber;
    const userId = "userId" in owner ? null : row.userId;
    if (!orderNumber && !userId) {
      await db.pushSubscription.delete({ where: { id: row.id } });
      return;
    }
    await db.pushSubscription.update({ where: { id: row.id }, data: { orderNumber, userId } });
  });
}

/** The receipt token proves this phone placed the order; the order number alone is printed on screens. */
export async function followOrder(stadiumSlug: string, orderNumber: string, token: string, locale: string, sub: BrowserSubscription): Promise<Result> {
  const row = await withDb((db) => db.receipt.findFirst({ where: { orderNumber, stadium: { slug: stadiumSlug } }, select: { token: true, stadiumId: true } }));
  if (!row || row.token !== token) return { ok: false, error: "forbidden" };
  await save(row.stadiumId, { orderNumber }, locale, sub);
  return { ok: true };
}

export async function unfollowOrder(endpoint: string, orderNumber: string): Promise<void> {
  await clearOwner(endpoint, { orderNumber });
}

export async function followDesk(stadiumSlug: string, userId: string, locale: string, sub: BrowserSubscription): Promise<Result> {
  const stadium = await withDb((db) => db.stadium.findUnique({ where: { slug: stadiumSlug }, select: { id: true } }));
  if (!stadium) return { ok: false, error: "no-stadium" };
  await save(stadium.id, { userId }, locale, sub);
  return { ok: true };
}

export async function unfollowDesk(endpoint: string, userId: string): Promise<void> {
  await clearOwner(endpoint, { userId });
}

/** The browser rotated its subscription. Knowing the old endpoint is the proof; it was never shown to anyone. */
export async function renewSubscription(oldEndpoint: string, sub: BrowserSubscription): Promise<boolean> {
  return withDb(async (db) => {
    const existing = await db.pushSubscription.findUnique({ where: { endpoint: oldEndpoint }, select: { id: true } });
    if (!existing) return false;
    if (oldEndpoint === sub.endpoint) {
      await db.pushSubscription.update({
        where: { id: existing.id },
        data: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      });
      return true;
    }
    // A stale row at the new endpoint would violate the unique constraint; drop it, then move.
    await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
    await db.pushSubscription.update({
      where: { id: existing.id },
      data: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return true;
  });
}
