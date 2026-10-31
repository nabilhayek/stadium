import "../support/server-mocks";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { putReceipt } from "@/lib/orders/server";
import { getStripe, resetStripeClient } from "@/lib/stripe";
import { makeConfirmCode, makeOrderNumber, makeReceiptToken } from "@/lib/orders/receipt";
import { createKitchenUser, createProduct, makeReceiptFixture } from "../support/factories";
import { clearKitchenSession, kitchenCaller, makeSession, publicCaller } from "../support/caller";
import { applyTestEnv } from "../support/env";
import { resetFakeStripe, startFakeStripe } from "../support/fake-stripe/server";

let fake: Awaited<ReturnType<typeof startFakeStripe>>;

beforeAll(async () => {
  fake = await startFakeStripe();
  applyTestEnv({ stripeBase: fake.url });
  resetStripeClient();
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  resetFakeStripe();
  applyTestEnv({ stripeBase: fake.url });
  resetStripeClient();
  clearKitchenSession();
});

afterEach(() => {
  clearKitchenSession();
});

async function signedInDesk() {
  const { user } = await createKitchenUser();
  return kitchenCaller(makeSession(user.id, user.email));
}

async function paidReceipt(overrides?: Parameters<typeof makeReceiptFixture>[0]) {
  const receipt = makeReceiptFixture(overrides);
  expect(await putReceipt(receipt, { authoritative: true })).toBe("created");
  return receipt;
}

const readReceipt = (orderNumber: string) => publicCaller().orders.get({ stadium: "arena", orderNumber });

describe("kitchen auth", () => {
  it("rejects every kitchen procedure without a session", async () => {
    clearKitchenSession();
    const caller = publicCaller();
    await expect(caller.kitchen.board({ stadium: "arena" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.kitchen.summary({ stadium: "arena" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.kitchen.overview({ stadium: "arena", range: "12h" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.kitchen.update({ stadium: "arena", orderNumber: "A-ABCD", change: { to: "ready" } })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("does not change an order for an unauthorized caller", async () => {
    const receipt = await paidReceipt();
    clearKitchenSession();
    await expect(publicCaller().kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber, change: { to: "done" } })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect((await readReceipt(receipt.orderNumber))!.kitchenStatus).toBe("new");
  });
});

describe("kitchen board", () => {
  it("lists open orders oldest first with the fields the desk needs", async () => {
    const now = Date.now();
    const second = await paidReceipt({ paidAt: now, readyAt: now + 600_000, seat: { sectionCode: "E", sectionName: "East Stand", row: "4", number: "7" } });
    const first = await paidReceipt({ paidAt: now - 120_000, readyAt: now + 480_000, runnerNote: "Red scarf" });
    const desk = await signedInDesk();

    const board = await desk.kitchen.board({ stadium: "arena" });

    expect(board.map((o) => o.orderNumber)).toEqual([first.orderNumber, second.orderNumber]);
    expect(board[0]).toMatchObject({
      status: "new",
      fulfillment: "delivery",
      confirmCode: first.confirmCode,
      runnerNote: "Red scarf",
      totalCents: 350,
      currency: "EUR",
      lines: [expect.objectContaining({ qty: 1, name: "Cola 0.5L" })],
    });
  });

  it("is empty for a stadium with no orders and counts columns in the summary", async () => {
    const desk = await signedInDesk();
    await expect(desk.kitchen.board({ stadium: "arena" })).resolves.toEqual([]);
    await expect(desk.kitchen.summary({ stadium: "arena" })).resolves.toEqual({ board: { new: 0, accepted: 0, ready: 0 }, waiting: 0 });

    const old = await paidReceipt({ paidAt: Date.now() - 10 * 60_000 });
    await paidReceipt();
    await desk.kitchen.update({ stadium: "arena", orderNumber: old.orderNumber, change: { to: "accepted" } });

    const summary = await desk.kitchen.summary({ stadium: "arena" });
    expect(summary.board).toEqual({ new: 1, accepted: 1, ready: 0 });
  });

  it("overview totals orders and revenue for the range", async () => {
    await paidReceipt({ totalCents: 700 });
    await paidReceipt({ totalCents: 300 });
    const desk = await signedInDesk();

    const overview = await desk.kitchen.overview({ stadium: "arena", range: "12h" });
    expect(overview.orders.total).toBe(2);
    expect(overview.revenue.total).toBe(1000);
    expect(overview.recent).toHaveLength(2);
  });
});

describe("kitchen update", () => {
  it("walks an order accept → ready → done and drops it off the board", async () => {
    const receipt = await paidReceipt();
    const desk = await signedInDesk();
    const { orderNumber } = receipt;
    const before = Date.now();

    await expect(desk.kitchen.update({ stadium: "arena", orderNumber, change: { to: "accepted", prepMinutes: 12 } })).resolves.toEqual({ ok: true });
    let stored = await readReceipt(orderNumber);
    expect(stored!.kitchenStatus).toBe("accepted");
    expect(stored!.acceptedAt).toBeGreaterThanOrEqual(before);
    expect(stored!.readyAt).toBeGreaterThanOrEqual(before + 12 * 60_000);
    expect(stored!.readyAt).toBeLessThan(Date.now() + 12 * 60_000 + 5_000);
    expect((await desk.kitchen.board({ stadium: "arena" }))[0]).toMatchObject({ orderNumber, status: "accepted" });

    await expect(desk.kitchen.update({ stadium: "arena", orderNumber, change: { to: "ready" } })).resolves.toEqual({ ok: true });
    stored = await readReceipt(orderNumber);
    expect(stored!.kitchenStatus).toBe("ready");
    expect(stored!.readyAt).toBeLessThanOrEqual(Date.now());
    expect((await desk.kitchen.board({ stadium: "arena" }))[0].status).toBe("ready");

    await expect(desk.kitchen.update({ stadium: "arena", orderNumber, change: { to: "done" } })).resolves.toEqual({ ok: true });
    expect((await readReceipt(orderNumber))!.kitchenStatus).toBe("done");
    await expect(desk.kitchen.board({ stadium: "arena" })).resolves.toEqual([]);
    await expect(withDb((db) => db.receipt.findFirstOrThrow({ where: { orderNumber } }))).resolves.toMatchObject({ kitchenStatus: "DONE" });
  });

  it("accepts a lower-case order number", async () => {
    const receipt = await paidReceipt();
    const desk = await signedInDesk();
    await expect(desk.kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber.toLowerCase(), change: { to: "ready" } })).resolves.toEqual({
      ok: true,
    });
  });

  it("declines with a reason the customer can read", async () => {
    const receipt = await paidReceipt();
    const desk = await signedInDesk();

    const result = await desk.kitchen.update({
      stadium: "arena",
      orderNumber: receipt.orderNumber,
      change: { to: "declined", reason: "  We are out of cola.  " },
    });
    expect(result).toEqual({ ok: true });

    const stored = await readReceipt(receipt.orderNumber);
    expect(stored).toMatchObject({ kitchenStatus: "declined", declineReason: "We are out of cola." });
    await expect(desk.kitchen.board({ stadium: "arena" })).resolves.toEqual([]);
  });

  it("returns soft failures for invalid or missing changes", async () => {
    const receipt = await paidReceipt();
    const desk = await signedInDesk();

    await expect(desk.kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber, change: { to: "declined", reason: "   " } })).resolves.toEqual({
      ok: false,
      error: "That change isn't allowed.",
    });
    await expect(
      desk.kitchen.update({ stadium: "arena", orderNumber: receipt.orderNumber, change: { to: "accepted", prepMinutes: 0 } }),
    ).resolves.toMatchObject({ ok: false });
    await expect(desk.kitchen.update({ stadium: "arena", orderNumber: makeOrderNumber(), change: { to: "ready" } })).resolves.toEqual({
      ok: false,
      error: "Order not found.",
    });
    expect((await readReceipt(receipt.orderNumber))!.kitchenStatus).toBe("new");
  });

  it("refunds the card when a paid order is declined", async () => {
    const product = await createProduct({ name: "Refundable Fries", priceCents: 800 });
    const orderNumber = makeOrderNumber();
    const prepared = await publicCaller().payments.prepare({
      stadiumSlug: "arena",
      orderNumber,
      deviceId: "device-test-001",
      token: makeReceiptToken(),
      confirmCode: makeConfirmCode(),
      fulfillment: "pickup",
      timing: "asap",
      scheduledAt: null,
      etaMin: 5,
      etaMax: 9,
      seat: null,
      lines: [{ productId: product.id, qty: 1 }],
    });
    if (!prepared.ok) throw new Error(prepared.message);
    await getStripe().paymentIntents.confirm(prepared.paymentIntentId);
    const finalized = await publicCaller().payments.finalize({ paymentIntentId: prepared.paymentIntentId, clientSecret: prepared.clientSecret });
    expect(finalized.ok).toBe(true);

    const desk = await signedInDesk();
    const result = await desk.kitchen.update({ stadium: "arena", orderNumber, change: { to: "declined", reason: "Kitchen is closing." } });
    expect(result).toEqual({ ok: true });

    const payment = await withDb((db) => db.payment.findUniqueOrThrow({ where: { paymentIntentId: prepared.paymentIntentId } }));
    expect(payment.state).toBe("REFUNDED");
    expect(payment.refundId).toMatch(/^re_/);
    expect((await readReceipt(orderNumber))!.kitchenStatus).toBe("declined");
  });
});
