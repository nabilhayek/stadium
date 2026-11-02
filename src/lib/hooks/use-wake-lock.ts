"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active`. The browser drops the lock whenever the tab
 * is hidden, so it is taken again each time the page comes back.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (released) void lock.release();
      } catch {
        /* low battery or a policy refused it; the screen just sleeps as usual */
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
