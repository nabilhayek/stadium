"use client";

import { AnimatePresence, m } from "framer-motion";
import { useCartQty } from "@/lib/cart/use-cart";
import { getCartStore, type AddableProduct } from "@/lib/cart/store";
import { SPRING } from "@/components/motion/variants";

type Props = {
  stadiumSlug: string;
  product: AddableProduct;
};

/** "Add" pill that morphs into a −/qty/+ stepper once the product is in the cart. */
export function AddToCartButton({ stadiumSlug, product }: Props) {
  const qty = useCartQty(stadiumSlug, product.productId);
  const store = getCartStore(stadiumSlug);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {qty === 0 ? (
        <m.button
          key="add"
          type="button"
          layout
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileTap={{ scale: 0.92 }}
          transition={SPRING}
          onClick={() => store.add(product)}
          aria-label={`Add ${product.name} to cart`}
          className="button button--primary button--sm shrink-0"
        >
          Add
        </m.button>
      ) : (
        <m.div
          key="stepper"
          layout
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={SPRING}
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-foreground p-0.5 text-background"
          role="group"
          aria-label={`${product.name} quantity`}
        >
          <m.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => store.setQty(product.productId, qty - 1)}
            aria-label={qty === 1 ? `Remove ${product.name}` : `Decrease ${product.name}`}
            className="grid size-8 place-items-center rounded-full text-[18px] leading-none"
          >
            −
          </m.button>
          <span className="relative block h-5 min-w-5 overflow-hidden text-center text-[14px] font-semibold tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={qty}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="block"
                aria-live="polite"
              >
                {qty}
              </m.span>
            </AnimatePresence>
          </span>
          <m.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => store.add(product)}
            aria-label={`Increase ${product.name}`}
            className="grid size-8 place-items-center rounded-full text-[18px] leading-none"
          >
            +
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
