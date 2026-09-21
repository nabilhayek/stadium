"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { useMounted, useStorageValue } from "@/lib/hooks/use-storage";
import { formatCents } from "@/lib/money";
import { isOrderLive, parseReceipt, receiptKey, statusTitle, type Receipt } from "@/lib/orders/receipt";
import { formatOrderWhen, lineCount, parsePastOrders, pastOrdersKey, recordPastOrder } from "@/lib/orders/past";
import { formatSeat } from "@/lib/seat/store";
import { useNow } from "@/lib/hooks/use-now";
import { fadeUp, stagger } from "@/components/motion/variants";
import { SameAgain } from "./same-again";
import type { CatalogItem } from "@/lib/menu/catalog";

type Props = { stadiumSlug: string; currency: string; catalog: CatalogItem[] };

export function OrderHistory({ stadiumSlug, currency, catalog }: Props) {
  const mounted = useMounted();
  const now = useNow(30_000);
  const pastRaw = useStorageValue("local", pastOrdersKey(stadiumSlug));
  const liveRaw = useStorageValue("session", receiptKey(stadiumSlug));

  const live = useMemo(() => parseReceipt(liveRaw), [liveRaw]);
  const past = useMemo(() => parsePastOrders(pastRaw), [pastRaw]);

  useEffect(() => {
    if (live && !past.some((o) => o.orderNumber === live.orderNumber)) {
      recordPastOrder(live);
    }
  }, [live, past]);

  const orders = useMemo(() => {
    if (!live) return past;
    if (past.some((o) => o.orderNumber === live.orderNumber)) return past;
    return [live, ...past];
  }, [live, past]);

  if (!mounted) return null;

  return (
    <m.div variants={stagger(0.07, 0.08)} initial="hidden" animate="show" className="flex flex-col gap-6 pb-16">
      <m.header variants={fadeUp} className="pr-12">
        <Link
          href={`/${stadiumSlug}`}
          className="inline-flex items-center gap-1 text-[13px] text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          <span aria-hidden>←</span> Menu
        </Link>
        <h1 className="font-display mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">
          Order history
        </h1>
        <p className="mt-2 text-[15px] text-muted">Receipts from this phone, at this venue.</p>
      </m.header>

      {orders.length === 0 ? (
        <m.div variants={fadeUp} className="rounded-[20px] border border-border bg-surface px-5 py-10 text-center">
          <p className="text-[15px] font-medium">No orders yet</p>
          <p className="mt-1 text-[13px] text-muted">When you pay, the receipt lands here.</p>
          <Link href={`/${stadiumSlug}`} className="button button--primary button--md mt-6 inline-flex">
            Order something
          </Link>
        </m.div>
      ) : (
        <m.ul variants={fadeUp} className="flex flex-col gap-2">
          {orders.map((order) => (
            <HistoryRow
              key={order.orderNumber}
              order={order}
              stadiumSlug={stadiumSlug}
              currency={order.currency ?? currency}
              catalog={catalog}
              now={now || Date.now()}
              tracking={live?.orderNumber === order.orderNumber && isOrderLive(order, now || Date.now())}
            />
          ))}
        </m.ul>
      )}
    </m.div>
  );
}

function HistoryRow({
  order,
  stadiumSlug,
  currency,
  catalog,
  now,
  tracking,
}: {
  order: Receipt;
  stadiumSlug: string;
  currency: string;
  catalog: CatalogItem[];
  now: number;
  tracking: boolean;
}) {
  const href = tracking
    ? `/${stadiumSlug}/order`
    : `/${stadiumSlug}/orders/${encodeURIComponent(order.orderNumber)}`;
  const count = lineCount(order);
  const status = isOrderLive(order, now) ? statusTitle(order, now) : "Completed";

  return (
    <li className="rounded-[20px] border border-border bg-surface">
      <Link
        href={href}
        className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-secondary"
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">Order {order.orderNumber}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {formatOrderWhen(order.paidAt)}
            {order.seat ? ` · ${formatSeat(order.seat)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-medium tabular-nums">
            {order.totalCents != null ? formatCents(order.totalCents, currency) : `${count} item${count === 1 ? "" : "s"}`}
          </span>
          <span className="mt-0.5 block text-[12px] text-muted">{status}</span>
        </span>
      </Link>
      {!tracking ? (
        <div className="border-t border-separator px-4 py-3">
          <SameAgain order={order} catalog={catalog} />
        </div>
      ) : null}
    </li>
  );
}
