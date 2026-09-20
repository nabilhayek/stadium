"use client";

import { PillButton } from "@/components/ui/pill-button";
import { useCartQty } from "@/lib/cart/use-cart";
import { getCartStore, type AddableProduct } from "@/lib/cart/store";

type Props = {
  stadiumSlug: string;
  product: AddableProduct;
};

/** "Add" pill that turns into a −/qty/+ stepper once the product is in the cart. */
export function AddToCartButton({ stadiumSlug, product }: Props) {
  const qty = useCartQty(stadiumSlug, product.productId);
  const store = getCartStore(stadiumSlug);

  if (qty === 0) {
    return (
      <PillButton
        size="sm"
        variant="primary"
        onClick={() => store.add(product)}
        aria-label={`Add ${product.name} to cart`}
      >
        Add
      </PillButton>
    );
  }

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-default p-0.5"
      role="group"
      aria-label={`${product.name} quantity`}
    >
      <PillButton
        size="sm"
        variant="ghost"
        isIconOnly
        onClick={() => store.setQty(product.productId, qty - 1)}
        aria-label={qty === 1 ? `Remove ${product.name}` : `Decrease ${product.name}`}
      >
        −
      </PillButton>
      <span className="min-w-5 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {qty}
      </span>
      <PillButton
        size="sm"
        variant="ghost"
        isIconOnly
        onClick={() => store.add(product)}
        aria-label={`Increase ${product.name}`}
      >
        +
      </PillButton>
    </div>
  );
}
