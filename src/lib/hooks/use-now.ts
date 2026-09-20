"use client";

import { useSyncExternalStore } from "react";

/**
 * Wall clock as a React snapshot, bucketed to `stepMs` so getSnapshot is stable
 * between ticks. Server snapshot is 0 (no clock on the server).
 */
export function useNow(stepMs = 1000): number {
  return useSyncExternalStore(
    (notify) => {
      const id = window.setInterval(notify, stepMs);
      return () => window.clearInterval(id);
    },
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => 0,
  );
}
