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
import { httpStatus, trpc } from "@/lib/trpc/client";
import { readPastOrders, recordPastOrder } from "./past";
import { writeReceipt, type Receipt } from "./receipt";

const QUEUE_KEY = "order-sync:v1";

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
        await trpc.orders.put.mutate(receipt);
      } catch (error) {
        // A 4xx means the server will never take this copy; anything else is worth another go.
        const status = httpStatus(error);
        const settled = status !== null && status >= 400 && status < 500 && status !== 429;
        if (!settled) return; // offline — the `online` event will call us again
      }
      writeQueue(readQueue().filter((k) => k !== key));
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
    const receipt = await trpc.orders.get.query({ stadium: stadiumSlug, orderNumber });
    return receipt ? { status: "found", receipt } : { status: "missing" };
  } catch (error) {
    return httpStatus(error) === 400 ? { status: "missing" } : { status: "offline" };
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
    const remote = await trpc.orders.history.query({ stadium: stadiumSlug, device });
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
