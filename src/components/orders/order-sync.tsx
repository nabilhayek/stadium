"use client";

import { useEffect } from "react";
import { flushOrderSync } from "@/lib/orders/sync";

/** Drains the receipt sync queue on load and whenever the phone comes back online. */
export function OrderSync() {
  useEffect(() => {
    void flushOrderSync();
    const retry = () => void flushOrderSync();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  return null;
}
