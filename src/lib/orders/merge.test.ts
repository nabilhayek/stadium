import { describe, expect, it } from "vitest";
import { mergeKitchen } from "./merge";
import type { Receipt } from "./receipt";

function base(overrides: Partial<Receipt> = {}): Receipt {
  return {
    orderNumber: "A-MERGE",
    stadiumSlug: "arena",
    stadiumName: "Arena",
    seat: null,
    fulfillment: "delivery",
    timing: "asap",
    scheduledAt: null,
    etaMin: 10,
    etaMax: 15,
    paidAt: 1,
    readyAt: 100,
    runnerNote: "local note",
    confirmCode: "1234",
    email: "fan@example.com",
    deviceId: "device-12345678",
    token: "phone-secret",
    lines: [{ productId: "p", name: "Item", qty: 1 }],
    ...overrides,
  };
}

describe("mergeKitchen", () => {
  it("returns null when server has no kitchen status", () => {
    expect(mergeKitchen(base(), base())).toBeNull();
  });

  it("returns null when nothing changed", () => {
    const local = base({ kitchenStatus: "accepted", readyAt: 200 });
    const server = base({ kitchenStatus: "accepted", readyAt: 200 });
    expect(mergeKitchen(local, server)).toBeNull();
  });

  it("applies kitchen fields without overwriting phone-owned fields", () => {
    const local = base({ kitchenStatus: "new", readyAt: 100, runnerNote: "keep me", token: "phone-secret" });
    const server = base({
      kitchenStatus: "accepted",
      readyAt: 500,
      declineReason: undefined,
      runnerNote: "server tried",
      token: "server-secret",
      deviceId: "other-device",
      email: "hacker@evil.com",
    });
    const next = mergeKitchen(local, server);
    expect(next).not.toBeNull();
    expect(next!.kitchenStatus).toBe("accepted");
    expect(next!.readyAt).toBe(500);
    expect(next!.runnerNote).toBe("keep me");
    expect(next!.token).toBe("phone-secret");
    expect(next!.deviceId).toBe("device-12345678");
    expect(next!.email).toBe("fan@example.com");
  });

  it("copies decline reason when present", () => {
    const local = base({ kitchenStatus: "new" });
    const server = base({ kitchenStatus: "declined", declineReason: "Too busy" });
    const next = mergeKitchen(local, server)!;
    expect(next.declineReason).toBe("Too busy");
  });
});
