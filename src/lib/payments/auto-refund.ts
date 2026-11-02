import "server-only";
import { withDb } from "@/lib/db";
import { venueSettingsSchema } from "@/lib/management/admin-settings";
import { updateKitchenOrder } from "@/lib/management/update";

const AUTO_REASON = "No kitchen accepted this order in time.";

export type AutoRefundSummary = {
  scanned: number;
  refunded: number;
  skipped: number;
  errors: string[];
};

/**
 * Declines (and refunds) NEW orders that have waited longer than each venue's
 * `payments.autoRefundMinutes`. Zero minutes means the setting is off.
 */
export async function runAutoRefunds(now = Date.now()): Promise<AutoRefundSummary> {
  const summary: AutoRefundSummary = { scanned: 0, refunded: 0, skipped: 0, errors: [] };

  const venues = await withDb((db) =>
    db.stadium.findMany({
      where: { isActive: true },
      select: { slug: true, venueAdmin: { select: { settings: true } } },
    }),
  );

  for (const venue of venues) {
    const parsed = venueSettingsSchema.safeParse(venue.venueAdmin?.settings);
    const minutes = parsed.success ? parsed.data.payments.autoRefundMinutes : 0;
    if (!minutes || minutes < 1) {
      summary.skipped += 1;
      continue;
    }

    const cutoff = new Date(now - minutes * 60_000);
    const stale = await withDb((db) =>
      db.receipt.findMany({
        where: { stadium: { slug: venue.slug }, kitchenStatus: "NEW", paidAt: { lte: cutoff } },
        select: { orderNumber: true },
        take: 50,
      }),
    );
    summary.scanned += stale.length;

    for (const row of stale) {
      const result = await updateKitchenOrder(
        venue.slug,
        row.orderNumber,
        { to: "declined", reason: AUTO_REASON },
        { userId: null, email: "system:auto-refund", action: "order.auto_refunded" },
      );
      if (result.ok) summary.refunded += 1;
      else summary.errors.push(`${venue.slug}/${row.orderNumber}: ${result.error}`);
    }
  }

  return summary;
}

/** Used by tests that target one stadium without scanning every venue. */
export async function autoRefundStadium(stadiumSlug: string, minutes: number, now = Date.now()) {
  if (minutes < 1) return { refunded: 0 };
  const cutoff = new Date(now - minutes * 60_000);
  const stale = await withDb((db) =>
    db.receipt.findMany({
      where: { stadium: { slug: stadiumSlug }, kitchenStatus: "NEW", paidAt: { lte: cutoff } },
      select: { orderNumber: true },
    }),
  );
  let refunded = 0;
  for (const row of stale) {
    const result = await updateKitchenOrder(
      stadiumSlug,
      row.orderNumber,
      { to: "declined", reason: AUTO_REASON },
      { userId: null, email: "system:auto-refund", action: "order.auto_refunded" },
    );
    if (result.ok) refunded += 1;
  }
  return { refunded };
}
