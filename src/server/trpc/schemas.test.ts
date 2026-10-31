import { describe, expect, it } from "vitest";
import { deviceId, kitchenChange, orderNumber, quoteLine, seat } from "./schemas";

describe("orderNumber", () => {
  it("accepts valid numbers and uppercases", () => {
    expect(orderNumber.safeParse("a-abcd").success).toBe(true);
    expect(orderNumber.parse("a-abcd")).toBe("A-ABCD");
  });

  it("rejects invalid", () => {
    expect(orderNumber.safeParse("A-12").success).toBe(false);
    expect(orderNumber.safeParse("no-code").success).toBe(false);
  });
});

describe("deviceId", () => {
  it("accepts alnum hyphen ids", () => {
    expect(deviceId.safeParse("device-12345678").success).toBe(true);
  });

  it("rejects short ids", () => {
    expect(deviceId.safeParse("short").success).toBe(false);
  });
});

describe("seat", () => {
  it("accepts seat object or null", () => {
    expect(seat.safeParse(null).success).toBe(true);
    expect(
      seat.safeParse({ sectionCode: "G", sectionName: "Lower", row: "", number: "12" }).success,
    ).toBe(true);
  });

  it("rejects partial seat", () => {
    expect(seat.safeParse({ sectionCode: "G" }).success).toBe(false);
  });
});

describe("quoteLine", () => {
  it("accepts minimal line", () => {
    expect(quoteLine.safeParse({ productId: "p", qty: 2 }).success).toBe(true);
  });

  it("rejects missing qty", () => {
    expect(quoteLine.safeParse({ productId: "p" }).success).toBe(false);
  });
});

describe("kitchenChange", () => {
  it("accepts discriminated changes", () => {
    expect(kitchenChange.safeParse({ to: "ready" }).success).toBe(true);
    expect(kitchenChange.safeParse({ to: "accepted", prepMinutes: 10 }).success).toBe(true);
    expect(kitchenChange.safeParse({ to: "declined", reason: "Too busy" }).success).toBe(true);
  });

  it("rejects declined without reason", () => {
    expect(kitchenChange.safeParse({ to: "declined" }).success).toBe(false);
  });
});
