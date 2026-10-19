import { toCartLine, type CartLine } from "./store";
import type { CatalogItem } from "@/lib/menu/catalog";
import type { Receipt } from "@/lib/orders/receipt";

/**
 * Map a past receipt onto today's menu. Dropped or sold-out SKUs are skipped, not guessed.
 * Picks are carried over as they were; checkout rejects any the kitchen has since removed.
 */
export function cartLinesFromReceipt(order: Receipt, catalog: CatalogItem[]) {
  const byId = new Map(catalog.map((item) => [item.productId, item]));
  const byName = new Map(catalog.map((item) => [item.name.toLowerCase(), item]));
  const lines: CartLine[] = [];
  let skipped = 0;

  for (const line of order.lines) {
    const hit = byId.get(line.productId) ?? byName.get(line.name.toLowerCase());
    if (!hit || hit.isSoldOut || (hit.needsChoice && !line.options?.length)) {
      skipped += 1;
      continue;
    }
    const optionCents = (line.options ?? []).reduce((sum, o) => sum + o.cents, 0);
    const next = toCartLine(
      {
        productId: hit.productId,
        name: hit.name,
        unitCents: line.options?.length ? Math.max(0, hit.unitCents + optionCents) : hit.unitCents,
        options: line.options,
        note: line.note,
      },
      line.qty,
    );
    const same = lines.find((l) => l.key === next.key);
    if (same) same.qty += next.qty;
    else lines.push(next);
  }

  return { lines, skipped };
}
