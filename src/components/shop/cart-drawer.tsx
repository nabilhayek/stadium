"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Button, Drawer } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals, type CartLine } from "@/lib/cart/store";
import { formatCents } from "@/lib/money";
import { EASE } from "@/components/motion/variants";

type Props = {
  stadiumSlug: string;
  currency: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CartDrawer({ stadiumSlug, currency, isOpen, onOpenChange }: Props) {
  const router = useRouter();
  const { state, store } = useCart(stadiumSlug);
  const { count, cents } = cartTotals(state);

  // One order per vendor downstream, so show the cart grouped the same way.
  const byVendor = new Map<string, CartLine[]>();
  for (const line of state.lines) {
    const arr = byVendor.get(line.vendorId) ?? [];
    arr.push(line);
    byVendor.set(line.vendorId, arr);
  }

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* Height cap belongs on the dialog, not Content — Content is `fixed inset-0`,
          so max-h there pins the panel to the top 85% and leaves a gap at the bottom. */}
      <Drawer.Content placement="bottom">
        <Drawer.Dialog
          aria-label="Your cart"
          className="max-h-[85dvh] rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading>Your cart</Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body className="flex flex-col gap-5">
            {count === 0 ? (
              <p className="py-8 text-center text-muted">Your cart is empty.</p>
            ) : (
              [...byVendor.entries()].map(([vendorId, lines]) => (
                <section key={vendorId} aria-label={lines[0].vendorName}>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    {lines[0].vendorName}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {lines.map((line) => (
                      <CartLineRow
                        key={line.productId}
                        line={line}
                        currency={currency}
                        onQty={(qty) => store.setQty(line.productId, qty)}
                        onNote={(note) => store.setNote(line.productId, note)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </Drawer.Body>

          <Drawer.Footer className="flex-col items-stretch gap-3">
            <div className="flex items-center justify-between text-base">
              <span className="text-muted">Total</span>
              <span className="font-semibold tabular-nums">{formatCents(cents, currency)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={store.clear} isDisabled={count === 0}>
                Clear
              </Button>
              {/* Next step in the flow: confirm seat → checkout → payment. */}
              <Button
                variant="primary"
                fullWidth
                isDisabled={count === 0}
                onPress={() => {
                  onOpenChange(false);
                  router.push(`/${stadiumSlug}/checkout`);
                }}
              >
                Checkout
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function CartLineRow({
  line,
  currency,
  onQty,
  onNote,
}: {
  line: CartLine;
  currency: string;
  onQty: (qty: number) => void;
  onNote: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasNote = Boolean(line.note);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{line.name}</p>
          <p className="text-[13px] tabular-nums text-muted">{formatCents(line.unitCents, currency)}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          aria-expanded={editing}
          aria-controls={inputId}
          aria-label={
            editing
              ? `Hide special instructions for ${line.name}`
              : hasNote
                ? `Edit special instructions for ${line.name}`
                : `Add special instructions for ${line.name}`
          }
          className={[
            "grid size-9 shrink-0 place-items-center rounded-full",
            editing || hasNote ? "bg-foreground text-background" : "bg-default text-muted",
          ].join(" ")}
        >
          <PenIcon />
        </button>
        <div className="flex items-center gap-1 rounded-full bg-default p-0.5">
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={() => onQty(line.qty - 1)}
            aria-label={`Decrease ${line.name}`}
          >
            −
          </Button>
          <span className="min-w-5 text-center text-sm font-medium tabular-nums">{line.qty}</span>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={() => onQty(line.qty + 1)}
            aria-label={`Increase ${line.name}`}
          >
            +
          </Button>
        </div>
        <p className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">
          {formatCents(line.qty * line.unitCents, currency)}
        </p>
      </div>

      {!editing && hasNote ? (
        <p className="truncate pl-0.5 text-[13px] text-muted">{line.note}</p>
      ) : null}

      <AnimatePresence initial={false}>
        {editing ? (
          <m.label
            key="note"
            htmlFor={inputId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="block overflow-hidden"
          >
            <span className="sr-only">Special instructions for {line.name}</span>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="Allergies or extras"
              defaultValue={line.note ?? ""}
              onChange={(e) => onNote(e.target.value)}
              onBlur={() => {
                if (!line.note) setEditing(false);
              }}
              className="input input--secondary input--full-width mt-0.5 min-h-10 rounded-xl border border-border bg-surface px-3 text-[13px]"
            />
          </m.label>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function PenIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.4 4.1 15.9 7.6 7.2 16.3H3.7v-3.5z" />
      <path d="m11.1 5.4 3.5 3.5" />
    </svg>
  );
}
