"use client";

import { ProductCard } from "@/components/shop/product-card";
import type { MenuProduct } from "@/lib/queries/stadium";

type Props = { stadiumSlug: string; currency: string; product: MenuProduct };

/**
 * The shop's own cards, fed the unsaved draft, on the shop's page background.
 * Inert: it's a picture of the card, not a working one.
 */
export function ShopPreview({ stadiumSlug, currency, product }: Props) {
  return (
    <div inert className="pointer-events-none rounded-xl bg-background p-3 select-none sm:p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <figure className="min-w-0 flex-1">
          <figcaption className="mb-2 text-[12px] font-medium text-muted">Menu</figcaption>
          <ul>
            <ProductCard stadiumSlug={stadiumSlug} currency={currency} product={product} inList={false} />
          </ul>
        </figure>
        <figure className="shrink-0">
          <figcaption className="mb-2 text-[12px] font-medium text-muted">Last ordered</figcaption>
          <ul>
            <ProductCard
              stadiumSlug={stadiumSlug}
              currency={currency}
              product={product}
              inList={false}
              compact
              badge="Last time"
              className="w-[168px]"
            />
          </ul>
        </figure>
      </div>
    </div>
  );
}
