"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/ui/pill-button";
import { getCartStore } from "@/lib/cart/store";
import { cartLinesFromReceipt } from "@/lib/cart/reorder";
import type { CatalogItem } from "@/lib/menu/catalog";
import type { Receipt } from "@/lib/orders/receipt";

type Props = {
  order: Receipt;
  catalog: CatalogItem[];
  className?: string;
};

export function SameAgain({ order, catalog, className }: Props) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const { lines, skipped } = cartLinesFromReceipt(order, catalog);

  if (lines.length === 0) {
    return (
      <p className={`text-[13px] text-muted ${className ?? ""}`}>No longer on the menu.</p>
    );
  }

  function refill() {
    getCartStore(order.stadiumSlug).replace(lines);
    setNote(skipped > 0 ? "Some items are gone — the rest are in your cart." : null);
    router.push(`/${order.stadiumSlug}?cart=1`);
  }

  return (
    <div className={className}>
      <PillButton size="sm" variant="secondary" onClick={refill}>
        Same again
      </PillButton>
      {note ? <p className="mt-2 text-[13px] text-muted">{note}</p> : null}
    </div>
  );
}
