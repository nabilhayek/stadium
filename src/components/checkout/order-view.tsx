"use client";

import { useMemo } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { useMounted, useStorageValue } from "@/lib/hooks/use-storage";
import { parseReceipt, receiptKey } from "@/lib/orders/receipt";
import { fadeUp, stagger } from "@/components/motion/variants";
import { OnTheWay } from "./on-the-way";
import type { CatalogItem } from "@/lib/menu/catalog";

type Props = { stadiumSlug: string; drinks?: CatalogItem[] };

/**
 * Standalone tracking page for the current order. The receipt lives in
 * sessionStorage, so this is reachable from the shop's active-order widget
 * even after the cart has new items in it.
 */
export function OrderView({ stadiumSlug, drinks = [] }: Props) {
  const mounted = useMounted();
  const raw = useStorageValue("session", receiptKey(stadiumSlug));
  const receipt = useMemo(() => parseReceipt(raw), [raw]);

  if (!mounted) return null;

  if (receipt) {
    return <OnTheWay receipt={receipt} drinks={drinks} />;
  }

  return (
    <m.div
      variants={stagger(0.08)}
      initial="hidden"
      animate="show"
      className="flex min-h-[70dvh] flex-col justify-center pr-12"
    >
      <m.h1 variants={fadeUp} className="font-display text-[28px] font-semibold tracking-[-0.03em]">
        No active order
      </m.h1>
      <m.p variants={fadeUp} className="mt-2 text-[15px] text-muted">
        Once you pay, your order tracker lives here.
      </m.p>
      <m.div variants={fadeUp} className="mt-6">
        <Link href={`/${stadiumSlug}`} className="button button--primary button--lg w-full text-center">
          Back to the shop
        </Link>
      </m.div>
    </m.div>
  );
}
