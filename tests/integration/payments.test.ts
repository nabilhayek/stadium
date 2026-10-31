import "../support/server-mocks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { getStripe, resetStripeClient } from "@/lib/stripe";
import { makeConfirmCode, makeOrderNumber, makeReceiptToken } from "@/lib/orders/receipt";
import { createProduct } from "../support/factories";
import { publicCaller } from "../support/caller";
import { applyTestEnv } from "../support/env";
import { markIntent, resetFakeStripe, setStripeScenario, startFakeStripe } from "../support/fake-stripe/server";

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
});

async function prepareInput(opts?: { orderNumber?: string; productId?: string; qty?: number }) {
  const productId = opts?.productId ?? (await createProduct({ name: "Pay Test Burger", priceCents: 700 })).id;
  return {
    stadiumSlug: "arena",
    orderNumber: opts?.orderNumber ?? makeOrderNumber(),
    deviceId: "device-test-001",
    token: makeReceiptToken(),
    confirmCode: makeConfirmCode(),
    fulfillment: "delivery" as const,
    timing: "asap" as const,
    scheduledAt: null,
    etaMin: 10,
    etaMax: 14,
    seat: { sectionCode: "N", sectionName: "North Stand", row: "1", number: "10" },
    lines: [{ productId, qty: opts?.qty ?? 2 }],
  };
}

/** What Stripe.js does in the browser once the customer taps pay. */
function confirmLikeBrowser(paymentIntentId: string) {
  return getStripe().paymentIntents.confirm(paymentIntentId);
}

describe("payments.prepare + payments.finalize", () => {
  it("prepares a PaymentIntent priced from the database, then finalizes into a receipt", async () => {
    const input = await prepareInput({ qty: 2 });
    // The client may claim any price; only productId and qty are read.
    const prepared = await publicCaller().payments.prepare({ ...input, lines: [{ ...input.lines[0], ...({ unitCents: 1 } as object) }] });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.paymentIntentId).toMatch(/^pi_/);
    expect(prepared.clientSecret.startsWith(`${prepared.paymentIntentId}_secret_`)).toBe(true);
    expect(prepared.amountCents).toBe(1400);
    expect(prepared.status).toBe("ready");

    const payment = await withDb((db) => db.payment.findUniqueOrThrow({ where: { paymentIntentId: prepared.paymentIntentId } }));
    expect(payment).toMatchObject({ state: "REQUIRES_PAYMENT", amountCents: 1400, currency: "EUR", orderNumber: input.orderNumber, applied: false });
    // No kitchen ticket until the money is confirmed.
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(0);

    await confirmLikeBrowser(prepared.paymentIntentId);
    const finalized = await publicCaller().payments.finalize({ paymentIntentId: prepared.paymentIntentId, clientSecret: prepared.clientSecret });

    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.receipt).toMatchObject({
      orderNumber: input.orderNumber,
      stadiumSlug: "arena",
      totalCents: 1400,
      currency: "EUR",
      fulfillment: "delivery",
      confirmCode: input.confirmCode,
    });
    expect(finalized.receipt.lines).toEqual([expect.objectContaining({ name: "Pay Test Burger", qty: 2, unitCents: 700 })]);

    const after = await withDb((db) => db.payment.findUniqueOrThrow({ where: { paymentIntentId: prepared.paymentIntentId } }));
    expect(after).toMatchObject({ state: "SUCCEEDED", applied: true });

    // The public copy of the order is now readable by number.
    const got = await publicCaller().orders.get({ stadium: "arena", orderNumber: input.orderNumber });
    expect(got).toMatchObject({ orderNumber: input.orderNumber, totalCents: 1400 });
    expect(got).not.toHaveProperty("token");
  });

  it("finalize is idempotent: a retry returns the same receipt and writes one row", async () => {
    const input = await prepareInput();
    const prepared = await publicCaller().payments.prepare(input);
    if (!prepared.ok) throw new Error("prepare failed");
    await confirmLikeBrowser(prepared.paymentIntentId);

    const args = { paymentIntentId: prepared.paymentIntentId, clientSecret: prepared.clientSecret };
    const first = await publicCaller().payments.finalize(args);
    const second = await publicCaller().payments.finalize(args);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.receipt.orderNumber).toBe(first.receipt.orderNumber);
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(1);
  });

  it("decline: finalize returns { ok:false, status:402 } and writes no receipt", async () => {
    setStripeScenario("decline");
    const input = await prepareInput();
    const prepared = await publicCaller().payments.prepare(input);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.status).toBe("ready");

    await confirmLikeBrowser(prepared.paymentIntentId);
    const finalized = await publicCaller().payments.finalize({ paymentIntentId: prepared.paymentIntentId, clientSecret: prepared.clientSecret });

    expect(finalized.ok).toBe(false);
    if (finalized.ok) return;
    expect(finalized.status).toBe(402);
    expect(finalized.message.length).toBeGreaterThan(0);

    const payment = await withDb((db) => db.payment.findUniqueOrThrow({ where: { paymentIntentId: prepared.paymentIntentId } }));
    expect(payment).toMatchObject({ state: "FAILED", declineCode: "generic_decline", applied: false });
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(0);
  });

  it("processing: finalize asks the caller to retry with 202", async () => {
    const input = await prepareInput();
    const prepared = await publicCaller().payments.prepare(input);
    if (!prepared.ok) throw new Error("prepare failed");
    markIntent(prepared.paymentIntentId, "processing");

    const finalized = await publicCaller().payments.finalize({ paymentIntentId: prepared.paymentIntentId, clientSecret: prepared.clientSecret });
    expect(finalized).toMatchObject({ ok: false, status: 202, processing: true });
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(0);
  });

  it("finalize refuses a mismatched client secret and unknown intents", async () => {
    const input = await prepareInput();
    const prepared = await publicCaller().payments.prepare(input);
    if (!prepared.ok) throw new Error("prepare failed");
    await confirmLikeBrowser(prepared.paymentIntentId);

    const wrongSecret = await publicCaller().payments.finalize({
      paymentIntentId: prepared.paymentIntentId,
      clientSecret: `${prepared.paymentIntentId}_secret_wrong`,
    });
    expect(wrongSecret).toMatchObject({ ok: false, status: 403 });

    const malformed = await publicCaller().payments.finalize({ paymentIntentId: "not-an-intent", clientSecret: "x" });
    expect(malformed).toMatchObject({ ok: false, status: 400 });
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(0);
  });
});

describe("payments.prepare", () => {
  it("is idempotent: preparing the same order twice reuses one PaymentIntent and payment row", async () => {
    const input = await prepareInput();
    const a = await publicCaller().payments.prepare(input);
    const b = await publicCaller().payments.prepare(input);

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.paymentIntentId).toBe(a.paymentIntentId);
    expect(b.clientSecret).toBe(a.clientSecret);
    await expect(withDb((db) => db.payment.count({ where: { orderNumber: input.orderNumber } }))).resolves.toBe(1);
  });

  it("re-prices the same order when the basket changes", async () => {
    const input = await prepareInput({ qty: 1 });
    const a = await publicCaller().payments.prepare(input);
    const b = await publicCaller().payments.prepare({ ...input, lines: [{ ...input.lines[0], qty: 3 }] });

    if (!a.ok || !b.ok) throw new Error("prepare failed");
    expect(a.amountCents).toBe(700);
    expect(b.amountCents).toBe(2100);
    expect(b.paymentIntentId).toBe(a.paymentIntentId);
  });

  it("reports already-paid checkouts as succeeded", async () => {
    const input = await prepareInput();
    const prepared = await publicCaller().payments.prepare(input);
    if (!prepared.ok) throw new Error("prepare failed");
    await confirmLikeBrowser(prepared.paymentIntentId);
    await publicCaller().payments.finalize({ paymentIntentId: prepared.paymentIntentId, clientSecret: prepared.clientSecret });

    const again = await publicCaller().payments.prepare(input);
    expect(again).toMatchObject({ ok: true, status: "succeeded", paymentIntentId: prepared.paymentIntentId });
  });

  it("returns soft failures instead of throwing for bad baskets", async () => {
    const base = await prepareInput();
    const soldOut = await createProduct({ name: "Sold Out Thing", soldOut: true });
    const cheap = await createProduct({ name: "Pennies", priceCents: 10 });

    expect(await publicCaller().payments.prepare({ ...base, lines: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await publicCaller().payments.prepare({ ...base, lines: [{ productId: "does-not-exist", qty: 1 }] })).toMatchObject({ ok: false, status: 400 });
    expect(await publicCaller().payments.prepare({ ...base, lines: [{ productId: soldOut.id, qty: 1 }] })).toMatchObject({ ok: false, status: 400 });
    expect(await publicCaller().payments.prepare({ ...base, lines: [{ productId: cheap.id, qty: 1 }] })).toMatchObject({
      ok: false,
      status: 400,
      message: expect.stringContaining("more"),
    });
    expect(await publicCaller().payments.prepare({ ...base, stadiumSlug: "nowhere" })).toMatchObject({ ok: false, status: 400 });
    expect(await publicCaller().payments.prepare({ ...base, orderNumber: "bogus" })).toMatchObject({ ok: false, status: 400 });
    expect(await publicCaller().payments.prepare({ ...base, seat: null })).toMatchObject({ ok: false, status: 400 });
    await expect(withDb((db) => db.payment.count())).resolves.toBe(0);
  });
});
