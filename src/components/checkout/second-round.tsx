"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { PillButton } from "@/components/ui/pill-button";
import { EASE, SPRING, fadeUp } from "@/components/motion/variants";
import { formatCents } from "@/lib/money";
import type { Receipt } from "@/lib/orders/receipt";
import { commitReceipt } from "@/lib/orders/sync";
import { recordOrdered } from "@/lib/orders/history";
import { secondRoundLeft, type RoundPick } from "@/lib/orders/second-round";
import type { CatalogItem } from "@/lib/menu/catalog";
import { ChevronDown, CupSoda, Minus, Plus } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

type Props = {
  receipt: Receipt;
  drinks: CatalogItem[];
  now: number;
  onUpdate: (next: Receipt) => void;
};

/** Collapsed by default; the short list is enough for "one more of the same". */
const SHORTLIST = 4;

/**
 * Time-boxed "one more drink" on the tracker. Renders as a single disclosure
 * row so the code and countdown stay in view; expanding shows a shortlist,
 * with drinks already in the order first.
 */
export function SecondRound({ receipt, drinks, now, onUpdate }: Props) {
  const left = secondRoundLeft(receipt, now);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [paying, setPaying] = useState(false);
  const { toast } = useToast();
  const [added, setAdded] = useState<number | null>(null);
  const chargeKey = useRef(crypto.randomUUID());
  const trpc = useTRPC();
  const extra = useMutation(trpc.payments.extra.mutationOptions());

  const ordered = useMemo(() => {
    const inOrder = new Set(receipt.lines.map((l) => l.productId));
    return [...drinks].sort((a, b) => Number(inOrder.has(b.productId)) - Number(inOrder.has(a.productId)));
  }, [drinks, receipt.lines]);
  const shown = showAll ? ordered : ordered.slice(0, SHORTLIST);

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
    if (!receipt.token) {
      toast({ message: "This order can’t take another charge.", status: "error" });
      return;
    }
    setPaying(true);
    const addedCount = count;
    let message = "The connection dropped. Try again — you won’t be charged twice.";
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const data = await extra.mutateAsync({
            stadiumSlug: receipt.stadiumSlug,
            orderNumber: receipt.orderNumber,
            token: receipt.token,
            idempotencyKey: chargeKey.current,
            lines: picks.map((pick) => ({ productId: pick.productId, qty: pick.qty })),
          });
          if (data.ok) {
            commitReceipt(data.receipt);
            recordOrdered(
              receipt.stadiumSlug,
              picks.flatMap((pick) => Array.from({ length: pick.qty }, () => pick.productId)),
            );
            onUpdate(data.receipt);
            setQty({});
            setOpen(false);
            setAdded(addedCount);
            window.setTimeout(() => setAdded(null), 2400);
            navigator.vibrate?.(12);
            chargeKey.current = crypto.randomUUID();
            return;
          }
          if (data.status === 202 || data.status >= 500) {
            message = data.message || message;
            await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
            continue;
          }
          toast({
            message: data.message || "The bank declined this card. You haven’t been charged.",
            status: "error",
          });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        }
      }
      toast({ message, status: "error" });
    } finally {
      setPaying(false);
    }
  }

  const summary =
    added !== null
      ? `Added ${added} · arriving with your order`
      : count > 0
        ? `${count} picked · ${formatCents(cents, currency)}`
        : `Kitchen can still pack it · ${minutesLeft} min left`;

  return (
    <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-secondary">
          <CupSoda className="size-5" strokeWidth={1.7} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Add a drink to this round</span>
          <span className="relative mt-0.5 block h-[1.125rem] overflow-hidden text-[13px] leading-snug text-muted">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={summary}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="block truncate"
              >
                {summary}
              </m.span>
            </AnimatePresence>
          </span>
        </span>
        <m.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={SPRING}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-secondary text-muted"
          aria-hidden
        >
          <ChevronDown className="size-4" strokeWidth={2} />
        </m.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            key="panel"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <ul className="rule border-t border-separator">
                {shown.map((drink) => {
                  const n = qty[drink.productId] ?? 0;
                  return (
                    <li key={drink.productId} className="flex items-center justify-between gap-3 py-2.5">
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
                        onSub={() => setQty((prev) => ({ ...prev, [drink.productId]: Math.max(0, n - 1) }))}
                      />
                    </li>
                  );
                })}
              </ul>

              {ordered.length > SHORTLIST && !showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-1 text-[13px] font-medium text-link"
                >
                  Show all {ordered.length} drinks
                </button>
              ) : null}

              <AnimatePresence initial={false}>
                {count > 0 ? (
                  <m.div
                    key="pay"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <PillButton
                      size="lg"
                      variant="primary"
                      className="mt-3 w-full justify-between"
                      disabled={paying}
                      onClick={pay}
                    >
                      <span>{paying ? "Adding…" : "Add to this round"}</span>
                      <span className="tabular-nums">{formatCents(cents, currency)}</span>
                    </PillButton>
                  </m.div>
                ) : null}
              </AnimatePresence>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </m.section>
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
        className="grid size-8 place-items-center rounded-full"
      >
        <Minus className="size-3.5" strokeWidth={2.4} />
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
        className="grid size-8 place-items-center rounded-full"
      >
        <Plus className="size-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
