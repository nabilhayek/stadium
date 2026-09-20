"use client";

import { useSyncExternalStore } from "react";
import { getSeatStore } from "./store";

export function useSeat(stadiumSlug: string) {
  const store = getSeatStore(stadiumSlug);
  const seat = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { seat, store };
}
