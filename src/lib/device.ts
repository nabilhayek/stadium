/**
 * Anonymous per-install identity. No accounts here: the phone is the user.
 * Receipts carry this id so the server can hand a phone its own history back.
 */

const KEY = "device:v1";
let cached: string | null = null;

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    return null;
  }
}
