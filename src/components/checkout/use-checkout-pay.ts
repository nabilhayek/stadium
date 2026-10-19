"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { PaymentRequest, PaymentRequestPaymentMethodEvent, StripeError } from "@stripe/stripe-js";
import { getDeviceId } from "@/lib/device";
import { paymentFailureMessage } from "@/lib/payments/messages";
import { makeConfirmCode, makeOrderNumber, makeReceiptToken, type Fulfillment, type Receipt, type Timing } from "@/lib/orders/receipt";
import type { Seat } from "@/lib/seat/store";
import { useTRPCClient } from "@/lib/trpc/react";

export type PayMethod = "apple" | "google" | "card";

export type PayResult = { ok: true; receipt: Receipt } | { ok: false; message: string; openCard?: boolean };

type Line = { productId: string; qty: number; note?: string; options?: string[] };

export type PayDetails = {
  method: PayMethod;
  seat: Seat | null;
  fulfillment: Fulfillment;
  timing: Timing;
  scheduledAt: number | null;
  etaMin: number;
  etaMax: number;
  lines: Line[];
};

type Session = {
  orderNumber: string;
  token: string;
  confirmCode: string;
  paymentIntentId?: string;
  clientSecret?: string;
  amountCents?: number;
  fingerprint?: string;
  awaiting?: boolean;
};

type Props = {
  stadiumSlug: string;
  currency: string;
  amountCents: number;
  /** Basket to price before they tap pay, so the slow step is already done. */
  warm: Omit<PayDetails, "method"> | null;
  onRecovered: (result: PayResult) => void;
};

function storageKey(stadiumSlug: string) {
  return `pay-intent:v1:${stadiumSlug}`;
}

function readSession(stadiumSlug: string): Session {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey(stadiumSlug)) ?? "") as Session;
    if (parsed?.orderNumber && parsed.token && parsed.confirmCode) return parsed;
  } catch {
    /* fresh checkout */
  }
  return { orderNumber: makeOrderNumber(), token: makeReceiptToken(), confirmCode: makeConfirmCode() };
}

function writeSession(stadiumSlug: string, session: Session) {
  sessionStorage.setItem(storageKey(stadiumSlug), JSON.stringify(session));
}

function fingerprint(details: Omit<PayDetails, "method">) {
  return JSON.stringify(details);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(error: StripeError): string {
  if (error.type === "validation_error") return "Check the card number, expiry and CVC.";
  const decline = "decline_code" in error ? String(error.decline_code ?? "") : "";
  return paymentFailureMessage(error.code, decline);
}

export function useCheckoutPay({ stadiumSlug, currency, amountCents, warm, onRecovered }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const trpc = useTRPCClient();
  const [wallets, setWallets] = useState({ apple: false, google: false, checked: false });
  const [cardComplete, setCardComplete] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const requestRef = useRef<PaymentRequest | null>(null);
  const cardCompleteRef = useRef(false);
  const recovered = useRef(false);
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;
  cardCompleteRef.current = cardComplete;

  const remember = useCallback(
    (patch: Partial<Session>) => {
      const next = { ...(sessionRef.current ?? readSession(stadiumSlug)), ...patch };
      sessionRef.current = next;
      writeSession(stadiumSlug, next);
      return next;
    },
    [stadiumSlug],
  );

  const finalize = useCallback(
    async (session: Session): Promise<PayResult> => {
      if (!session.paymentIntentId || !session.clientSecret) {
        return { ok: false, message: "Payment is still loading. Try again in a moment." };
      }
      let message = "The bank is still confirming. Hold on — you won’t be charged twice.";
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const result = await trpc.payments.finalize.mutate({
            paymentIntentId: session.paymentIntentId,
            clientSecret: session.clientSecret,
          });
          if (result.ok) {
            sessionStorage.removeItem(storageKey(stadiumSlug));
            sessionRef.current = null;
            return { ok: true, receipt: result.receipt };
          }
          if (result.status === 202 || result.status >= 500) {
            message = result.message || message;
            await sleep(600 * (attempt + 1));
            continue;
          }
          remember({ awaiting: false });
          return { ok: false, message: result.message || paymentFailureMessage() };
        } catch {
          await sleep(600 * (attempt + 1));
        }
      }
      return { ok: false, message };
    },
    [remember, stadiumSlug, trpc],
  );

  const recover = useCallback(
    (result: PayResult) => {
      if (recovered.current) return;
      recovered.current = true;
      onRecoveredRef.current(result);
    },
    [],
  );

  useEffect(() => {
    const session = readSession(stadiumSlug);
    sessionRef.current = session;
    if (!session.awaiting || !session.paymentIntentId || !session.clientSecret) return;
    let cancelled = false;
    void finalize(session).then((result) => {
      if (!cancelled && (result.ok || session.awaiting)) recover(result);
    });
    return () => {
      cancelled = true;
    };
  }, [finalize, recover, stadiumSlug]);

  useEffect(() => {
    if (!stripe || amountCents < 50) {
      if (amountCents < 50) setWallets({ apple: false, google: false, checked: true });
      return;
    }
    const request = stripe.paymentRequest({
      country: "NL",
      currency: currency.toLowerCase(),
      total: { label: "Seat Service", amount: amountCents },
      requestPayerName: false,
      requestPayerEmail: false,
    });
    let cancelled = false;
    void request.canMakePayment().then((result) => {
      if (cancelled) return;
      setWallets({ apple: Boolean(result?.applePay), google: Boolean(result?.googlePay), checked: true });
    });
    requestRef.current = request;
    return () => {
      cancelled = true;
    };
  }, [amountCents, currency, stripe]);

  const prepare = useCallback(
    async (details: Omit<PayDetails, "method">) => {
      const deviceId = getDeviceId();
      if (!deviceId) return { ok: false as const, message: "This phone is blocking storage, so we can’t take payment." };
      const identity = sessionRef.current ?? readSession(stadiumSlug);
      sessionRef.current = identity;
      const mark = fingerprint(details);
      if (
        identity.clientSecret &&
        identity.paymentIntentId &&
        identity.fingerprint === mark &&
        identity.amountCents
      ) {
        return { ok: true as const, session: identity, settled: false };
      }
      const data = await trpc.payments.prepare.mutate({
        orderNumber: identity.orderNumber,
        token: identity.token,
        confirmCode: identity.confirmCode,
        ...details,
        stadiumSlug,
        deviceId,
      });
      if (!data.ok) {
        return { ok: false as const, message: data.message || "The connection dropped. Try again." };
      }
      const session = remember({
        ...identity,
        paymentIntentId: data.paymentIntentId,
        clientSecret: data.clientSecret,
        amountCents: data.amountCents,
        fingerprint: mark,
      });
      return { ok: true as const, session, settled: data.status === "succeeded" || data.status === "processing" };
    },
    [remember, stadiumSlug, trpc],
  );

  const warmKey = warm ? fingerprint(warm) : "";
  const warmRef = useRef(warm);
  warmRef.current = warm;
  useEffect(() => {
    if (!warmKey || !warmRef.current) return;
    const handle = window.setTimeout(() => {
      void prepare(warmRef.current!).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [prepare, warmKey]);

  async function submit(details: PayDetails): Promise<PayResult> {
    if (!stripe) return { ok: false, message: "Payment is still loading. Try again in a moment." };
    let prepared: Awaited<ReturnType<typeof prepare>>;
    try {
      prepared = await prepare(details);
    } catch {
      return { ok: false, message: "The connection dropped. You haven’t been charged — try again." };
    }
    if (!prepared.ok) return prepared;
    if (!prepared.session.clientSecret) return { ok: false, message: "Payment is still loading. Try again in a moment." };
    if (prepared.settled) return finalize(prepared.session);

    remember({ awaiting: true });
    const returnUrl = `${window.location.origin}/${stadiumSlug}/checkout/return`;

    if (details.method === "card") {
      const card = elements?.getElement(CardNumberElement);
      if (!card || !cardCompleteRef.current) {
        remember({ awaiting: false });
        return { ok: false, message: "Check the card number, expiry and CVC.", openCard: true };
      }
      const result = await stripe.confirmCardPayment(
        prepared.session.clientSecret,
        { payment_method: { card }, return_url: returnUrl },
      );
      if (result.error) {
        remember({ awaiting: false });
        return { ok: false, message: describe(result.error) };
      }
      return finalize(prepared.session);
    }

    const request = requestRef.current;
    const available = details.method === "apple" ? wallets.apple : wallets.google;
    if (!request || !available) {
      remember({ awaiting: false });
      const name = details.method === "apple" ? "Apple Pay" : "Google Pay";
      return { ok: false, message: `${name} isn’t available on this phone. Pay with a card instead.`, openCard: true };
    }

    const outcome = await new Promise<"cancel" | { error?: StripeError; status?: string }>((resolve) => {
      const onCancel = () => {
        cleanup();
        resolve("cancel");
      };
      const onMethod = async (event: PaymentRequestPaymentMethodEvent) => {
        const first = await stripe.confirmCardPayment(
          prepared.session.clientSecret!,
          { payment_method: event.paymentMethod.id, return_url: returnUrl },
          { handleActions: false },
        );
        if (first.error) {
          event.complete("fail");
          cleanup();
          resolve({ error: first.error });
          return;
        }
        event.complete("success");
        if (first.paymentIntent?.status === "requires_action") {
          const next = await stripe.confirmCardPayment(prepared.session.clientSecret!);
          cleanup();
          resolve(next.error ? { error: next.error } : { status: next.paymentIntent?.status });
          return;
        }
        cleanup();
        resolve({ status: first.paymentIntent?.status });
      };
      const cleanup = () => {
        request.off("cancel", onCancel);
        request.off("paymentmethod", onMethod);
      };
      request.on("cancel", onCancel);
      request.on("paymentmethod", onMethod);
      try {
        request.show();
      } catch {
        cleanup();
        resolve("cancel");
      }
    });

    if (outcome === "cancel") {
      remember({ awaiting: false });
      return { ok: false, message: "Payment cancelled. You haven’t been charged." };
    }
    if (outcome.error) {
      remember({ awaiting: false });
      return { ok: false, message: describe(outcome.error) };
    }
    return finalize(prepared.session);
  }

  return { wallets, setCardComplete, submit, orderNumber: sessionRef.current?.orderNumber ?? "" };
}
