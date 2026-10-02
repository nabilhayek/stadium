"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { useNow } from "@/lib/hooks/use-now";
import { useStorageValue } from "@/lib/hooks/use-storage";
import {
  formatRemain,
  isOrderLive,
  parseReceipt,
  receiptKey,
  statusTitle,
  type Receipt,
} from "@/lib/orders/receipt";
import { parsePastOrders, pastOrdersKey } from "@/lib/orders/past";
import { SPRING } from "@/components/motion/variants";
import { Bike, Check, Store, X } from "lucide-react";

/**
 * The receipt currently being tracked for this stadium, or null. The session
 * copy wins; a live order that only exists in history (new tab, restored from
 * the server) still counts.
 */
export function useActiveOrder(stadiumSlug: string): Receipt | null {
  const sessionRaw = useStorageValue("session", receiptKey(stadiumSlug));
  const pastRaw = useStorageValue("local", pastOrdersKey(stadiumSlug));
  const now = useNow(1000);
  return useMemo(() => {
    if (!now) return null;
    const session = parseReceipt(sessionRaw);
    if (session && isOrderLive(session, now)) return session;
    return parsePastOrders(pastRaw).find((o) => isOrderLive(o, now)) ?? null;
  }, [sessionRaw, pastRaw, now]);
}

type Props = { receipt: Receipt };

/**
 * Compact tracker shown on the shop while an order is in flight. Tapping it
 * returns to the full order page.
 */
export function ActiveOrderPill({ receipt }: Props) {
  const router = useRouter();
  const now = useNow(1000) || receipt.paidAt;
  const left = receipt.readyAt - now;
  const declined = receipt.kitchenStatus === "declined";
  const arrived = declined || left <= 0;
  const delivery = receipt.fulfillment === "delivery";
  const title = statusTitle(receipt, now);
  const href = `/${receipt.stadiumSlug}/order/${encodeURIComponent(receipt.orderNumber)}`;

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  return (
    <m.button
      type="button"
      onClick={() => router.push(href)}
      whileTap={{ scale: 0.98 }}
      aria-label={`Order ${receipt.orderNumber}: ${title}. Open order`}
      className="pointer-events-auto flex w-full items-center gap-3 rounded-full border border-border bg-surface py-2 pl-3 pr-2 text-left shadow-[0_10px_28px_-14px_rgba(17,17,17,0.45)]"
    >
      <span
        className={[
          "relative grid size-8 shrink-0 place-items-center rounded-full",
          declined ? "bg-danger text-white" : "bg-foreground text-background",
        ].join(" ")}
      >
        {declined ? (
          <X className="size-4" strokeWidth={2.4} />
        ) : arrived ? (
          <Check className="size-4" strokeWidth={2.4} />
        ) : delivery ? (
          <Bike className="size-4" strokeWidth={1.9} />
        ) : (
          <Store className="size-4" strokeWidth={1.9} />
        )}
        {!arrived ? (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[#22c55e] ring-2 ring-surface">
            <span className="absolute inset-0 rounded-full bg-[#22c55e] opacity-60 [animation:ping_1.8s_ease-out_infinite]" />
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-tight">
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="inline-block"
            >
              {title}
            </m.span>
          </AnimatePresence>
        </span>
        <span className="block truncate text-[12px] leading-tight text-muted">
          Order {receipt.orderNumber}
          {declined
            ? " · Tap for details"
            : arrived
            ? " · Tap for hand-off code"
            : receipt.timing === "scheduled"
              ? " · Scheduled"
              : delivery
                ? " · Runner on it"
                : " · Being prepared"}
        </span>
      </span>

      <span className="grid h-8 min-w-[3.25rem] shrink-0 place-items-center rounded-full bg-surface-secondary px-2.5 text-[13px] font-semibold tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={declined ? "declined" : arrived ? "now" : "count"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING}
          >
            {declined ? "—" : arrived ? "Now" : formatRemain(left)}
          </m.span>
        </AnimatePresence>
      </span>
    </m.button>
  );
}
