"use client";

import { useSyncExternalStore } from "react";

const EVENT = "app-storage";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
}

type Kind = "local" | "session";

function area(kind: Kind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Raw string at `key`, null on the server / before hydration / in private mode. */
export function useStorageValue(kind: Kind, key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return area(kind)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/** Write + notify same-tab subscribers (the native `storage` event only fires cross-tab). */
export function writeStorage(kind: Kind, key: string, value: string | null) {
  try {
    const s = area(kind);
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* private mode */
  }
}

/** True once mounted on the client. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
