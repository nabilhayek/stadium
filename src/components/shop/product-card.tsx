"use client";

import Image from "next/image";
import { formatCents } from "@/lib/money";
import type { MenuProduct } from "@/lib/queries/stadium";
import { AddToCartButton } from "./add-to-cart-button";

type Props = {
  stadiumSlug: string;
  currency: string;
  vendorId: string;
  vendorName: string;
  product: MenuProduct;
};

export function ProductCard({ stadiumSlug, currency, vendorId, vendorName, product }: Props) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface p-3">
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt=""
          width={64}
          height={64}
          sizes="64px"
          loading="lazy"
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-medium leading-tight">{product.name}</h3>
        {product.description ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">
            {product.description}
          </p>
        ) : null}
        <p className="mt-1 text-sm font-medium tabular-nums">
          {formatCents(product.priceCents, currency)}
        </p>
      </div>

      <AddToCartButton
        stadiumSlug={stadiumSlug}
        product={{
          productId: product.id,
          vendorId,
          vendorName,
          name: product.name,
          unitCents: product.priceCents,
        }}
      />
    </li>
  );
}
