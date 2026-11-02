import { describe, expect, it } from "vitest";
import { deskText, fanText, pushCopy } from "./copy";
import type { Receipt } from "@/lib/orders/receipt";

const receipt = {
  orderNumber: "A-K7M2",
  stadiumSlug: "arena",
  confirmCode: "4821",
  fulfillment: "delivery",
  kitchenStatus: "accepted",
  currency: "EUR",
  totalCents: 1250,
  lines: [
    { productId: "a", name: "Cola", qty: 2 },
    { productId: "b", name: "Fries", qty: 1 },
  ],
} as Receipt;

describe("fan notification text", () => {
  it("names the order and the hand-off code for each kitchen step", () => {
    expect(fanText(receipt, "en")).toEqual({ title: "Order A-K7M2 is being made", body: "The kitchen has started on it." });
    expect(fanText({ ...receipt, kitchenStatus: "ready" }, "en")?.title).toBe("Order A-K7M2 is on its way");
    expect(fanText({ ...receipt, kitchenStatus: "ready", fulfillment: "pickup" }, "da")).toEqual({
      title: "Ordre A-K7M2 er klar",
      body: "Hent den ved disken med koden 4821.",
    });
    expect(fanText({ ...receipt, kitchenStatus: "done" }, "sv")?.title).toBe("Order A-K7M2 är levererad");
    expect(fanText({ ...receipt, kitchenStatus: "declined", declineReason: "Out of cola." }, "en")?.body).toBe(
      "Out of cola. The payment goes back to your card.",
    );
  });

  it("stays quiet for a new order and falls back to English for an unknown language", () => {
    expect(fanText({ ...receipt, kitchenStatus: "new" }, "en")).toBeNull();
    expect(fanText(receipt, "fr")?.title).toBe("Order A-K7M2 is being made");
  });
});

describe("desk notification text", () => {
  it("counts items and formats the total", () => {
    expect(deskText(receipt, "en")).toEqual({ title: "New order A-K7M2", body: "3 items · €12.50" });
    expect(deskText({ ...receipt, lines: [{ productId: "a", name: "Cola", qty: 1 }] }, "sv").body).toBe("1 artikel · €12.50");
  });
});

it("keeps the same keys in every language", () => {
  const keys = Object.keys(pushCopy("en"));
  expect(Object.keys(pushCopy("sv"))).toEqual(keys);
  expect(Object.keys(pushCopy("da"))).toEqual(keys);
});
