import type { CartState } from "@/lib/cart/store";
import type { Fulfillment } from "@/lib/orders/receipt";

/** Prep + walk time. Extra vendors (split orders) add a couple of minutes. */
export function estimateDelivery(state: CartState, fulfillment: Fulfillment = "delivery") {
  const vendors = new Set(state.lines.map((l) => l.vendorId)).size;
  const items = state.lines.reduce((n, l) => n + l.qty, 0);
  const base = fulfillment === "pickup" ? 3 : 5;
  const walk = fulfillment === "pickup" ? 0 : vendors * 2;
  const min = Math.min(18, Math.max(fulfillment === "pickup" ? 4 : 6, base + walk + Math.ceil(items / 3)));
  const max = min + (fulfillment === "pickup" ? 3 : 4);
  return { min, max };
}

export function arrivalClock(minutes: number, now = Date.now()): string {
  return new Date(now + minutes * 60_000).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}
