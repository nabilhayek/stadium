"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { useMounted, useStorageValue } from "@/lib/hooks/use-storage";
import { formatCents } from "@/lib/money";
import { formatClock, isOrderLive, parseReceipt, receiptKey, confirmDigits } from "@/lib/orders/receipt";
import { formatOrderWhen, lineCount, parsePastOrders, pastOrdersKey } from "@/lib/orders/past";
import { formatSeat } from "@/lib/seat/store";
import { useNow } from "@/lib/hooks/use-now";
import { fadeUp, stagger } from "@/components/motion/variants";
import { SameAgain } from "./same-again";
import type { CatalogItem } from "@/lib/menu/catalog";

type Props = {
  stadiumSlug: string;
  orderNumber: string;
  currency: string;
  catalog: CatalogItem[];
};

export function OrderReceipt({ stadiumSlug, orderNumber, currency, catalog }: Props) {
  const router = useRouter();
  const mounted = useMounted();
  const now = useNow(30_000);
  const pastRaw = useStorageValue("local", pastOrdersKey(stadiumSlug));
  const liveRaw = useStorageValue("session", receiptKey(stadiumSlug));

  const order = useMemo(() => {
    const live = parseReceipt(liveRaw);
    if (live?.orderNumber === orderNumber) return live;
    return parsePastOrders(pastRaw).find((o) => o.orderNumber === orderNumber) ?? null;
  }, [liveRaw, pastRaw, orderNumber]);

  useEffect(() => {
    const session = parseReceipt(liveRaw);
    if (!session || !now) return;
    if (session.orderNumber === orderNumber && isOrderLive(session, now)) {
      router.replace(`/${stadiumSlug}/order`);
    }
  }, [liveRaw, now, orderNumber, router, stadiumSlug]);

  if (!mounted) return null;

  if (!order) {
    return (
      <m.div variants={stagger(0.08)} initial="hidden" animate="show" className="flex min-h-[70dvh] flex-col justify-center pr-12">
        <m.h1 variants={fadeUp} className="font-display text-[28px] font-semibold tracking-[-0.03em]">
          Receipt not on this phone
        </m.h1>
        <m.p variants={fadeUp} className="mt-2 text-[15px] text-muted">
          History is stored locally, so it only shows orders placed here.
        </m.p>
        <m.div variants={fadeUp} className="mt-6">
          <Link href={`/${stadiumSlug}/orders`} className="button button--primary button--lg w-full text-center">
            Back to history
          </Link>
        </m.div>
      </m.div>
    );
  }

  const money = formatCents(order.totalCents ?? 0, order.currency ?? currency);
  const count = lineCount(order);

  return (
    <m.div variants={stagger(0.07, 0.08)} initial="hidden" animate="show" className="flex flex-col gap-5 pb-16">
      <m.header variants={fadeUp} className="pr-12">
        <Link
          href={`/${stadiumSlug}/orders`}
          className="inline-flex items-center gap-1 text-[13px] text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          <span aria-hidden>←</span> History
        </Link>
        <h1 className="font-display mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">
          Order {order.orderNumber}
        </h1>
        <p className="mt-2 text-[15px] text-muted">{formatOrderWhen(order.paidAt)}</p>
      </m.header>

      <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface px-5 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Hand-off</p>
        <p className="font-display mt-2 text-[32px] font-semibold tracking-tight tabular-nums">
          {confirmDigits(order.confirmCode, order.orderNumber).join("")}
        </p>
        <p className="mt-3 text-[13px] leading-snug text-muted">
          {order.fulfillment === "delivery" && order.seat
            ? `Delivered to ${formatSeat(order.seat, true)}`
            : "Collected at the stand"}
          {order.timing === "scheduled" ? ` · Scheduled for ${formatClock(order.readyAt)}` : ""}
        </p>
      </m.section>

      <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface px-5 py-4">
        <ul className="rule">
          {order.lines.map((line) => (
            <li key={line.productId} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">
                  {line.qty} × {line.name}
                </span>
                {line.note ? <span className="block truncate text-[13px] text-muted">{line.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex items-center justify-between border-t border-separator pt-3 text-[15px]">
          <span className="text-muted">
            {count} item{count === 1 ? "" : "s"}
          </span>
          <span className="font-semibold tabular-nums">{order.totalCents != null ? money : "—"}</span>
        </div>
      </m.section>

      <m.div variants={fadeUp}>
        <SameAgain order={order} catalog={catalog} />
      </m.div>
    </m.div>
  );
}
