"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { useMounted, useStorageValue } from "@/lib/hooks/use-storage";
import { useNow } from "@/lib/hooks/use-now";
import { isOrderLive, parseReceipt, receiptKey } from "@/lib/orders/receipt";
import { fadeUp, stagger } from "@/components/motion/variants";

type Props = { stadiumSlug: string };

/**
 * /[stadium]/order without a number: jump to the order this phone is tracking,
 * or explain that there is none. Every order has its own URL.
 */
export function OrderView({ stadiumSlug }: Props) {
  const router = useRouter();
  const mounted = useMounted();
  const now = useNow(1000);
  const raw = useStorageValue("session", receiptKey(stadiumSlug));
  const receipt = useMemo(() => parseReceipt(raw), [raw]);
  const live = receipt && now ? isOrderLive(receipt, now) : false;

  useEffect(() => {
    if (receipt && live) router.replace(`/${stadiumSlug}/order/${encodeURIComponent(receipt.orderNumber)}`);
  }, [receipt, live, router, stadiumSlug]);

  if (!mounted || !now || live) return null;

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
      <m.div variants={fadeUp} className="mt-6 flex flex-col gap-2">
        <Link href={`/${stadiumSlug}`} className="button button--primary button--lg w-full text-center">
          Back to the shop
        </Link>
        <Link href={`/${stadiumSlug}/orders`} className="button button--secondary button--lg w-full text-center">
          Order history
        </Link>
      </m.div>
    </m.div>
  );
}
