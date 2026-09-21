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
import { SPRING } from "@/components/motion/variants";

/** The receipt currently being tracked for this stadium, or null. */
export function useActiveOrder(stadiumSlug: string): Receipt | null {
  const raw = useStorageValue("session", receiptKey(stadiumSlug));
  const receipt = useMemo(() => parseReceipt(raw), [raw]);
  const now = useNow(1000);
  if (!receipt || !now) return null;
  return isOrderLive(receipt, now) ? receipt : null;
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
  const arrived = left <= 0;
  const title = statusTitle(receipt, now);
  const href = `/${receipt.stadiumSlug}/order`;

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
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
        {arrived ? <CheckIcon /> : <RunnerIcon />}
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
          {arrived ? " · Tap for hand-off code" : receipt.timing === "scheduled" ? " · Scheduled" : " · Runner on it"}
        </span>
      </span>

      <span className="grid h-8 min-w-[3.25rem] shrink-0 place-items-center rounded-full bg-surface-secondary px-2.5 text-[13px] font-semibold tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={arrived ? "now" : "count"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING}
          >
            {arrived ? "Now" : formatRemain(left)}
          </m.span>
        </AnimatePresence>
      </span>
    </m.button>
  );
}

function RunnerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="14" cy="4.5" r="1.8" />
      <path d="M6 20l3.5-6 3 2.5L14 12l3 2 3-1" />
      <path d="M9.5 14 8 10.5l4-1.5 2.5 3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
