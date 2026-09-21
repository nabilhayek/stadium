"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { PillButton } from "@/components/ui/pill-button";
import { SPRING } from "@/components/motion/variants";
import { formatCents } from "@/lib/money";
import { writeReceipt, type Receipt } from "@/lib/orders/receipt";
import { recordPastOrder } from "@/lib/orders/past";
import { recordOrdered } from "@/lib/orders/history";
import { mergeSecondRound, secondRoundLeft, type RoundPick } from "@/lib/orders/second-round";
import type { CatalogItem } from "@/lib/menu/catalog";

type Props = {
  receipt: Receipt;
  drinks: CatalogItem[];
  now: number;
  onUpdate: (next: Receipt) => void;
};

export function SecondRound({ receipt, drinks, now, onUpdate }: Props) {
  const left = secondRoundLeft(receipt, now);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [paying, setPaying] = useState(false);

  const picks = useMemo(() => {
    const next: RoundPick[] = [];
    for (const drink of drinks) {
      const n = qty[drink.productId] ?? 0;
      if (n > 0) next.push({ ...drink, qty: n });
    }
    return next;
  }, [drinks, qty]);

  const cents = picks.reduce((sum, p) => sum + p.qty * p.unitCents, 0);
  const count = picks.reduce((sum, p) => sum + p.qty, 0);
  const currency = receipt.currency ?? "EUR";

  const minutesLeft = Math.max(1, Math.ceil(left / 60_000));

  if (left === 0 || drinks.length === 0) return null;

  async function pay() {
    if (count === 0 || paying) return;
    setPaying(true);
    await new Promise((r) => setTimeout(r, 700));
    const next = mergeSecondRound(receipt, picks);
    writeReceipt(next);
    recordPastOrder(next);
    recordOrdered(
      receipt.stadiumSlug,
      picks.flatMap((p) => Array.from({ length: p.qty }, () => p.productId)),
    );
    onUpdate(next);
    setQty({});
    setPaying(false);
    navigator.vibrate?.(12);
  }

  return (
    <section className="rounded-[20px] border border-border bg-surface p-5">
      <p className="text-[15px] font-medium">Still thirsty?</p>
      <p className="mt-1 text-[13px] leading-snug text-muted">
        Add a drink to this round. Kitchen can still pack it for {minutesLeft} more min.
      </p>

      <ul className="mt-4 flex flex-col">
        {drinks.map((drink) => {
          const n = qty[drink.productId] ?? 0;
          return (
            <li
              key={drink.productId}
              className="flex items-center justify-between gap-3 border-t border-separator py-2.5 first:border-t-0 first:pt-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{drink.name}</span>
                <span className="text-[13px] tabular-nums text-muted">
                  {formatCents(drink.unitCents, currency)}
                </span>
              </span>
              <QtyControl
                name={drink.name}
                qty={n}
                onAdd={() => setQty((prev) => ({ ...prev, [drink.productId]: n + 1 }))}
                onSub={() =>
                  setQty((prev) => ({ ...prev, [drink.productId]: Math.max(0, n - 1) }))
                }
              />
            </li>
          );
        })}
      </ul>

      <AnimatePresence initial={false}>
        {count > 0 ? (
          <m.div
            key="pay"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <PillButton
              size="lg"
              variant="primary"
              className="mt-4 w-full justify-between"
              disabled={paying}
              onClick={pay}
            >
              <span>{paying ? "Adding…" : "Add to this round"}</span>
              <span className="tabular-nums">{formatCents(cents, currency)}</span>
            </PillButton>
          </m.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function QtyControl({
  name,
  qty,
  onAdd,
  onSub,
}: {
  name: string;
  qty: number;
  onAdd: () => void;
  onSub: () => void;
}) {
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${name}`}
        className="button button--primary button--sm shrink-0"
      >
        Add
      </button>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full bg-foreground p-0.5 text-background"
      role="group"
      aria-label={`${name} quantity`}
    >
      <button
        type="button"
        onClick={onSub}
        aria-label={qty === 1 ? `Remove ${name}` : `Decrease ${name}`}
        className="grid size-8 place-items-center rounded-full text-[18px] leading-none"
      >
        −
      </button>
      <span className="relative block h-5 min-w-5 overflow-hidden text-center text-[14px] font-semibold tabular-nums">
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={qty}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={SPRING}
            className="block"
          >
            {qty}
          </m.span>
        </AnimatePresence>
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Increase ${name}`}
        className="grid size-8 place-items-center rounded-full text-[18px] leading-none"
      >
        +
      </button>
    </div>
  );
}
