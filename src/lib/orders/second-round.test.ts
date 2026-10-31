import { describe, expect, it } from "vitest";
import { mergeSecondRound, secondRoundLeft, SECOND_ROUND_MS } from "./second-round";
import type { Receipt } from "./receipt";

function receipt(overrides: Partial<Receipt> = {}): Receipt {
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
    paidAt: 1_000_000,
    readyAt: 1_500_000,
    runnerNote: "",
    confirmCode: "1234",
    totalCents: 800,
    lines: [{ productId: "cola", name: "Cola", qty: 1, unitCents: 300 }],
    ...overrides,
  };
}

describe("secondRoundLeft", () => {
  it("counts down until readyAt", () => {
    const r = receipt({ paidAt: 100, readyAt: 100 + SECOND_ROUND_MS + 1000 });
    expect(secondRoundLeft(r, 100)).toBe(SECOND_ROUND_MS);
    expect(secondRoundLeft(r, 100 + SECOND_ROUND_MS)).toBe(0);
    expect(secondRoundLeft(r, r.readyAt)).toBe(0);
  });
});

describe("mergeSecondRound", () => {
  it("no-ops on empty picks", () => {
    const r = receipt();
    expect(mergeSecondRound(r, [])).toBe(r);
    expect(mergeSecondRound(r, [{ productId: "x", name: "X", unitCents: 100, qty: 0 }])).toBe(r);
  });

  it("merges lines, total, and extends ETA", () => {
    const r = receipt();
    const next = mergeSecondRound(r, [
      { productId: "cola", name: "Cola", unitCents: 300, qty: 1 },
      { productId: "water", name: "Water", unitCents: 200, qty: 2 },
    ]);
    expect(next.lines.find((l) => l.productId === "cola")!.qty).toBe(2);
    expect(next.lines.find((l) => l.productId === "water")!.qty).toBe(2);
    expect(next.totalCents).toBe(800 + 300 + 400);
    expect(next.readyAt).toBeGreaterThan(r.readyAt);
    expect(next.etaMax).toBeGreaterThan(r.etaMax);
  });
});
