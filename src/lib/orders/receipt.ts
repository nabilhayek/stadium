import type { Seat } from "@/lib/seat/store";
import { writeStorage } from "@/lib/hooks/use-storage";

export type Fulfillment = "delivery" | "pickup";
export type Timing = "asap" | "scheduled";

export type ReceiptLine = {
  productId: string;
  name: string;
  qty: number;
  note?: string;
  vendorId?: string;
  vendorName?: string;
  unitCents?: number;
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
  /** Present on orders placed after history landed. Older receipts omit it. */
  currency?: string;
  totalCents?: number;
  lines: ReceiptLine[];
  /** Anonymous install id the order was placed from. Lets that phone restore its history. */
  deviceId?: string;
  /** Write secret for the server copy. Missing on receipts restored from a bare URL. */
  token?: string;
};

const PREFIX = "receipt:v1:";

/** Unambiguous, shout-across-the-counter alphabet: no 0/O or 1/I. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(length: number) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** "A-K7M2" — ~1M combinations per stadium, so numbers stay unique server-side. */
export function makeOrderNumber() {
  return `A-${randomCode(4)}`;
}

/** Secret that authorises updates to the server copy of a receipt. */
export function makeReceiptToken() {
  return randomCode(24);
}

const ORDER_NUMBER = /^[A-Z]-[A-Z0-9]{4,8}$/i;

export function isOrderNumber(value: string) {
  return ORDER_NUMBER.test(value);
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

/** "m:ss" countdown. */
export function formatRemain(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

/** Headline for the current stage of an order. */
export function statusTitle(receipt: Receipt, now: number) {
  const arrived = receipt.readyAt - now <= 0;
  const delivery = receipt.fulfillment === "delivery";
  if (arrived) return delivery ? "At your seat" : "Ready for pickup";
  return delivery ? "On the way" : "Being prepared";
}

/** How long after the ETA the shop keeps showing the order widget. */
const LINGER_MS = 30 * 60_000;

export function isOrderLive(receipt: Receipt, now: number) {
  return now < receipt.readyAt + LINGER_MS;
}
