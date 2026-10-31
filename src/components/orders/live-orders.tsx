"use client";

import { useEffect, useMemo } from "react";
import { useNow } from "@/lib/hooks/use-now";
import { useLiveStream } from "@/lib/hooks/use-live-stream";
import { useStorageValue } from "@/lib/hooks/use-storage";
import { applyServerReceipt } from "@/lib/orders/merge";
import { parsePastOrders, pastOrdersKey } from "@/lib/orders/past";
import { isOrderLive, parseReceipt, receiptKey, type Receipt } from "@/lib/orders/receipt";
import { fetchReceipt } from "@/lib/orders/sync";

const MAX_ORDERS = 5;
const FALLBACK_MS = 30_000;

function waiting(receipt: Receipt, now: number) {
  return isOrderLive(receipt, now) && receipt.kitchenStatus !== "done" && receipt.kitchenStatus !== "declined";
}

/**
 * Keeps every live order on this phone in step with the kitchen: one stream for
 * all of them, so the tracker pill and the order page update without polling.
 */
export function LiveOrders({ stadiumSlug }: { stadiumSlug: string }) {
  const now = useNow(15_000);
  const sessionRaw = useStorageValue("session", receiptKey(stadiumSlug));
  const pastRaw = useStorageValue("local", pastOrdersKey(stadiumSlug));

  const numbers = useMemo(() => {
    if (!now) return [];
    const all = [parseReceipt(sessionRaw), ...parsePastOrders(pastRaw)].filter((r): r is Receipt => r !== null && waiting(r, now));
    return [...new Set(all.map((r) => r.orderNumber))].sort().slice(0, MAX_ORDERS);
  }, [sessionRaw, pastRaw, now]);

  const key = numbers.join(",");
  const url = key ? `/api/live/orders/${encodeURIComponent(stadiumSlug)}?${numbers.map((n) => `o=${encodeURIComponent(n)}`).join("&")}` : null;
  const live = useLiveStream(url, { receipt: (data) => applyServerReceipt(data as Receipt) });

  useEffect(() => {
    if (!key || live) return;
    const pull = () => {
      if (document.visibilityState !== "visible") return;
      for (const orderNumber of key.split(",")) {
        void fetchReceipt(stadiumSlug, orderNumber).then((result) => {
          if (result.status === "found") applyServerReceipt(result.receipt);
        });
      }
    };
    const id = window.setInterval(pull, FALLBACK_MS);
    return () => window.clearInterval(id);
  }, [key, live, stadiumSlug]);

  return null;
}
