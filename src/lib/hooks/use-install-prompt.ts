"use client";

import { useEffect, useSyncExternalStore } from "react";
import { locales } from "@/i18n/config";
import { isIos } from "@/lib/push/client";

const STATIC_ROOTS = new Set(["privacy", "terms", "status", "venues", "reset-password", "verify-email"]);

/** Customer stadium pages mount the shop menu, and the order page mounts Install there too. The desk does not. */
function routeShowsInstallButton(path: string) {
  if (path.includes("/management")) return false;
  const parts = path.split("/").filter(Boolean);
  const body = parts[0] && (locales as readonly string[]).includes(parts[0]) ? parts.slice(1) : parts;
  if (body.length === 0 || STATIC_ROOTS.has(body[0])) return false;
  return true;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let holders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((notify) => notify());

/**
 * Shop chrome and the order page mount this. Only then do we keep Chrome's install
 * dialog for our button. Other pages leave the event alone so the browser can show its own banner.
 */
export function useHoldInstallPrompt() {
  useEffect(() => {
    holders += 1;
    return () => {
      holders -= 1;
    };
  }, []);
}

// Registered at import, before paint. preventDefault only on pages that can show our Install button.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // The event often fires before React effects. The route is known immediately; holders cover a later navigation.
    if (holders === 0 && !routeShowsInstallButton(window.location.pathname)) return;
    event.preventDefault();
    deferred = event as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type InstallPrompt = {
  /** Chrome, Edge and Samsung Internet: the browser's own install dialog is ready. */
  canInstall: boolean;
  /** Safari on iPhone has no dialog; the fan adds the app from the Share sheet. */
  iosHint: boolean;
  install: () => Promise<boolean>;
};

export function useInstallPrompt(): InstallPrompt {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  );
  const iosHint = useSyncExternalStore(
    subscribe,
    () => isIos(navigator.userAgent, navigator.maxTouchPoints) && !standalone(),
    () => false,
  );

  return {
    canInstall,
    iosHint,
    install: async () => {
      const event = deferred;
      if (!event) return false;
      deferred = null;
      emit();
      await event.prompt();
      return (await event.userChoice).outcome === "accepted";
    },
  };
}
