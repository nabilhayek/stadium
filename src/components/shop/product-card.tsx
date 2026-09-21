"use client";

import Image from "next/image";
import { m } from "framer-motion";
import { formatCents } from "@/lib/money";
import type { MenuProduct } from "@/lib/queries/stadium";
import { fadeUp } from "@/components/motion/variants";
import { AddToCartButton } from "./add-to-cart-button";

type Props = {
  stadiumSlug: string;
  currency: string;
  vendorId: string;
  vendorName: string;
  product: MenuProduct;
  badge?: string;
  className?: string;
  /** Inherit the parent's stagger instead of animating on scroll. */
  inList?: boolean;
  /** Rail layout: no description, two-line name. */
  compact?: boolean;
};

/* Pastel tiles for products without a photo — hue is stable per category. */
const TILES = [
  "linear-gradient(135deg, #e9e3ff 0%, #d9ccff 100%)",
  "linear-gradient(135deg, #ffe4d6 0%, #ffd0b8 100%)",
  "linear-gradient(135deg, #ffe0e8 0%, #ffc9d6 100%)",
  "linear-gradient(135deg, #dff5ec 0%, #c6ecd9 100%)",
  "linear-gradient(135deg, #fff2cc 0%, #ffe6a3 100%)",
];

function tileFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TILES[Math.abs(h) % TILES.length];
}

export function ProductCard({
  stadiumSlug,
  currency,
  vendorId,
  vendorName,
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
        vendorId,
        vendorName,
        name: product.name,
        unitCents: product.priceCents,
      }}
    />
  );

  const tile = product.imageUrl ? (
    <Image
      src={product.imageUrl}
      alt=""
      width={compact ? 200 : 64}
      height={compact ? 160 : 64}
      sizes={compact ? "168px" : "64px"}
      loading="lazy"
      className={compact ? "h-24 w-full rounded-2xl object-cover" : "size-16 shrink-0 rounded-2xl object-cover"}
    />
  ) : (
    <span
      aria-hidden
      className={
        compact
          ? "font-display grid h-24 w-full place-items-center rounded-2xl text-[26px] font-semibold tracking-tight text-foreground/70"
          : "font-display grid size-14 shrink-0 place-items-center rounded-2xl text-[20px] font-semibold tracking-tight text-foreground/70"
      }
      style={{ background: tileFor(product.categoryId) }}
    >
      {product.name.charAt(0)}
    </span>
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
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className="text-[13px] font-medium tabular-nums">{formatCents(product.priceCents, currency)}</p>
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

      {add}
    </m.li>
  );
}
