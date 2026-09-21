/** Completed receipts kept on-device so the shop can show order history. */

import { writeStorage } from "@/lib/hooks/use-storage";
import { parseReceipt, type Receipt } from "@/lib/orders/receipt";

const PREFIX = "past-orders:v1:";
const MAX = 30;

export function pastOrdersKey(stadiumSlug: string) {
  return PREFIX + stadiumSlug;
}

export function parsePastOrders(raw: string | null): Receipt[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parseReceipt(typeof item === "string" ? item : JSON.stringify(item)))
      .filter((item): item is Receipt => item !== null);
  } catch {
    return [];
  }
}

export function readPastOrders(stadiumSlug: string): Receipt[] {
  if (typeof window === "undefined") return [];
  try {
    return parsePastOrders(window.localStorage.getItem(pastOrdersKey(stadiumSlug)));
  } catch {
    return [];
  }
}

export function recordPastOrder(receipt: Receipt) {
  if (typeof window === "undefined") return;
  const prev = readPastOrders(receipt.stadiumSlug);
  // Newest first by pay time, so receipts restored from the server slot in where they belong.
  const next = [receipt, ...prev.filter((o) => o.orderNumber !== receipt.orderNumber)]
    .sort((a, b) => b.paidAt - a.paidAt)
    .slice(0, MAX);
  writeStorage("local", pastOrdersKey(receipt.stadiumSlug), JSON.stringify(next));
}

export function lineCount(receipt: Receipt) {
  return receipt.lines.reduce((n, line) => n + line.qty, 0);
}

export function formatOrderWhen(ms: number) {
  return new Date(ms).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
