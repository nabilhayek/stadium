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
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt=""
          width={64}
          height={64}
          sizes="64px"
          loading="lazy"
          className="size-16 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="font-display grid size-14 shrink-0 place-items-center rounded-2xl text-[20px] font-semibold tracking-tight text-foreground/70"
          style={{ background: tileFor(product.categoryId) }}
        >
          {product.name.charAt(0)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {badge ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6a4cf5]">{badge}</p>
        ) : null}
        <h3 className={["text-[15px] font-medium leading-tight", compact ? "line-clamp-2" : "truncate"].join(" ")}>
          {product.name}
        </h3>
        {product.description && !compact ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">
            {product.description}
          </p>
        ) : null}
        <p className="mt-1 text-[13px] font-medium tabular-nums">
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
    </m.li>
  );
}
