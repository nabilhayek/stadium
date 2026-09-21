import type { CartLine } from "./store";
import type { CatalogItem } from "@/lib/menu/catalog";
import type { Receipt } from "@/lib/orders/receipt";

/** Map a past receipt onto today's menu. Dropped SKUs are skipped, not guessed. */
export function cartLinesFromReceipt(order: Receipt, catalog: CatalogItem[]) {
  const byId = new Map(catalog.map((item) => [item.productId, item]));
  const byName = new Map(catalog.map((item) => [item.name.toLowerCase(), item]));
  const lines: CartLine[] = [];
  let skipped = 0;

  for (const line of order.lines) {
    const hit = byId.get(line.productId) ?? byName.get(line.name.toLowerCase());
    if (!hit) {
      skipped += 1;
      continue;
    }
    lines.push({
      productId: hit.productId,
      vendorId: line.vendorId ?? hit.vendorId,
      vendorName: line.vendorName ?? hit.vendorName,
      name: hit.name,
      unitCents: line.unitCents ?? hit.unitCents,
      qty: line.qty,
      note: line.note,
    });
  }

  return { lines, skipped };
}
