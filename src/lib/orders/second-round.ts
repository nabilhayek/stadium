import type { CatalogItem } from "@/lib/menu/catalog";
import type { Receipt, ReceiptLine } from "./receipt";

/** Kitchen can still drop a drink in the bag for this long after pay. */
export const SECOND_ROUND_MS = 12 * 60_000;
const EXTRA_MIN_PER_ITEM = 2;
const EXTRA_MIN_CAP = 6;

export function secondRoundLeft(receipt: Receipt, now: number) {
  if (now >= receipt.readyAt) return 0;
  return Math.max(0, receipt.paidAt + SECOND_ROUND_MS - now);
}

export type RoundPick = Pick<CatalogItem, "productId" | "vendorId" | "vendorName" | "name" | "unitCents"> & {
  qty: number;
};

export function mergeSecondRound(receipt: Receipt, picks: RoundPick[]): Receipt {
  const extras = picks.filter((p) => p.qty > 0);
  if (extras.length === 0) return receipt;

  const lines: ReceiptLine[] = receipt.lines.map((l) => ({ ...l }));
  let extraCents = 0;
  let extraQty = 0;

  for (const pick of extras) {
    extraCents += pick.qty * pick.unitCents;
    extraQty += pick.qty;
    const i = lines.findIndex((l) => l.productId === pick.productId);
    const next: ReceiptLine = {
      productId: pick.productId,
      name: pick.name,
      qty: pick.qty,
      vendorId: pick.vendorId,
      vendorName: pick.vendorName,
      unitCents: pick.unitCents,
    };
    if (i === -1) lines.push(next);
    else lines[i] = { ...lines[i], qty: lines[i].qty + pick.qty };
  }

  const extraMin = Math.min(EXTRA_MIN_CAP, Math.max(EXTRA_MIN_PER_ITEM, extraQty * EXTRA_MIN_PER_ITEM));

  return {
    ...receipt,
    lines,
    totalCents: (receipt.totalCents ?? 0) + extraCents,
    readyAt: receipt.readyAt + extraMin * 60_000,
    etaMax: receipt.etaMax + extraMin,
  };
}
