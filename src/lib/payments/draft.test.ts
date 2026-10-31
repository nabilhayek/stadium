import { describe, expect, it } from "vitest";
import { checkoutDraft, parseDraft, receiptFromDraft } from "./draft";
import type { CheckoutDraft } from "./draft";

const baseCheckout = {
  orderNumber: "A-ABCD",
  stadiumSlug: "arena",
  seat: null,
  fulfillment: "delivery" as const,
  timing: "asap" as const,
  scheduledAt: null,
  etaMin: 10,
  etaMax: 15,
  confirmCode: "1234",
  deviceId: "device-12345678",
  token: "secret-token",
};

describe("checkoutDraft", () => {
  it("fills lines and currency from priced order", () => {
    const draft = checkoutDraft({
      ...baseCheckout,
      priced: {
        stadiumId: "s1",
        stadiumName: "Arena",
        currency: "EUR",
        totalCents: 500,
        lines: [{ productId: "p1", name: "Cola", qty: 1, unitCents: 500 }],
      },
    });
    expect(draft.kind).toBe("checkout");
    expect(draft.stadiumName).toBe("Arena");
    expect(draft.currency).toBe("EUR");
    expect(draft.lines).toHaveLength(1);
  });
});

describe("parseDraft", () => {
  it("parses checkout and extra drafts", () => {
    const checkout: CheckoutDraft = {
      kind: "checkout",
      ...baseCheckout,
      stadiumName: "Arena",
      currency: "EUR",
      lines: [],
    };
    expect(parseDraft(checkout)).toEqual(checkout);
    expect(
      parseDraft({
        kind: "extra",
        orderNumber: "A-EXTRA",
        stadiumSlug: "arena",
        lines: [{ productId: "p", name: "X", qty: 1 }],
      }),
    ).toMatchObject({ kind: "extra" });
  });

  it("rejects invalid shapes", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ kind: "checkout", orderNumber: "A-X", token: "t", deviceId: "short" })).toBeNull();
    expect(parseDraft({ kind: "extra", orderNumber: "A-X" })).toBeNull();
    expect(parseDraft({ kind: "unknown" })).toBeNull();
  });
});

describe("receiptFromDraft", () => {
  it("computes readyAt and total from lines", () => {
    const paidAt = 1_000_000;
    const draft: CheckoutDraft = {
      kind: "checkout",
      ...baseCheckout,
      stadiumName: "Arena",
      currency: "EUR",
      lines: [
        { productId: "a", name: "A", qty: 2, unitCents: 250 },
        { productId: "b", name: "B", qty: 1, unitCents: 100 },
      ],
    };
    const receipt = receiptFromDraft(draft, paidAt);
    expect(receipt).not.toBeNull();
    expect(receipt!.totalCents).toBe(600);
    expect(receipt!.readyAt).toBe(paidAt + draft.etaMax * 60_000);
    expect(receipt!.paidAt).toBe(paidAt);
  });

  it("uses scheduledAt when in the future", () => {
    const paidAt = 1_000_000;
    const scheduledAt = paidAt + 60 * 60_000;
    const draft: CheckoutDraft = {
      kind: "checkout",
      ...baseCheckout,
      timing: "scheduled",
      scheduledAt,
      stadiumName: "Arena",
      currency: "EUR",
      lines: [{ productId: "a", name: "A", qty: 1, unitCents: 100 }],
    };
    expect(receiptFromDraft(draft, paidAt)!.readyAt).toBe(scheduledAt);
  });
});
