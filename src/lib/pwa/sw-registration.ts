/** Shared hand-off between `SwRegister` and push hooks. Child effects can run before the register effect. */

type Registration = ServiceWorkerRegistration | null;

let current: Registration | undefined;
const waiters = new Set<(registration: Registration) => void>();

/** Called by `SwRegister` once register/unregister settles (or immediately when unsupported). */
export function setServiceWorkerRegistration(registration: Registration) {
  current = registration;
  for (const notify of waiters) notify(registration);
  waiters.clear();
}

/**
 * Resolves with the production worker, or null when there isn't one.
 * Prefer the value `SwRegister` published; fall back to `getRegistration()` after a short wait
 * so a late mount still finds a worker that registered before this module loaded.
 */
export function whenServiceWorkerRegistration(timeoutMs = 4000): Promise<Registration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (current !== undefined) return Promise.resolve(current);

  return new Promise((resolve) => {
    const finish = (registration: Registration) => {
      clearTimeout(timer);
      waiters.delete(finish);
      resolve(registration);
    };
    waiters.add(finish);
    const timer = setTimeout(() => {
      waiters.delete(finish);
      void navigator.serviceWorker.getRegistration().then((registration) => {
        // Only freeze a found registration. Leave `current` unset on a miss so
        // a late `SwRegister` publish can still wake a later caller.
        if (registration) current = registration;
        resolve(registration ?? null);
      });
    }, timeoutMs);
  });
}
