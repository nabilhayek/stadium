import type { CartState } from "@/lib/cart/store";

/** Prep + walk time. Extra vendors (split orders) add a couple of minutes. */
export function estimateDelivery(state: CartState) {
  const vendors = new Set(state.lines.map((l) => l.vendorId)).size;
  const items = state.lines.reduce((n, l) => n + l.qty, 0);
  const min = Math.min(18, Math.max(6, 5 + vendors * 2 + Math.ceil(items / 3)));
  const max = min + 4;
  return { min, max };
}

export function arrivalClock(minutes: number, now = Date.now()): string {
  return new Date(now + minutes * 60_000).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}
