/**
 * Local-first receipts.
 *
 *   write: phone storage first (sessionStorage for the live tracker, localStorage
 *          for history), then a queued PUT to the server that survives reloads
 *          and retries when the connection comes back.
 *   read:  callers look in phone storage first and only call `fetchReceipt`
 *          when the order is not on this device.
 */

import { getDeviceId } from "@/lib/device";
import { writeStorage } from "@/lib/hooks/use-storage";
import { readPastOrders, recordPastOrder } from "./past";
import { writeReceipt, type Receipt } from "./receipt";
import { toReceipt } from "./shape";

const QUEUE_KEY = "order-sync:v1";

function orderUrl(orderNumber: string, stadiumSlug?: string) {
  const base = `/api/orders/${encodeURIComponent(orderNumber)}`;
  return stadiumSlug ? `${base}?stadium=${encodeURIComponent(stadiumSlug)}` : base;
}

function readQueue(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeQueue(keys: string[]) {
  writeStorage("local", QUEUE_KEY, keys.length ? JSON.stringify(keys) : null);
}

function queueKey(receipt: Receipt) {
  return `${receipt.stadiumSlug}|${receipt.orderNumber}`;
}

/**
 * Persist a receipt the local-first way. `live` (default true) also makes it the
 * order the shop's tracker pill follows. The server write happens in the background.
 */
export function commitReceipt(receipt: Receipt, { live = true } = {}) {
  if (live) writeReceipt(receipt);
  recordPastOrder(receipt);
  if (receipt.token) {
    const keys = readQueue();
    const key = queueKey(receipt);
    writeQueue(keys.includes(key) ? keys : [...keys, key]);
  }
  void flushOrderSync();
}

let inflight: Promise<void> | null = null;

/** Push every queued receipt. Stops at the first network/server failure and retries later. */
export function flushOrderSync(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight) return inflight;

  inflight = (async () => {
    for (const key of readQueue()) {
      const [stadiumSlug, orderNumber] = key.split("|");
      const receipt = readPastOrders(stadiumSlug).find((o) => o.orderNumber === orderNumber);
      if (!receipt?.token) {
        writeQueue(readQueue().filter((k) => k !== key));
        continue;
      }
      try {
        const res = await fetch(orderUrl(orderNumber), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(receipt),
          keepalive: true,
        });
        const settled = res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
        if (!settled) return;
        writeQueue(readQueue().filter((k) => k !== key));
      } catch {
        return; // offline — the `online` event will call us again
      }
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export type FetchResult =
  | { status: "found"; receipt: Receipt }
  | { status: "missing" }
  | { status: "offline" };

/** Server fallback for one order. Saves nothing — the caller decides what to keep. */
export async function fetchReceipt(stadiumSlug: string, orderNumber: string): Promise<FetchResult> {
  try {
    const res = await fetch(orderUrl(orderNumber, stadiumSlug), { cache: "no-store" });
    if (res.status === 404 || res.status === 400) return { status: "missing" };
    if (!res.ok) return { status: "offline" };
    const data = (await res.json()) as { receipt?: unknown };
    const receipt = toReceipt(data.receipt);
    return receipt ? { status: "found", receipt } : { status: "missing" };
  } catch {
    return { status: "offline" };
  }
}

/**
 * Pull this install's history from the server and add anything the phone is
 * missing. Returns how many receipts were restored; null when the server is unreachable.
 */
export async function restoreDeviceHistory(stadiumSlug: string): Promise<number | null> {
  const device = getDeviceId();
  if (!device) return null;
  try {
    const url = `/api/orders?stadium=${encodeURIComponent(stadiumSlug)}&device=${encodeURIComponent(device)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { receipts?: unknown[] };
    const remote = (data.receipts ?? []).map(toReceipt).filter((r): r is Receipt => r !== null);
    const local = new Set(readPastOrders(stadiumSlug).map((o) => o.orderNumber));
    let restored = 0;
    for (const receipt of remote) {
      if (local.has(receipt.orderNumber)) continue;
      recordPastOrder(receipt);
      restored++;
    }
    return restored;
  } catch {
    return null;
  }
}
