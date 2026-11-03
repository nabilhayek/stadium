"use client";

import { AnimatePresence, m } from "framer-motion";
import { useCartQty } from "@/lib/cart/use-cart";
import { getCartStore, type AddableProduct } from "@/lib/cart/store";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";

type Props = {
  stadiumSlug: string;
  product: AddableProduct;
  /** Tighter control for the popular rail. */
  dense?: boolean;
};

/** "Add" pill that swaps to a −/qty/+ stepper once the product is in the cart. */
export function AddToCartButton({ stadiumSlug, product, dense = false }: Props) {
  const t = useTranslations("shop");
  const tc = useTranslations("cart");
  const qty = useCartQty(stadiumSlug, product.productId);
  const store = getCartStore(stadiumSlug);
  const hit = dense ? "size-7 text-[16px]" : "size-8 text-[18px]";

  return (
    <div className={dense ? "flex shrink-0 justify-end" : "flex w-[6.75rem] shrink-0 justify-end"}>
      {qty === 0 ? (
        <button
          type="button"
          onClick={() => store.add(product)}
          aria-label={t("addNamed", { name: product.name })}
          className="button button--primary button--sm shrink-0 active:scale-[0.92]"
        >
          {t("add")}
        </button>
      ) : (
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-foreground p-0.5 text-background"
          role="group"
          aria-label={t("quantityOf", { name: product.name })}
        >
          <button
            type="button"
            onClick={() => store.setQty(product.productId, qty - 1)}
            aria-label={qty === 1 ? t("removeNamed", { name: product.name }) : tc("decrease", { name: product.name })}
            className={`grid ${hit} place-items-center rounded-full leading-none active:scale-90`}
          >
            <Minus className="size-3.5" strokeWidth={2.4} />
          </button>
          <span className="relative block h-5 min-w-5 overflow-hidden text-center text-[14px] font-semibold tabular-nums">
            <AnimatePresence mode="wait" initial={false}>
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
          <button
            type="button"
            onClick={() => store.add(product)}
            aria-label={tc("increase", { name: product.name })}
            className={`grid ${hit} place-items-center rounded-full leading-none active:scale-90`}
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}
