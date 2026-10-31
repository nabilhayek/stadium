import { describe, expect, it } from "vitest";
import { publicReceipt, toReceipt } from "./shape";

const valid = {
  orderNumber: "A-ABCD",
  stadiumSlug: "arena",
  stadiumName: "Arena",
  seat: { sectionCode: "G", sectionName: "Lower", row: "1", number: "2" },
  fulfillment: "delivery",
  timing: "asap",
  scheduledAt: null,
  etaMin: 10,
  etaMax: 15,
  paidAt: 1,
  readyAt: 2,
  runnerNote: "",
  confirmCode: "1234",
  deviceId: "device-12345678",
  token: "secret",
  lines: [{ productId: "p1", name: "Cola", qty: 1, unitCents: 300 }],
};

describe("toReceipt", () => {
  it("accepts well-formed receipts", () => {
    expect(toReceipt(valid)).toMatchObject({ orderNumber: "A-ABCD", deviceId: "device-12345678" });
  });

  it("rejects garbage", () => {
    expect(toReceipt(null)).toBeNull();
    expect(toReceipt({ ...valid, fulfillment: "teleport" })).toBeNull();
    expect(toReceipt({ ...valid, lines: [] })).toBeNull();
    expect(toReceipt({ ...valid, lines: [{ productId: "", name: "X", qty: 1 }] })).toBeNull();
  });
});

describe("publicReceipt", () => {
  it("strips secrets", () => {
    const r = toReceipt(valid)!;
    const pub = publicReceipt(r);
    expect("token" in pub).toBe(false);
    expect("deviceId" in pub).toBe(false);
    expect(pub.orderNumber).toBe(r.orderNumber);
    expect(pub.lines).toEqual(r.lines);
  });
});
