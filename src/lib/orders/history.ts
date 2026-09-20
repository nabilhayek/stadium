/** Last-ordered + local popularity, per stadium. Used for the menu rail. */

import { writeStorage } from "@/lib/hooks/use-storage";

const PREFIX = "order-history:v1:";
const MAX_LAST = 12;

export type OrderHistory = {
  lastIds: string[];
  counts: Record<string, number>;
};

export const EMPTY_HISTORY: OrderHistory = { lastIds: [], counts: {} };

export function historyKey(stadiumSlug: string) {
  return PREFIX + stadiumSlug;
}

export function parseHistory(raw: string | null): OrderHistory {
  if (!raw) return EMPTY_HISTORY;
  try {
    const parsed = JSON.parse(raw) as OrderHistory;
    return {
      lastIds: Array.isArray(parsed.lastIds) ? parsed.lastIds : [],
      counts: parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {},
    };
  } catch {
    return EMPTY_HISTORY;
  }
}

export function readHistory(stadiumSlug: string): OrderHistory {
  if (typeof window === "undefined") return EMPTY_HISTORY;
  try {
    return parseHistory(window.localStorage.getItem(historyKey(stadiumSlug)));
  } catch {
    return EMPTY_HISTORY;
  }
}

export function recordOrdered(stadiumSlug: string, productIds: string[]) {
  if (typeof window === "undefined" || productIds.length === 0) return;
  const prev = readHistory(stadiumSlug);
  const counts = { ...prev.counts };
  for (const id of productIds) counts[id] = (counts[id] ?? 0) + 1;
  const unique = [...new Set(productIds)].reverse();
  const lastIds = [...new Set([...unique, ...prev.lastIds])].slice(0, MAX_LAST);
  writeStorage("local", historyKey(stadiumSlug), JSON.stringify({ lastIds, counts }));
}
