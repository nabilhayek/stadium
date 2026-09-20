"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/ui/pill-button";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals } from "@/lib/cart/store";
import { formatCents } from "@/lib/money";

// The drawer (and HeroUI's Drawer/react-aria overlay code) is only downloaded
// the first time the user opens the cart.
const CartDrawer = dynamic(() => import("./cart-drawer").then((m) => m.CartDrawer), {
  ssr: false,
});

type Props = { stadiumSlug: string; currency: string };

export function CartBar({ stadiumSlug, currency }: Props) {
  const router = useRouter();
  const { state } = useCart(stadiumSlug);
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const { count, cents } = cartTotals(state);

  useEffect(() => {
    if (count > 0) router.prefetch(`/${stadiumSlug}/checkout`);
  }, [count, router, stadiumSlug]);

  if (count === 0 && !isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        hidden={isOpen}
      >
        <PillButton
          size="lg"
          variant="primary"
          fullWidth
          className="justify-between shadow-lg shadow-black/50"
          onClick={() => {
            setHasOpened(true);
            setIsOpen(true);
          }}
        >
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs tabular-nums">{count}</span>
            View cart
          </span>
          <span className="tabular-nums">{formatCents(cents, currency)}</span>
        </PillButton>
      </div>

      {hasOpened ? (
        <CartDrawer
          stadiumSlug={stadiumSlug}
          currency={currency}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        />
      ) : null}
    </>
  );
}
