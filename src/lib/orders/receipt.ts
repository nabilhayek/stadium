import type { Seat } from "@/lib/seat/store";
import { writeStorage } from "@/lib/hooks/use-storage";

export type Fulfillment = "delivery" | "pickup";
export type Timing = "asap" | "scheduled";

export type ReceiptLine = {
  productId: string;
  name: string;
  qty: number;
  note?: string;
};

export type Receipt = {
  orderNumber: string;
  stadiumSlug: string;
  stadiumName: string;
  seat: Seat | null;
  fulfillment: Fulfillment;
  timing: Timing;
  scheduledAt: number | null;
  etaMin: number;
  etaMax: number;
  paidAt: number;
  readyAt: number;
  runnerNote: string;
  /** 4-digit hand-off code the runner confirms on their end. */
  confirmCode: string;
  /** Where to send the receipt. Sending is wired up later; we only store it for now. */
  email?: string;
  lines: ReceiptLine[];
};

const PREFIX = "receipt:v1:";

export function makeOrderNumber() {
  const n = (Date.now() % 9000) + 1000;
  return `A-${n}`;
}

/** Payment timestamp (ms). */
export function stampPaidAt() {
  return Date.now();
}

/** Four digits the runner will type to confirm the hand-off. */
export function makeConfirmCode() {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
}

/** Stable 4-digit display, including older receipts that pre-date confirmCode. */
export function confirmDigits(code: string | undefined, fallback = "") {
  const fromCode = (code ?? "").replace(/\D/g, "");
  const fromFallback = fallback.replace(/\D/g, "");
  const digits = (fromCode || fromFallback).padStart(4, "0").slice(-4);
  return digits.split("");
}

export function receiptKey(stadiumSlug: string) {
  return PREFIX + stadiumSlug;
}

export function parseReceipt(raw: string | null): Receipt | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Receipt;
    return parsed?.orderNumber ? parsed : null;
  } catch {
    return null;
  }
}

export function readReceipt(stadiumSlug: string): Receipt | null {
  if (typeof window === "undefined") return null;
  try {
    return parseReceipt(window.sessionStorage.getItem(receiptKey(stadiumSlug)));
  } catch {
    return null;
  }
}

export function writeReceipt(receipt: Receipt) {
  writeStorage("session", receiptKey(receipt.stadiumSlug), JSON.stringify(receipt));
}

export function clearReceipt(stadiumSlug: string) {
  writeStorage("session", receiptKey(stadiumSlug), null);
}

/** Kitchen needs a head start: earliest schedulable time, rounded up to 5 minutes. */
export const MIN_LEAD_MIN = 20;
export const MAX_LEAD_MIN = 4 * 60;

export function earliestSchedule(from = Date.now(), stepMin = 5): number {
  const start = new Date(from + MIN_LEAD_MIN * 60_000);
  start.setSeconds(0, 0);
  const minutes = start.getMinutes();
  start.setMinutes(minutes + ((stepMin - (minutes % stepMin)) % stepMin));
  return start.getTime();
}

export function isValidSchedule(ms: number, now = Date.now()) {
  return ms >= earliestSchedule(now) && ms <= now + MAX_LEAD_MIN * 60_000;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}
