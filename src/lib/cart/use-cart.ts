"use client";

import { useSyncExternalStore } from "react";
import { getCartStore } from "./store";

/** Subscribes to the cart for one stadium. Server snapshot is always empty, so SSR/hydration match. */
export function useCart(stadiumSlug: string) {
  const store = getCartStore(stadiumSlug);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { state, store };
}

/** Cheaper subscription for a single line — product cards re-render only when their own qty changes. */
export function useCartQty(stadiumSlug: string, productId: string): number {
  const store = getCartStore(stadiumSlug);
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().lines.find((l) => l.productId === productId)?.qty ?? 0,
    () => 0,
  );
}
