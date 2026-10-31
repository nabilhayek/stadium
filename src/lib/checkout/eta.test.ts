import { describe, expect, it } from "vitest";
import { arrivalClock, estimateDelivery } from "./eta";
import type { CartState } from "@/lib/cart/store";

function cart(qtys: number[]): CartState {
  return {
    lines: qtys.map((qty, i) => ({
      key: `p${i}`,
      productId: `p${i}`,
      name: `Item ${i}`,
      unitCents: 100,
      qty,
    })),
  };
}

describe("estimateDelivery", () => {
  it("pickup is faster than delivery", () => {
    const state = cart([1, 2, 3]);
    const delivery = estimateDelivery(state, "delivery");
    const pickup = estimateDelivery(state, "pickup");
    expect(pickup.min).toBeLessThanOrEqual(delivery.min);
    expect(pickup.max).toBeLessThanOrEqual(delivery.max);
  });

  it("empty cart still returns bounded range", () => {
    const { min, max } = estimateDelivery({ lines: [] }, "delivery");
    expect(min).toBeGreaterThanOrEqual(6);
    expect(max).toBe(min + 4);
  });
});

describe("arrivalClock", () => {
  it("formats a future time", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0);
    const label = arrivalClock(30, now);
    expect(label).toMatch(/\d/);
  });
});
