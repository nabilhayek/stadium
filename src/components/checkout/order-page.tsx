"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { Loader2 } from "lucide-react";
import { PillButton } from "@/components/ui/pill-button";
import { fadeUp, stagger } from "@/components/motion/variants";
import { useMounted, useStorageValue } from "@/lib/hooks/use-storage";
import { useNow } from "@/lib/hooks/use-now";
import { isOrderLive, parseReceipt, readReceipt, receiptKey, writeReceipt } from "@/lib/orders/receipt";
import { parsePastOrders, pastOrdersKey, recordPastOrder } from "@/lib/orders/past";
import { fetchReceipt } from "@/lib/orders/sync";
import type { CatalogItem } from "@/lib/menu/catalog";
import { OnTheWay } from "./on-the-way";
import { OrderReceipt } from "@/components/shop/order-receipt";

type Props = {
  stadiumSlug: string;
  orderNumber: string;
  currency: string;
  catalog: CatalogItem[];
  drinks: CatalogItem[];
};

type Remote = "idle" | "loading" | "missing" | "offline";

/**
 * /[stadium]/order/[orderNumber] — local first, server second.
 *
 * 1. Look in phone storage (the live receipt, then history). Found → render now.
 * 2. Otherwise fetch the server copy once, save it locally, and render from
 *    storage like any other receipt. The server is the fallback, not the source.
 */
export function OrderPage({ stadiumSlug, orderNumber, currency, catalog, drinks }: Props) {
  const mounted = useMounted();
  const now = useNow(1000);
  const liveRaw = useStorageValue("session", receiptKey(stadiumSlug));
  const pastRaw = useStorageValue("local", pastOrdersKey(stadiumSlug));

  const local = useMemo(() => {
    const live = parseReceipt(liveRaw);
    if (live?.orderNumber === orderNumber) return live;
    return parsePastOrders(pastRaw).find((o) => o.orderNumber === orderNumber) ?? null;
  }, [liveRaw, pastRaw, orderNumber]);

  const [remote, setRemote] = useState<Remote>("idle");
  const asked = useRef<string | null>(null);

  useEffect(() => {
    // `remote` is a dependency so "Try again" (which resets it) re-runs the lookup.
    if (!mounted || local || remote !== "idle" || asked.current === orderNumber) return;
    asked.current = orderNumber;
    setRemote("loading");
    void fetchReceipt(stadiumSlug, orderNumber).then((result) => {
      if (result.status !== "found") {
        setRemote(result.status);
        return;
      }
      // Server → phone. From here on the page reads it like any local receipt.
      recordPastOrder(result.receipt);
      if (isOrderLive(result.receipt, Date.now()) && !readReceipt(stadiumSlug)) {
        writeReceipt(result.receipt);
      }
    });
  }, [mounted, local, remote, orderNumber, stadiumSlug]);

  if (!mounted) return null;

  if (local) {
    const live = isOrderLive(local, now || local.paidAt);
    return live ? (
      <OnTheWay key={local.orderNumber} receipt={local} drinks={drinks} />
    ) : (
      <OrderReceipt order={local} stadiumSlug={stadiumSlug} currency={currency} catalog={catalog} />
    );
  }

  if (remote === "idle" || remote === "loading") {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-muted" role="status">
        <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
        <p className="text-[13px]">Fetching order {orderNumber}…</p>
      </div>
    );
  }

  const offline = remote === "offline";

  return (
    <m.div variants={stagger(0.08)} initial="hidden" animate="show" className="flex min-h-[70dvh] flex-col justify-center pr-12">
      <m.p variants={fadeUp} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Order {orderNumber}
      </m.p>
      <m.h1 variants={fadeUp} className="font-display mt-2 text-[28px] font-semibold tracking-[-0.03em]">
        {offline ? "Can’t reach the server" : "We don’t have this order"}
      </m.h1>
      <m.p variants={fadeUp} className="mt-2 text-[15px] text-muted">
        {offline
          ? "It isn’t saved on this phone and the connection dropped. Try again in a moment."
          : "It isn’t on this phone and the server has no record of it. Check the number on your receipt."}
      </m.p>
      <m.div variants={fadeUp} className="mt-6 flex flex-col gap-2">
        {offline ? (
          <PillButton
            size="lg"
            variant="primary"
            fullWidth
            onClick={() => {
              asked.current = null;
              setRemote("idle");
            }}
          >
            Try again
          </PillButton>
        ) : null}
        <Link
          href={`/${stadiumSlug}/orders`}
          className={`button button--lg w-full text-center ${offline ? "button--secondary" : "button--primary"}`}
        >
          Order history
        </Link>
      </m.div>
    </m.div>
  );
}
