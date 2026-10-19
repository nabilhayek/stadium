import { Prisma, type PaymentState } from "@/generated/prisma/client";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";
import Stripe from "stripe";
import { withDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type { Fulfillment, Receipt, Timing } from "@/lib/orders/receipt";
import { isOrderNumber } from "@/lib/orders/receipt";
import { getOwnedReceipt, putReceipt } from "@/lib/orders/server";
import { mergeSecondRound, secondRoundLeft } from "@/lib/orders/second-round";
import { checkoutDraft, parseDraft, receiptFromDraft, type CheckoutDraft } from "./draft";
import { paymentFailureMessage } from "./messages";
import { isQuoteError, quoteOrder, type QuoteRequestLine } from "./quote";

const DEVICE_ID = /^[a-z0-9-]{8,64}$/i;

export type PrepareInput = {
  stadiumSlug: string;
  orderNumber: string;
  deviceId: string;
  token: string;
  confirmCode: string;
  fulfillment: Fulfillment;
  timing: Timing;
  scheduledAt: number | null;
  etaMin: number;
  etaMax: number;
  seat: Receipt["seat"];
  lines: QuoteRequestLine[];
};

export type PrepareResult =
  | { ok: true; paymentIntentId: string; clientSecret: string; amountCents: number; status: "ready" | "processing" | "succeeded" }
  | { ok: false; status: number; message: string };

function quoteMessage(error: string): string {
  if (error === "unavailable" || error === "sold-out") {
    return "Something in your cart just sold out. Go back to the menu and check it.";
  }
  if (error === "options") return "The choices on an item changed. Remove it from your cart and add it again.";
  if (error === "too-small") return "Add a bit more to the order before paying by card.";
  if (error === "no-stadium") return "This stadium isn’t taking orders right now.";
  return "We couldn’t read this order. Go back to the menu and try again.";
}

function stateFor(status: Stripe.PaymentIntent.Status, failed: boolean): PaymentState {
  switch (status) {
    case "succeeded":
      return "SUCCEEDED";
    case "processing":
      return "PROCESSING";
    case "canceled":
      return "CANCELED";
    case "requires_payment_method":
      return failed ? "FAILED" : "REQUIRES_PAYMENT";
    default:
      return "REQUIRES_PAYMENT";
  }
}

function declineCode(pi: Stripe.PaymentIntent): string | null {
  return pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? null;
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function validPrepare(input: PrepareInput): string | null {
  if (!isOrderNumber(input.orderNumber)) return "We couldn’t read this order. Go back to the menu and try again.";
  if (!DEVICE_ID.test(input.deviceId) || input.token.length < 16 || input.token.length > 64) {
    return "We couldn’t read this order. Go back to the menu and try again.";
  }
  if (input.confirmCode.length < 4 || input.confirmCode.length > 8) {
    return "We couldn’t read this order. Go back to the menu and try again.";
  }
  if (input.fulfillment !== "delivery" && input.fulfillment !== "pickup") return "Choose delivery or pickup.";
  if (input.timing !== "asap" && input.timing !== "scheduled") return "Choose when you want it.";
  if (input.fulfillment === "delivery" && !input.seat) return "Confirm your seat so the runner can find you.";
  if (!Number.isFinite(input.etaMin) || !Number.isFinite(input.etaMax) || input.etaMax < 1 || input.etaMax > 180) {
    return "We couldn’t read this order. Go back to the menu and try again.";
  }
  return null;
}

/** Open or reuse the PaymentIntent for this checkout. Safe to call again on a bad connection. */
export async function prepareCheckout(input: PrepareInput): Promise<PrepareResult> {
  const invalid = validPrepare(input);
  if (invalid) return { ok: false, status: 400, message: invalid };

  const priced = await quoteOrder(input.stadiumSlug, input.lines);
  if (isQuoteError(priced)) return { ok: false, status: 400, message: quoteMessage(priced.error) };

  const draft = checkoutDraft({ ...input, priced });
  const key = `checkout:${priced.stadiumId}:${input.orderNumber}`;
  const stripe = getStripe();

  const existing = await withDb((db) => db.payment.findUnique({ where: { idempotencyKey: key } }));
  if (existing?.state === "SUCCEEDED" || existing?.state === "PROCESSING") {
    const pi = await stripe.paymentIntents.retrieve(existing.paymentIntentId);
    if (!pi.client_secret) return { ok: false, status: 409, message: "This checkout was already paid. Start again from the menu." };
    if (existing.amountCents !== priced.totalCents && existing.state === "SUCCEEDED") {
      return { ok: false, status: 409, message: "This checkout was already paid. Start again from the menu." };
    }
    return {
      ok: true,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      amountCents: existing.amountCents,
      status: existing.state === "PROCESSING" ? "processing" : "succeeded",
    };
  }

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { deviceId: input.deviceId, stadiumSlug: input.stadiumSlug },
    });
    customerId = customer.id;
  }

  let paymentIntentId = existing?.paymentIntentId;
  if (!paymentIntentId) {
    const created = await stripe.paymentIntents.create(
      {
        amount: priced.totalCents,
        currency: priced.currency.toLowerCase(),
        customer: customerId,
        allowed_payment_method_types: ["card"],
        setup_future_usage: "off_session",
        metadata: { orderNumber: input.orderNumber, stadiumSlug: input.stadiumSlug, kind: "checkout" },
      },
      { idempotencyKey: key },
    );
    paymentIntentId = created.id;
  } else {
    await stripe.paymentIntents.update(paymentIntentId, {
      amount: priced.totalCents,
      currency: priced.currency.toLowerCase(),
      customer: customerId,
      metadata: { orderNumber: input.orderNumber, stadiumSlug: input.stadiumSlug, kind: "checkout" },
    });
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (!pi.client_secret) return { ok: false, status: 502, message: "The bank connection failed. Try again." };

  const data = {
    stadiumId: priced.stadiumId,
    paymentIntentId: pi.id,
    orderNumber: input.orderNumber,
    amountCents: priced.totalCents,
    currency: priced.currency,
    state: stateFor(pi.status, false),
    stripeStatus: pi.status,
    declineCode: null,
    stripeCustomerId: customerId,
    draft: draft as unknown as PrismaTypes.InputJsonValue,
  };

  await withDb((db) =>
    db.payment.upsert({
      where: { idempotencyKey: key },
      create: { ...data, idempotencyKey: key },
      update: data,
    }),
  );

  const saved = await withDb((db) => db.payment.findUnique({ where: { idempotencyKey: key } }));
  const intentId = saved?.paymentIntentId ?? pi.id;
  if (intentId !== pi.id) await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
  const current = intentId === pi.id ? pi : await stripe.paymentIntents.retrieve(intentId);
  if (!current.client_secret) return { ok: false, status: 502, message: "The bank connection failed. Try again." };

  const status = current.status === "succeeded" ? "succeeded" : current.status === "processing" ? "processing" : "ready";
  return {
    ok: true,
    paymentIntentId: current.id,
    clientSecret: current.client_secret,
    amountCents: saved?.amountCents ?? priced.totalCents,
    status,
  };
}

export type FinalizeResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; status: number; message: string; processing?: boolean };

/** Confirm Stripe still agrees, then write the kitchen ticket. Idempotent. */
export async function finalizeCheckout(paymentIntentId: string, clientSecret: string): Promise<FinalizeResult> {
  if (!paymentIntentId.startsWith("pi_") || !clientSecret.startsWith(`${paymentIntentId}_secret_`)) {
    return { ok: false, status: 400, message: "We couldn’t match this payment. Try again." };
  }

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.client_secret !== clientSecret) return { ok: false, status: 403, message: "We couldn’t match this payment. Try again." };

  const payment = await withDb((db) => db.payment.findUnique({ where: { paymentIntentId } }));
  if (!payment) return { ok: false, status: 404, message: "We couldn’t find this payment. Start checkout again." };

  const failed = Boolean(pi.last_payment_error);
  await withDb((db) =>
    db.payment.update({
      where: { id: payment.id },
      data: {
        state: stateFor(pi.status, failed),
        stripeStatus: pi.status,
        declineCode: failed ? declineCode(pi) : null,
      },
    }),
  );

  if (pi.status === "processing") {
    return { ok: false, status: 202, processing: true, message: "The bank is still confirming. Hold on — you won’t be charged twice." };
  }
  if (pi.status !== "succeeded") {
    return {
      ok: false,
      status: 402,
      message: paymentFailureMessage(pi.last_payment_error?.code, pi.last_payment_error?.decline_code),
    };
  }
  if (pi.amount !== payment.amountCents || pi.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    return { ok: false, status: 409, message: "The total changed. Go back to the menu and try again." };
  }

  const draft = parseDraft(payment.draft);
  if (!draft || draft.kind !== "checkout") {
    return { ok: false, status: 409, message: "We couldn’t read this order. Start checkout again." };
  }

  const receipt = await writeCheckoutReceipt(payment.id, draft);
  if (!receipt) return { ok: false, status: 503, message: "Payment went through, but the kitchen ticket didn’t save. Leave this page open and try again." };
  return { ok: true, receipt };
}

async function writeCheckoutReceipt(paymentId: string, draft: CheckoutDraft): Promise<Receipt | null> {
  const existing = await getOwnedReceipt(draft.stadiumSlug, draft.orderNumber);
  if (existing) {
    await withDb((db) =>
      db.payment.update({
        where: { id: paymentId },
        data: { applied: true, state: "SUCCEEDED", stripeStatus: "succeeded", declineCode: null },
      }),
    );
    return existing;
  }

  const receipt = receiptFromDraft(draft, Date.now());
  if (!receipt) return null;
  try {
    const result = await putReceipt(receipt, { authoritative: true });
    if (result !== "created" && result !== "updated") return null;
  } catch (error) {
    if (!isUnique(error)) throw error;
    return getOwnedReceipt(draft.stadiumSlug, draft.orderNumber);
  }

  await withDb((db) =>
    db.payment.update({
      where: { id: paymentId },
      data: { applied: true, state: "SUCCEEDED", stripeStatus: "succeeded", declineCode: null },
    }),
  );
  return receipt;
}

/** Webhook path: the phone may already be gone, so there is no client secret to check. */
export async function finalizeFromStripe(paymentIntentId: string): Promise<void> {
  const payment = await withDb((db) => db.payment.findUnique({ where: { paymentIntentId } }));
  if (!payment || payment.applied || payment.state === "REFUNDED") return;
  const draft = parseDraft(payment.draft);
  if (!draft) return;
  await withDb((db) =>
    db.payment.update({
      where: { id: payment.id },
      data: { state: "SUCCEEDED", stripeStatus: "succeeded", declineCode: null },
    }),
  );
  if (draft.kind === "checkout") {
    await writeCheckoutReceipt(payment.id, draft);
    return;
  }
  await applyExtra(payment.id, draft.stadiumSlug, draft.orderNumber, draft.lines);
}

export async function markPaymentFailed(paymentIntentId: string, code: string | null, stripeStatus: string) {
  await withDb((db) =>
    db.payment.updateMany({
      where: { paymentIntentId, state: { notIn: ["SUCCEEDED", "REFUNDED"] } },
      data: { state: stripeStatus === "canceled" ? "CANCELED" : "FAILED", stripeStatus, declineCode: code },
    }),
  );
}

export async function markPaymentProcessing(paymentIntentId: string) {
  await withDb((db) =>
    db.payment.updateMany({
      where: { paymentIntentId, state: { notIn: ["SUCCEEDED", "REFUNDED"] } },
      data: { state: "PROCESSING", stripeStatus: "processing" },
    }),
  );
}

export async function markRefunded(paymentIntentId: string, refundId: string | null) {
  await withDb((db) =>
    db.payment.updateMany({
      where: { paymentIntentId },
      data: { state: "REFUNDED", ...(refundId ? { refundId } : {}) },
    }),
  );
}

/** Send every successful charge for this order back to the card. */
export async function refundOrder(stadiumSlug: string, orderNumber: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const payments = await withDb(async (db) => {
    const stadium = await db.stadium.findUnique({ where: { slug: stadiumSlug }, select: { id: true } });
    if (!stadium) return [];
    return db.payment.findMany({
      where: { stadiumId: stadium.id, orderNumber, state: "SUCCEEDED" },
      select: { id: true, paymentIntentId: true },
    });
  });
  if (payments.length === 0) return { ok: true };

  const stripe = getStripe();
  for (const payment of payments) {
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: payment.paymentIntentId },
        { idempotencyKey: `refund:${payment.paymentIntentId}` },
      );
      await markRefunded(payment.paymentIntentId, refund.id);
    } catch (error) {
      const code = error instanceof Stripe.errors.StripeError ? error.code : undefined;
      if (code === "charge_already_refunded") {
        await markRefunded(payment.paymentIntentId, null);
        continue;
      }
      console.error("refund failed", payment.paymentIntentId, code);
      return { ok: false, message: "The order was not declined — the refund didn’t go through. Try again." };
    }
  }
  return { ok: true };
}

export type ExtraInput = {
  stadiumSlug: string;
  orderNumber: string;
  token: string;
  idempotencyKey: string;
  lines: QuoteRequestLine[];
};

export async function chargeExtra(input: ExtraInput): Promise<FinalizeResult> {
  if (!isOrderNumber(input.orderNumber) || input.token.length < 16) {
    return { ok: false, status: 400, message: "We couldn’t read this order." };
  }
  if (!/^[a-z0-9-]{8,80}$/i.test(input.idempotencyKey)) {
    return { ok: false, status: 400, message: "We couldn’t read this order." };
  }

  const receipt = await getOwnedReceipt(input.stadiumSlug, input.orderNumber);
  if (!receipt || receipt.token !== input.token) return { ok: false, status: 403, message: "This order can’t take another charge." };
  if (secondRoundLeft(receipt, Date.now()) === 0) {
    return { ok: false, status: 409, message: "The kitchen has closed this round." };
  }

  const priced = await quoteOrder(input.stadiumSlug, input.lines);
  if (isQuoteError(priced)) return { ok: false, status: 400, message: quoteMessage(priced.error) };

  const original = await withDb((db) =>
    db.payment.findFirst({
      where: { stadiumId: priced.stadiumId, orderNumber: input.orderNumber, state: "SUCCEEDED", stripeCustomerId: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
  );
  if (!original?.stripeCustomerId) {
    return { ok: false, status: 409, message: "We couldn’t charge the card from this order. Start a new one from the shop." };
  }

  const stripe = getStripe();
  const originalIntent = await stripe.paymentIntents.retrieve(original.paymentIntentId);
  const paymentMethod = typeof originalIntent.payment_method === "string" ? originalIntent.payment_method : originalIntent.payment_method?.id;
  if (!paymentMethod) {
    return { ok: false, status: 409, message: "We couldn’t charge the card from this order. Start a new one from the shop." };
  }

  const key = `extra:${priced.stadiumId}:${input.orderNumber}:${input.idempotencyKey}`;
  let payment = await withDb((db) => db.payment.findUnique({ where: { idempotencyKey: key } }));

  if (!payment) {
    const draft = { kind: "extra" as const, orderNumber: input.orderNumber, stadiumSlug: input.stadiumSlug, lines: priced.lines };
    const created = await stripe.paymentIntents.create(
      {
        amount: priced.totalCents,
        currency: priced.currency.toLowerCase(),
        customer: original.stripeCustomerId,
        payment_method: paymentMethod,
        allowed_payment_method_types: ["card"],
        metadata: { orderNumber: input.orderNumber, stadiumSlug: input.stadiumSlug, kind: "extra" },
      },
      { idempotencyKey: key },
    );
    try {
      payment = await withDb((db) =>
        db.payment.create({
          data: {
            idempotencyKey: key,
            stadiumId: priced.stadiumId,
            paymentIntentId: created.id,
            orderNumber: input.orderNumber,
            amountCents: priced.totalCents,
            currency: priced.currency,
            state: "REQUIRES_PAYMENT",
            stripeStatus: created.status,
            stripeCustomerId: original.stripeCustomerId,
            draft: draft as unknown as PrismaTypes.InputJsonValue,
          },
        }),
      );
    } catch (error) {
      if (!isUnique(error)) throw error;
      payment = await withDb((db) => db.payment.findUnique({ where: { idempotencyKey: key } }));
      if (payment && payment.paymentIntentId !== created.id) {
        await stripe.paymentIntents.cancel(created.id).catch(() => undefined);
      }
    }
  }

  if (!payment) return { ok: false, status: 503, message: "The connection dropped. Try adding the drink again." };
  let row = payment;

  if (row.state !== "SUCCEEDED" && row.state !== "FAILED" && row.state !== "CANCELED" && row.state !== "REFUNDED") {
    let pi = await stripe.paymentIntents.retrieve(row.paymentIntentId);
    try {
      if (pi.status !== "succeeded" && pi.status !== "processing" && pi.status !== "canceled") {
        pi = await stripe.paymentIntents.confirm(row.paymentIntentId, { off_session: true });
      }
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError) {
        const intent = error.payment_intent;
        const intentId = typeof intent === "string" ? intent : intent?.id;
        if (intent && typeof intent !== "string" && intent.status === "requires_action" && intentId) {
          await stripe.paymentIntents.cancel(intentId).catch(() => undefined);
        }
        await withDb((db) =>
          db.payment.update({
            where: { id: row.id },
            data: { state: "FAILED", stripeStatus: "requires_payment_method", declineCode: error.decline_code ?? error.code ?? null },
          }),
        );
        return { ok: false, status: 402, message: paymentFailureMessage(error.code, error.decline_code) };
      }
      throw error;
    }

    if (pi.status === "requires_action") {
      await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
      await withDb((db) =>
        db.payment.update({
          where: { id: row.id },
          data: { state: "CANCELED", stripeStatus: "canceled", declineCode: "authentication_required" },
        }),
      );
      return { ok: false, status: 402, message: paymentFailureMessage("authentication_required", null) };
    }

    await withDb((db) =>
      db.payment.update({
        where: { id: row.id },
        data: {
          state: stateFor(pi.status, Boolean(pi.last_payment_error)),
          stripeStatus: pi.status,
          declineCode: declineCode(pi),
        },
      }),
    );
    row = { ...row, state: stateFor(pi.status, Boolean(pi.last_payment_error)), stripeStatus: pi.status };
  }

  payment = row;

  if (!payment) return { ok: false, status: 503, message: "The connection dropped. Try adding the drink again." };
  if (payment.state === "FAILED" || payment.state === "CANCELED") {
    return { ok: false, status: 402, message: paymentFailureMessage(payment.declineCode, null) };
  }
  if (payment.state === "PROCESSING") {
    return { ok: false, status: 202, processing: true, message: "The bank is still confirming this drink. You won’t be charged twice." };
  }

  const next = await applyExtra(payment.id, input.stadiumSlug, input.orderNumber, priced.lines);
  if (!next) return { ok: false, status: 503, message: "The charge went through, but the drink didn’t save. Try again — you won’t be charged twice." };
  return { ok: true, receipt: next };
}

async function applyExtra(
  paymentId: string,
  stadiumSlug: string,
  orderNumber: string,
  lines: Receipt["lines"],
): Promise<Receipt | null> {
  const claimed = await withDb((db) =>
    db.payment.updateMany({
      where: { id: paymentId, applied: false, state: "SUCCEEDED" },
      data: { applied: true, state: "SUCCEEDED", stripeStatus: "succeeded" },
    }),
  );

  const current = await getOwnedReceipt(stadiumSlug, orderNumber);
  if (!current) return null;
  if (claimed.count === 0) return current;

  const merged = mergeSecondRound(
    current,
    lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      unitCents: line.unitCents ?? 0,
      qty: line.qty,
    })),
  );
  const result = await putReceipt(merged, { authoritative: true });
  if (result !== "created" && result !== "updated") return current;
  return merged;
}
