import "../support/server-mocks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { withDb } from "@/lib/db";
import { resetStripeClient } from "@/lib/stripe";
import { makeConfirmCode, makeOrderNumber, makeReceiptToken } from "@/lib/orders/receipt";
import { createProduct } from "../support/factories";
import { publicCaller } from "../support/caller";
import { applyTestEnv } from "../support/env";
import { resetFakeStripe, signWebhook, startFakeStripe } from "../support/fake-stripe/server";

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

/** A prepared (unpaid) checkout: the Payment row and draft exist, the receipt does not. */
async function preparedCheckout() {
  const product = await createProduct({ name: "Webhook Dog", priceCents: 600 });
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
    etaMin: 8,
    etaMax: 12,
    seat: null,
    lines: [{ productId: product.id, qty: 1 }],
  });
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.message}`);
  return { orderNumber, paymentIntentId: prepared.paymentIntentId };
}

function event(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
  });
}

function post(body: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers, body }));
}

function postSigned(type: string, object: Record<string, unknown>) {
  const { payload, header } = signWebhook(event(type, object));
  return post(payload, header);
}

const paymentRow = (paymentIntentId: string) => withDb((db) => db.payment.findUniqueOrThrow({ where: { paymentIntentId } }));

describe("POST /api/stripe/webhook", () => {
  it("rejects a request with no signature header", async () => {
    const res = await post(event("payment_intent.succeeded", { id: "pi_x", object: "payment_intent" }), null);
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toBe("missing signature");
  });

  it("rejects a bad signature with 400 and changes nothing", async () => {
    const { orderNumber, paymentIntentId } = await preparedCheckout();
    const payload = event("payment_intent.succeeded", { id: paymentIntentId, object: "payment_intent" });

    const forged = signWebhook(payload, "whsec_someone_elses_secret");
    const res = await post(payload, forged.header);
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toBe("invalid signature");

    expect((await paymentRow(paymentIntentId)).applied).toBe(false);
    await expect(withDb((db) => db.receipt.count({ where: { orderNumber } }))).resolves.toBe(0);
  });

  it("rejects a payload that was altered after signing", async () => {
    const signed = signWebhook(event("payment_intent.succeeded", { id: "pi_a", object: "payment_intent" }));
    const res = await post(signed.payload.replace("pi_a", "pi_b"), signed.header);
    expect(res.status).toBe(400);
  });

  it("payment_intent.succeeded writes the kitchen ticket even though the phone never called back", async () => {
    const { orderNumber, paymentIntentId } = await preparedCheckout();

    const res = await postSigned("payment_intent.succeeded", { id: paymentIntentId, object: "payment_intent", status: "succeeded" });
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("ok");

    expect(await paymentRow(paymentIntentId)).toMatchObject({ state: "SUCCEEDED", applied: true });
    const receipt = await publicCaller().orders.get({ stadium: "arena", orderNumber });
    expect(receipt).toMatchObject({ orderNumber, fulfillment: "pickup", totalCents: 600 });
    expect(receipt!.lines).toEqual([expect.objectContaining({ name: "Webhook Dog", qty: 1 })]);
  });

  it("is idempotent: Stripe redelivering the event does not duplicate the order", async () => {
    const { orderNumber, paymentIntentId } = await preparedCheckout();
    const object = { id: paymentIntentId, object: "payment_intent", status: "succeeded" };

    expect((await postSigned("payment_intent.succeeded", object)).status).toBe(200);
    expect((await postSigned("payment_intent.succeeded", object)).status).toBe(200);

    await expect(withDb((db) => db.receipt.count({ where: { orderNumber } }))).resolves.toBe(1);
  });

  it("acknowledges a succeeded event for an intent we never created", async () => {
    const res = await postSigned("payment_intent.succeeded", { id: "pi_unknown", object: "payment_intent", status: "succeeded" });
    expect(res.status).toBe(200);
    await expect(withDb((db) => db.receipt.count())).resolves.toBe(0);
  });

  it("payment_intent.payment_failed records the decline code", async () => {
    const { paymentIntentId } = await preparedCheckout();
    const res = await postSigned("payment_intent.payment_failed", {
      id: paymentIntentId,
      object: "payment_intent",
      status: "requires_payment_method",
      last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "no" },
    });
    expect(res.status).toBe(200);
    expect(await paymentRow(paymentIntentId)).toMatchObject({ state: "FAILED", declineCode: "insufficient_funds", applied: false });
  });

  it("payment_intent.processing and canceled move the payment state", async () => {
    const { paymentIntentId } = await preparedCheckout();

    await postSigned("payment_intent.processing", { id: paymentIntentId, object: "payment_intent", status: "processing" });
    expect((await paymentRow(paymentIntentId)).state).toBe("PROCESSING");

    await postSigned("payment_intent.canceled", { id: paymentIntentId, object: "payment_intent", status: "canceled" });
    expect(await paymentRow(paymentIntentId)).toMatchObject({ state: "CANCELED", declineCode: "canceled" });
  });

  it("charge.refunded marks the payment refunded after it succeeded", async () => {
    const { paymentIntentId } = await preparedCheckout();
    await postSigned("payment_intent.succeeded", { id: paymentIntentId, object: "payment_intent", status: "succeeded" });

    const res = await postSigned("charge.refunded", { id: "ch_1", object: "charge", payment_intent: paymentIntentId });
    expect(res.status).toBe(200);
    expect((await paymentRow(paymentIntentId)).state).toBe("REFUNDED");
  });

  it("ignores event types it does not handle", async () => {
    const res = await postSigned("customer.created", { id: "cus_1", object: "customer" });
    expect(res.status).toBe(200);
  });
});
