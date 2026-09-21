"use client";

import { m } from "framer-motion";
import { formatCents } from "@/lib/money";
import { formatClock, confirmDigits, type Receipt } from "@/lib/orders/receipt";
import { formatOrderWhen, lineCount } from "@/lib/orders/past";
import { formatSeat } from "@/lib/seat/store";
import { fadeUp, stagger } from "@/components/motion/variants";
import { BackLink } from "@/components/ui/back-link";
import { SameAgain } from "./same-again";
import type { CatalogItem } from "@/lib/menu/catalog";

type Props = {
  order: Receipt;
  stadiumSlug: string;
  currency: string;
  catalog: CatalogItem[];
};

/** A finished order. The page decides where the receipt came from; this only draws it. */
export function OrderReceipt({ order, stadiumSlug, currency, catalog }: Props) {
  const money = formatCents(order.totalCents ?? 0, order.currency ?? currency);
  const count = lineCount(order);

  return (
    <m.div variants={stagger(0.07, 0.08)} initial="hidden" animate="show" className="flex flex-col gap-5 pb-16">
      <m.header variants={fadeUp} className="pr-12">
        <BackLink href={`/${stadiumSlug}/orders`}>History</BackLink>
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
