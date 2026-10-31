import { describe, expect, it } from "vitest";
import {
  confirmDigits,
  earliestSchedule,
  isOrderLive,
  isOrderNumber,
  isValidEmail,
  isValidSchedule,
  makeConfirmCode,
  makeOrderNumber,
  statusTitle,
  MAX_LEAD_MIN,
  MIN_LEAD_MIN,
} from "./receipt";
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
    readyAt: 1_100_000,
    runnerNote: "",
    confirmCode: "42",
    lines: [{ productId: "p", name: "Item", qty: 1 }],
    ...overrides,
  };
}

describe("makeOrderNumber / isOrderNumber", () => {
  it("generates valid order numbers", () => {
    for (let i = 0; i < 20; i++) {
      const n = makeOrderNumber();
      expect(n).toMatch(/^A-/);
      expect(isOrderNumber(n)).toBe(true);
      expect(n).not.toMatch(/[01OI]/);
    }
  });

  it("rejects invalid strings", () => {
    expect(isOrderNumber("A-12")).toBe(false);
    expect(isOrderNumber("AA-1234")).toBe(false);
    expect(isOrderNumber("")).toBe(false);
  });
});

describe("makeConfirmCode / confirmDigits", () => {
  it("makeConfirmCode is four digits", () => {
    expect(makeConfirmCode()).toMatch(/^\d{4}$/);
  });

  it("confirmDigits normalizes input", () => {
    expect(confirmDigits("12")).toEqual(["0", "0", "1", "2"]);
    expect(confirmDigits(undefined, "99")).toEqual(["0", "0", "9", "9"]);
    expect(confirmDigits("ab34cd")).toEqual(["0", "0", "3", "4"]);
  });
});

describe("earliestSchedule / isValidSchedule", () => {
  const now = new Date("2026-06-01T10:07:30.000Z").getTime();

  it("rounds up to 5-minute grid after lead time", () => {
    const earliest = earliestSchedule(now);
    expect(earliest).toBeGreaterThan(now + MIN_LEAD_MIN * 60_000 - 1000);
    expect(new Date(earliest).getMinutes() % 5).toBe(0);
    expect(new Date(earliest).getSeconds()).toBe(0);
  });

  it("validates window", () => {
    const earliest = earliestSchedule(now);
    expect(isValidSchedule(earliest, now)).toBe(true);
    expect(isValidSchedule(earliest - 1, now)).toBe(false);
    expect(isValidSchedule(now + MAX_LEAD_MIN * 60_000 + 1, now)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts common addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });

  it("rejects invalid", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("statusTitle", () => {
  const now = 1_000_000;

  it("kitchen status wins", () => {
    expect(statusTitle(receipt({ kitchenStatus: "declined" }), now)).toBe("Order declined");
    expect(statusTitle(receipt({ kitchenStatus: "ready", fulfillment: "pickup" }), now)).toBe("Ready for pickup");
  });

  it("falls back to clock when no kitchen status", () => {
    expect(statusTitle(receipt({ readyAt: now + 60_000 }), now)).toBe("On the way");
    expect(statusTitle(receipt({ readyAt: now - 1, fulfillment: "pickup" }), now)).toBe("Ready for pickup");
  });
});

describe("isOrderLive", () => {
  it("stays live for linger window after readyAt", () => {
    const r = receipt({ readyAt: 1_000_000 });
    expect(isOrderLive(r, 1_000_000)).toBe(true);
    expect(isOrderLive(r, 1_000_000 + 30 * 60_000 - 1)).toBe(true);
    expect(isOrderLive(r, 1_000_000 + 30 * 60_000)).toBe(false);
  });
});
