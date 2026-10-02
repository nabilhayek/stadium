"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { formatCents } from "@/lib/money";
import type { MenuProduct } from "@/lib/queries/stadium";
import { fadeUp } from "@/components/motion/variants";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductMark } from "./product-mark";

type Props = {
  stadiumSlug: string;
  currency: string;
  product: MenuProduct;
  badge?: string;
  className?: string;
  /** Inherit the parent's stagger instead of animating on scroll. */
  inList?: boolean;
  /** Rail layout: no description, two-line name. */
  compact?: boolean;
};

export function ProductCard({
  stadiumSlug,
  currency,
  product,
  badge,
  className,
  inList = true,
  compact = false,
}: Props) {
  const add = (
    <AddToCartButton
      stadiumSlug={stadiumSlug}
      dense={compact}
      product={{
        productId: product.id,
        name: product.name,
        unitCents: product.priceCents,
      }}
    />
  );

  const href = `/${stadiumSlug}/product/${encodeURIComponent(product.id)}`;
  const tile = (
    <ProductMark
      name={product.name}
      categoryId={product.categoryId}
      imageUrl={product.imageUrl}
      sizes={compact ? "168px" : "64px"}
      className={
        compact
          ? "h-24 w-full rounded-2xl text-[26px]"
          : "size-14 shrink-0 rounded-2xl text-[20px]"
      }
    />
  );

  if (compact) {
    return (
      <m.li
        variants={inList ? fadeUp : undefined}
        whileTap={{ scale: 0.985 }}
        className={[
          "flex flex-col rounded-[22px] border border-border bg-surface p-2.5 shadow-[0_1px_0_rgba(17,17,17,0.03)]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Link href={href} className="flex flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc]">
          <div className="relative">
            {tile}
            {badge ? (
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#6a4cf5] backdrop-blur-sm">
                {badge}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2.5 min-h-[2.5rem] line-clamp-2 text-[14px] font-medium leading-snug tracking-[-0.01em]">
            {product.name}
          </h3>
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Link href={href} className="text-[13px] font-medium tabular-nums" tabIndex={-1}>
            {formatCents(product.priceCents, currency)}
          </Link>
          {add}
        </div>
      </m.li>
    );
  }

  return (
    <m.li
      variants={inList ? fadeUp : undefined}
      whileTap={{ scale: 0.985 }}
      className={[
        "flex items-center gap-3 rounded-[20px] border border-border bg-surface p-3 shadow-[0_1px_0_rgba(17,17,17,0.03)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc]"
      >
        {tile}

        <div className="min-w-0 flex-1">
          {badge ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6a4cf5]">{badge}</p>
          ) : null}
          <h3 className="truncate text-[15px] font-medium leading-tight">{product.name}</h3>
          {product.description ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{product.description}</p>
          ) : null}
          <p className="mt-1 text-[13px] font-medium tabular-nums">{formatCents(product.priceCents, currency)}</p>
        </div>
      </Link>

      {add}
    </m.li>
  );
}
