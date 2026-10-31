import { describe, expect, it } from "vitest";
import { cartLinesFromReceipt } from "./reorder";
import type { CatalogItem } from "@/lib/menu/catalog";
import type { Receipt } from "@/lib/orders/receipt";

const catalog: CatalogItem[] = [
  { productId: "cola", name: "Cola 0.5L", unitCents: 300, categoryId: "drinks", isSoldOut: false, needsChoice: false },
  { productId: "burger", name: "Cheeseburger", unitCents: 800, categoryId: "food", isSoldOut: false, needsChoice: true },
  { productId: "fries", name: "Fries", unitCents: 400, categoryId: "food", isSoldOut: true, needsChoice: false },
];

function receipt(lines: Receipt["lines"]): Receipt {
  return {
    orderNumber: "A-TEST",
    stadiumSlug: "arena",
    stadiumName: "Arena",
    seat: null,
    fulfillment: "delivery",
    timing: "asap",
    scheduledAt: null,
    etaMin: 10,
    etaMax: 15,
    paidAt: 0,
    readyAt: 0,
    runnerNote: "",
    confirmCode: "1234",
    lines,
  };
}

describe("cartLinesFromReceipt", () => {
  it("maps known products and merges duplicate keys", () => {
    const order = receipt([
      { productId: "cola", name: "Cola 0.5L", qty: 1, unitCents: 300 },
      { productId: "cola", name: "Cola 0.5L", qty: 2, unitCents: 300 },
    ]);
    const { lines, skipped } = cartLinesFromReceipt(order, catalog);
    expect(skipped).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(3);
    expect(lines[0].productId).toBe("cola");
  });

  it("matches by name when product id changed", () => {
    const order = receipt([{ productId: "old-id", name: "Cola 0.5L", qty: 1 }]);
    const { lines, skipped } = cartLinesFromReceipt(order, catalog);
    expect(skipped).toBe(0);
    expect(lines[0].productId).toBe("cola");
  });

  it("skips sold out, missing, and needs-choice without options", () => {
    const order = receipt([
      { productId: "fries", name: "Fries", qty: 1 },
      { productId: "missing", name: "Ghost", qty: 1 },
      { productId: "burger", name: "Cheeseburger", qty: 1 },
    ]);
    const { lines, skipped } = cartLinesFromReceipt(order, catalog);
    expect(lines).toHaveLength(0);
    expect(skipped).toBe(3);
  });

  it("keeps options and reprices when options present", () => {
    const order = receipt([
      {
        productId: "burger",
        name: "Cheeseburger",
        qty: 1,
        unitCents: 900,
        options: [{ id: "cheese", group: "Extra", name: "Extra cheese", cents: 100 }],
      },
    ]);
    const { lines, skipped } = cartLinesFromReceipt(order, catalog);
    expect(skipped).toBe(0);
    expect(lines[0].unitCents).toBe(900);
    expect(lines[0].options).toHaveLength(1);
  });
});
