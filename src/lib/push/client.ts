/** Browser-side helpers for Web Push and installing the app. Pure, so they test without a browser. */

/** VAPID public keys are URL-safe base64; `pushManager.subscribe` wants the raw bytes. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** iPhone and iPad, including iPadOS that reports itself as a Mac with touch. */
export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * iOS only exposes Web Push to apps opened from the home screen.
 * True when installing is the one thing standing between this phone and notifications.
 */
export function needsInstall(env: { userAgent: string; maxTouchPoints: number; standalone: boolean; hasPush: boolean }): boolean {
  return !env.hasPush && !env.standalone && isIos(env.userAgent, env.maxTouchPoints);
}

export type SubscriptionKeys = { endpoint: string; keys: { p256dh: string; auth: string } };

/** `PushSubscription.toJSON()` types every field as optional. */
export function subscriptionKeys(json: PushSubscriptionJSON): SubscriptionKeys | null {
  const { endpoint, keys } = json;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
