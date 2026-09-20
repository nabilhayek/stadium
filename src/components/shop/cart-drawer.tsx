"use client";

import { Button, Drawer } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals, type CartLine } from "@/lib/cart/store";
import { formatCents } from "@/lib/money";

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
                      <li key={line.productId} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{line.name}</p>
                          <p className="text-[13px] tabular-nums text-muted">
                            {formatCents(line.unitCents, currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-default p-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            onPress={() => store.setQty(line.productId, line.qty - 1)}
                            aria-label={`Decrease ${line.name}`}
                          >
                            −
                          </Button>
                          <span className="min-w-5 text-center text-sm font-medium tabular-nums">
                            {line.qty}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            onPress={() => store.setQty(line.productId, line.qty + 1)}
                            aria-label={`Increase ${line.name}`}
                          >
                            +
                          </Button>
                        </div>
                        <p className="w-16 text-right text-sm font-medium tabular-nums">
                          {formatCents(line.qty * line.unitCents, currency)}
                        </p>
                      </li>
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
