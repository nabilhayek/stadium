import { describe, expect, it } from "vitest";
import { cartTotals, quoteLines, toCartLine } from "./store";

describe("toCartLine", () => {
  it("builds key from product and sorted option ids", () => {
    const line = toCartLine({ productId: "p1", name: "Burger", unitCents: 500, options: [{ id: "b", group: "Sauce", name: "BBQ", cents: 50 }] }, 2);
    expect(line.key).toBe("p1|b");
    expect(line.qty).toBe(2);
    expect(line.options).toHaveLength(1);
  });

  it("drops empty options array", () => {
    const line = toCartLine({ productId: "p1", name: "Water", unitCents: 200 }, 1);
    expect(line.key).toBe("p1");
    expect(line.options).toBeUndefined();
  });
});

describe("quoteLines", () => {
  it("maps lines to server quote shape", () => {
    const lines = [
      toCartLine({ productId: "a", name: "A", unitCents: 100, note: "no ice" }, 1),
      toCartLine(
        { productId: "b", name: "B", unitCents: 200, options: [{ id: "o1", group: "G", name: "O", cents: 0 }] },
        3,
      ),
    ];
    expect(quoteLines(lines)).toEqual([
      { productId: "a", qty: 1, note: "no ice" },
      { productId: "b", qty: 3, options: ["o1"] },
    ]);
  });

  it("omits note and options when absent", () => {
    expect(quoteLines([toCartLine({ productId: "x", name: "X", unitCents: 0 }, 1)])).toEqual([{ productId: "x", qty: 1 }]);
  });
});

describe("cartTotals", () => {
  it("sums count and cents", () => {
    const state = {
      lines: [toCartLine({ productId: "a", name: "A", unitCents: 350 }, 2), toCartLine({ productId: "b", name: "B", unitCents: 100 }, 1)],
    };
    expect(cartTotals(state)).toEqual({ count: 3, cents: 800 });
  });

  it("empty cart", () => {
    expect(cartTotals({ lines: [] })).toEqual({ count: 0, cents: 0 });
  });
});
