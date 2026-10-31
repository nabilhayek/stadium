import "../support/server-mocks";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { withDb } from "@/lib/db";
import { putReceipt } from "@/lib/orders/server";
import { makeOrderNumber, makeReceiptToken } from "@/lib/orders/receipt";
import { makeReceiptFixture } from "../support/factories";
import { publicCaller } from "../support/caller";

/** Orders only exist once a payment confirmed them, so tests create them the way the payment service does. */
async function seedPaidReceipt(overrides?: Parameters<typeof makeReceiptFixture>[0]) {
  const receipt = makeReceiptFixture(overrides);
  const result = await putReceipt(receipt, { authoritative: true });
  expect(result).toBe("created");
  return receipt;
}

describe("orders.put", () => {
  it("refuses to create an order that no payment confirmed", async () => {
    const receipt = makeReceiptFixture();
    const { result } = await publicCaller().orders.put(receipt);
    expect(result).toBe("payment-required");
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(0);
  });

  it("lets the phone refresh its note and seat with the token, but not money or lines", async () => {
    const paid = await seedPaidReceipt({ totalCents: 350 });

    const { result } = await publicCaller().orders.put({
      ...paid,
      runnerNote: "Blue jacket, aisle seat",
      email: "fan@example.com",
      seat: { sectionCode: "N", sectionName: "North Stand", row: "2", number: "11" },
      totalCents: 1,
      lines: [{ productId: "p1", name: "Free beer", qty: 99, unitCents: 0, options: [] }],
    });
    expect(result).toBe("updated");

    const stored = await publicCaller().orders.get({ stadium: "arena", orderNumber: paid.orderNumber });
    expect(stored).toMatchObject({
      runnerNote: "Blue jacket, aisle seat",
      email: "fan@example.com",
      seat: { row: "2", number: "11" },
      totalCents: 350,
    });
    // The parser drops empty notes/options, so compare the meaningful fields.
    expect(stored!.lines).toEqual([{ productId: "p1", name: "Cola 0.5L", qty: 1, unitCents: 350 }]);
  });

  it("rejects an update with the wrong token", async () => {
    const paid = await seedPaidReceipt();
    const { result } = await publicCaller().orders.put({ ...paid, token: makeReceiptToken(), runnerNote: "hijacked" });
    expect(result).toBe("forbidden");

    const stored = await publicCaller().orders.get({ stadium: "arena", orderNumber: paid.orderNumber });
    expect(stored!.runnerNote).toBe("");
  });

  it("forbids a receipt that carries no token or device id", async () => {
    const paid = await seedPaidReceipt();
    const { token: _token, ...noToken } = paid;
    expect((await publicCaller().orders.put(noToken)).result).toBe("forbidden");
    const { deviceId: _device, ...noDevice } = paid;
    expect((await publicCaller().orders.put(noDevice)).result).toBe("forbidden");
  });

  it("reports an unknown stadium", async () => {
    const { result } = await publicCaller().orders.put(makeReceiptFixture({ stadiumSlug: "nowhere" }));
    expect(result).toBe("no-stadium");
  });

  it("throws BAD_REQUEST for a document that is not a receipt", async () => {
    await expect(publicCaller().orders.put({ orderNumber: "A-ABCD" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(publicCaller().orders.put({ orderNumber: "A-ABCD" })).rejects.toBeInstanceOf(TRPCError);
  });

  it("never lets the phone roll back what the kitchen decided", async () => {
    const paid = await seedPaidReceipt();
    await withDb((db) =>
      db.receipt.updateMany({
        where: { orderNumber: paid.orderNumber },
        data: { kitchenStatus: "READY", body: { ...paid, token: undefined, deviceId: undefined, kitchenStatus: "ready" } },
      }),
    );
    await publicCaller().orders.put({ ...paid, kitchenStatus: "new", runnerNote: "late note" });

    const stored = await publicCaller().orders.get({ stadium: "arena", orderNumber: paid.orderNumber });
    expect(stored!.kitchenStatus).toBe("ready");
    expect(stored!.runnerNote).toBe("late note");
  });
});

describe("orders.get", () => {
  it("returns the public copy without the token or device id", async () => {
    const paid = await seedPaidReceipt();
    const got = await publicCaller().orders.get({ stadium: "arena", orderNumber: paid.orderNumber });

    expect(got).not.toBeNull();
    expect(got!.orderNumber).toBe(paid.orderNumber);
    expect(got!.confirmCode).toBe(paid.confirmCode);
    expect(got).not.toHaveProperty("token");
    expect(got).not.toHaveProperty("deviceId");
    expect(JSON.stringify(got)).not.toContain(paid.token!);
    expect(JSON.stringify(got)).not.toContain(paid.deviceId!);
  });

  it("accepts a lower-case order number", async () => {
    const paid = await seedPaidReceipt();
    const got = await publicCaller().orders.get({ stadium: "arena", orderNumber: paid.orderNumber.toLowerCase() });
    expect(got?.orderNumber).toBe(paid.orderNumber);
  });

  it("returns null for an order the server has never seen", async () => {
    await expect(publicCaller().orders.get({ stadium: "arena", orderNumber: makeOrderNumber() })).resolves.toBeNull();
  });

  it("returns null when the order belongs to another stadium slug", async () => {
    const paid = await seedPaidReceipt();
    await expect(publicCaller().orders.get({ stadium: "elsewhere", orderNumber: paid.orderNumber })).resolves.toBeNull();
  });

  it("rejects a malformed order number", async () => {
    await expect(publicCaller().orders.get({ stadium: "arena", orderNumber: "nope" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("orders.history", () => {
  it("lists only this device's receipts, newest first, with secrets", async () => {
    const now = Date.now();
    const older = await seedPaidReceipt({ deviceId: "device-aaaa-0001", paidAt: now - 60_000, readyAt: now });
    const newer = await seedPaidReceipt({ deviceId: "device-aaaa-0001", paidAt: now, readyAt: now + 60_000 });
    await seedPaidReceipt({ deviceId: "device-bbbb-0002" });

    const history = await publicCaller().orders.history({ stadium: "arena", device: "device-aaaa-0001" });

    expect(history.map((r) => r.orderNumber)).toEqual([newer.orderNumber, older.orderNumber]);
    for (const r of history) {
      expect(r.deviceId).toBe("device-aaaa-0001");
      expect(r.token).toBeTruthy();
    }
    expect(history[0].token).toBe(newer.token);
  });

  it("is empty for a device with no orders or at another stadium", async () => {
    await seedPaidReceipt({ deviceId: "device-aaaa-0001" });
    await expect(publicCaller().orders.history({ stadium: "arena", device: "device-zzzz-9999" })).resolves.toEqual([]);
    await expect(publicCaller().orders.history({ stadium: "elsewhere", device: "device-aaaa-0001" })).resolves.toEqual([]);
  });

  it("rejects an invalid device id", async () => {
    await expect(publicCaller().orders.history({ stadium: "arena", device: "short" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
