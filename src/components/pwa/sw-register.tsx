"use client";

import { useEffect } from "react";
// Listens for `beforeinstallprompt` early. preventDefault runs only while shop chrome or the order page is mounted.
import "@/lib/hooks/use-install-prompt";
import { setServiceWorkerRegistration } from "@/lib/pwa/sw-registration";

/** Registers the service worker in production, after the page has loaded, so it never competes with first paint. */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setServiceWorkerRegistration(null);
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      // A worker left behind by `next start` on the same origin would keep serving stale dev chunks.
      void navigator.serviceWorker.getRegistrations().then(async (regs) => {
        if (regs.length === 0) {
          setServiceWorkerRegistration(null);
          return;
        }
        await Promise.all(regs.map((r) => r.unregister()));
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
        setServiceWorkerRegistration(null);
        location.reload();
      });
      return;
    }

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => setServiceWorkerRegistration(registration))
        .catch(() => {
          /* offline or unsupported — the app works without it */
          setServiceWorkerRegistration(null);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
