import type { Fulfillment, Receipt, Timing } from "@/lib/orders/receipt";
import { toReceipt } from "@/lib/orders/shape";
import type { PricedOrder } from "./quote";

export type CheckoutDraft = {
  kind: "checkout";
  orderNumber: string;
  stadiumSlug: string;
  stadiumName: string;
  seat: Receipt["seat"];
  fulfillment: Fulfillment;
  timing: Timing;
  scheduledAt: number | null;
  etaMin: number;
  etaMax: number;
  confirmCode: string;
  deviceId: string;
  token: string;
  currency: string;
  lines: Receipt["lines"];
};

export type ExtraDraft = {
  kind: "extra";
  orderNumber: string;
  stadiumSlug: string;
  lines: Receipt["lines"];
};

export type PaymentDraft = CheckoutDraft | ExtraDraft;

const DEVICE_ID = /^[a-z0-9-]{8,64}$/i;

export function checkoutDraft(input: Omit<CheckoutDraft, "kind" | "lines" | "currency" | "stadiumName"> & {
  priced: PricedOrder;
}): CheckoutDraft {
  return {
    kind: "checkout",
    orderNumber: input.orderNumber,
    stadiumSlug: input.stadiumSlug,
    stadiumName: input.priced.stadiumName,
    seat: input.seat,
    fulfillment: input.fulfillment,
    timing: input.timing,
    scheduledAt: input.scheduledAt,
    etaMin: input.etaMin,
    etaMax: input.etaMax,
    confirmCode: input.confirmCode,
    deviceId: input.deviceId,
    token: input.token,
    currency: input.priced.currency,
    lines: input.priced.lines,
  };
}

export function parseDraft(value: unknown): PaymentDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<PaymentDraft>;
  if (draft.kind === "extra") {
    if (!draft.orderNumber || !draft.stadiumSlug || !Array.isArray(draft.lines)) return null;
    return draft as ExtraDraft;
  }
  if (draft.kind !== "checkout") return null;
  if (!draft.orderNumber || !draft.token || !draft.deviceId || !DEVICE_ID.test(draft.deviceId)) return null;
  return draft as CheckoutDraft;
}

/** Receipt written only after Stripe says the charge succeeded. */
export function receiptFromDraft(draft: CheckoutDraft, paidAt: number): Receipt | null {
  const readyAt =
    draft.timing === "scheduled" && draft.scheduledAt && draft.scheduledAt > paidAt
      ? draft.scheduledAt
      : paidAt + draft.etaMax * 60_000;
  const totalCents = draft.lines.reduce((sum, line) => sum + line.qty * (line.unitCents ?? 0), 0);
  return toReceipt({
    ...draft,
    paidAt,
    readyAt,
    runnerNote: "",
    totalCents,
    currency: draft.currency,
  });
}
