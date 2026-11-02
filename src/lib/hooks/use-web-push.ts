"use client";

import { useCallback, useEffect, useState } from "react";
import { needsInstall as needsInstallFor, subscriptionKeys, urlBase64ToUint8Array, type SubscriptionKeys } from "@/lib/push/client";
import { whenServiceWorkerRegistration } from "@/lib/pwa/sw-registration";
import { useMounted, useStorageValue, writeStorage } from "./use-storage";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** What a subscription is for: the fan's order, or new orders at the desk. */
export type PushTarget = {
  /** localStorage flag that remembers the opt-in, so the next order or visit re-attaches without asking. */
  key: string;
  attach: (subscription: SubscriptionKeys) => Promise<boolean>;
  detach: (endpoint: string) => Promise<void>;
};

export type WebPush = {
  /** This browser can receive pushes right now (secure context, worker registered, key configured). */
  supported: boolean;
  permission: NotificationPermission | null;
  subscribed: boolean;
  /** iPhone in Safari: add to the home screen first. */
  needsInstall: boolean;
  busy: boolean;
  /** Must run from a tap; browsers refuse a permission prompt without one. */
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
};

function hasPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useWebPush(target: PushTarget | null): WebPush {
  const mounted = useMounted();
  const optedIn = useStorageValue("local", target?.key ?? "") === "on";
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Find the worker, read the permission, and re-attach a remembered opt-in to this target.
  // Uses getRegistration via SwRegister's hand-off — never `serviceWorker.ready`, which hangs in dev.
  useEffect(() => {
    if (!mounted || !target || !PUBLIC_KEY || !hasPush()) return;
    let cancelled = false;
    void (async () => {
      const reg = await whenServiceWorkerRegistration();
      if (cancelled || !reg) return;
      setReady(true);
      setPermission(Notification.permission);
      if (Notification.permission !== "granted" || !optedIn) return;
      const existing = await reg.pushManager.getSubscription();
      const keys = existing ? subscriptionKeys(existing.toJSON()) : null;
      if (!keys) return;
      const ok = await target.attach(keys).catch(() => false);
      if (!cancelled) setSubscribed(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, target, optedIn]);

  const subscribe = useCallback(async () => {
    if (!target) return false;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return false;
      const reg = await whenServiceWorkerRegistration();
      if (!reg) return false;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) }));
      const keys = subscriptionKeys(sub.toJSON());
      if (!keys || !(await target.attach(keys))) return false;
      writeStorage("local", target.key, "on");
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [target]);

  // The browser subscription stays: fan and desk on one device share the endpoint row.
  const unsubscribe = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    try {
      const reg = await whenServiceWorkerRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await target.detach(sub.endpoint);
      writeStorage("local", target.key, null);
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [target]);

  const env = mounted ? { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone: isStandalone(), hasPush: hasPush() } : null;

  return {
    supported: ready,
    permission,
    subscribed,
    needsInstall: env ? needsInstallFor(env) : false,
    busy,
    subscribe,
    unsubscribe,
  };
}
