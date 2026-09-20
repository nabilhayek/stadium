"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals } from "@/lib/cart/store";
import { formatCents } from "@/lib/money";
import { SPRING } from "@/components/motion/variants";

// The drawer (and HeroUI's Drawer/react-aria overlay code) is only downloaded
// the first time the user opens the cart.
const CartDrawer = dynamic(() => import("./cart-drawer").then((mod) => mod.CartDrawer), {
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

  const visible = count > 0 && !isOpen;

  return (
    <>
      <AnimatePresence>
        {visible ? (
          <m.div
            key="bar"
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ ...SPRING, delay: 0.05 }}
            className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto w-full max-w-md">
              <m.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setHasOpened(true);
                  setIsOpen(true);
                }}
                className="button button--primary button--lg w-full justify-between shadow-[0_12px_32px_-12px_rgba(17,17,17,0.55)]"
              >
                <span className="flex items-center gap-2.5">
                  <span className="relative grid size-6 place-items-center overflow-hidden rounded-full bg-white/15 text-[12px] font-semibold tabular-nums">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <m.span
                        key={count}
                        initial={{ y: 12, opacity: 0, scale: 0.8 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -12, opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                      >
                        {count}
                      </m.span>
                    </AnimatePresence>
                  </span>
                  View cart
                </span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <m.span
                    key={cents}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="tabular-nums"
                  >
                    {formatCents(cents, currency)}
                  </m.span>
                </AnimatePresence>
              </m.button>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

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
