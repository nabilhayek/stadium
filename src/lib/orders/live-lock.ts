import { confirmDigits, formatClock, formatRemain, type Receipt } from "./receipt";

/**
 * Best a PWA can do for “Live Activity”: a tagged lock-screen notification
 * plus an app-icon badge. True Dynamic Island / WidgetKit needs a native
 * iOS shell (ActivityKit). This path still puts the code and countdown
 * on the lock screen for installed PWAs that grant notifications.
 */

const TAG = "seat-service-order";

let lastKey = "";

export function liveLockSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function liveLockPermission(): NotificationPermission | "unsupported" {
  if (!liveLockSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestLiveLock() {
  if (!liveLockSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function pushLiveLock(receipt: Receipt, now: number) {
  if (!liveLockSupported() || Notification.permission !== "granted") return;

  const left = Math.max(0, receipt.readyAt - now);
  const arrived = left === 0;
  const minute = Math.ceil(left / 60_000);
  const key = `${receipt.orderNumber}:${arrived ? "now" : minute}`;
  if (key === lastKey) return;
  const first = lastKey === "";
  lastKey = key;

  const digits = confirmDigits(receipt.confirmCode, receipt.orderNumber).join("");
  const title = arrived ? `${digits} · At your seat` : `${digits} · ${formatRemain(left)}`;
  const body = arrived
    ? `Show this code to the runner · ${receipt.orderNumber}`
    : `Arriving ${formatClock(receipt.readyAt)} · ${receipt.orderNumber}`;

  const opts: NotificationOptions & { renotify?: boolean } = {
    body,
    tag: TAG,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    silent: !first && !arrived,
    renotify: arrived,
    data: { url: `/${receipt.stadiumSlug}/order/${encodeURIComponent(receipt.orderNumber)}` },
  };

  try {
    if (navigator.serviceWorker?.controller) {
      void navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts));
    } else {
      new Notification(title, opts);
    }
  } catch {
    /* permission revoked mid-flight */
  }

  const badges = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (arrived || minute <= 0) void badges.clearAppBadge?.();
  else void badges.setAppBadge?.(minute);
}

export async function clearLiveLock() {
  lastKey = "";
  const badges = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  void badges.clearAppBadge?.();
  try {
    const reg = await navigator.serviceWorker?.ready;
    const notes = await reg?.getNotifications?.({ tag: TAG });
    notes?.forEach((n) => n.close());
  } catch {
    /* no SW */
  }
}
