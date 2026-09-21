/**
 * Receipt validation shared by the phone and the API. No browser or DB imports
 * here on purpose — this file runs in both worlds.
 */

import type { Fulfillment, Receipt, ReceiptLine, Timing } from "./receipt";

const FULFILLMENT = new Set<Fulfillment>(["delivery", "pickup"]);
const TIMING = new Set<Timing>(["asap", "scheduled"]);
const MAX_LINES = 60;
const MAX_TEXT = 200;

function str(v: unknown, max = MAX_TEXT): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function line(v: unknown): ReceiptLine | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const productId = str(o.productId);
  const name = str(o.name);
  const qty = num(o.qty);
  if (!productId || !name || qty === null || qty <= 0) return null;
  const out: ReceiptLine = { productId, name, qty: Math.floor(qty) };
  const note = str(o.note);
  if (note) out.note = note;
  const vendorId = str(o.vendorId);
  if (vendorId) out.vendorId = vendorId;
  const vendorName = str(o.vendorName);
  if (vendorName) out.vendorName = vendorName;
  const unitCents = num(o.unitCents);
  if (unitCents !== null) out.unitCents = Math.floor(unitCents);
  return out;
}

function seat(v: unknown): Receipt["seat"] {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const sectionCode = str(o.sectionCode, 40);
  const sectionName = str(o.sectionName, 80);
  const number = str(o.number, 20);
  if (!sectionCode || !sectionName || !number) return null;
  return { sectionCode, sectionName, number, row: str(o.row, 20) ?? "" };
}

/** Strict copy of an untrusted receipt, or null. Unknown keys are dropped. */
export function toReceipt(input: unknown): Receipt | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  const orderNumber = str(o.orderNumber, 16);
  const stadiumSlug = str(o.stadiumSlug, 80);
  const stadiumName = str(o.stadiumName, 120);
  const confirmCode = str(o.confirmCode, 8);
  const paidAt = num(o.paidAt);
  const readyAt = num(o.readyAt);
  const etaMin = num(o.etaMin);
  const etaMax = num(o.etaMax);
  if (!orderNumber || !stadiumSlug || !stadiumName || !confirmCode) return null;
  if (paidAt === null || readyAt === null || etaMin === null || etaMax === null) return null;
  if (!FULFILLMENT.has(o.fulfillment as Fulfillment) || !TIMING.has(o.timing as Timing)) return null;
  if (!Array.isArray(o.lines) || o.lines.length === 0 || o.lines.length > MAX_LINES) return null;

  const lines = o.lines.map(line);
  if (lines.some((l) => l === null)) return null;

  const receipt: Receipt = {
    orderNumber,
    stadiumSlug,
    stadiumName,
    seat: seat(o.seat),
    fulfillment: o.fulfillment as Fulfillment,
    timing: o.timing as Timing,
    scheduledAt: num(o.scheduledAt),
    etaMin,
    etaMax,
    paidAt,
    readyAt,
    runnerNote: str(o.runnerNote) ?? "",
    confirmCode,
    lines: lines as ReceiptLine[],
  };

  const email = str(o.email);
  if (email) receipt.email = email;
  const currency = str(o.currency, 3);
  if (currency) receipt.currency = currency;
  const totalCents = num(o.totalCents);
  if (totalCents !== null) receipt.totalCents = Math.floor(totalCents);
  const deviceId = str(o.deviceId, 64);
  if (deviceId) receipt.deviceId = deviceId;
  const token = str(o.token, 64);
  if (token) receipt.token = token;

  return receipt;
}

/** What a stranger with the URL may see: the receipt without its secrets. */
export function publicReceipt(receipt: Receipt): Receipt {
  const copy: Receipt = { ...receipt };
  delete copy.token;
  delete copy.deviceId;
  return copy;
}
