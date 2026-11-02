/* Seat Service — minimal, dependency-free service worker.
 *
 * Strategy
 *  - /_next/static/*  → cache-first (content-hashed, immutable)
 *  - /_next/image, /icons/* → stale-while-revalidate
 *  - navigations       → network-first, falling back to the last cached copy of that page
 *  - everything else   → network only (API/RSC payloads must stay fresh)
 *
 * Bump VERSION to invalidate all caches on deploy.
 */
const VERSION = "v8";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const KNOWN = new Set([STATIC_CACHE, PAGE_CACHE]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KNOWN.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE));
  }
});

// Payload from src/lib/push/send.ts: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Seat Service", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

// The push service rotated the subscription. Move the server row to the new endpoint.
// Without `oldSubscription` (some browsers) the page re-attaches on its next visit instead.
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  if (!old) return;
  event.waitUntil(
    (async () => {
      const next =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: old.options.applicationServerKey }));
      await fetch("/api/push/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: next.toJSON() }),
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && client.url !== new URL(target, self.location.origin).href) {
            return client.navigate(target);
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Dev chunks keep their names while their contents change; only `next start` marks them immutable.
  if (res.ok && /immutable/.test(res.headers.get("cache-control") || "")) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}

function pageKey(request) {
  const match = (request.headers.get("cookie") || "").match(/(?:^|;\s*)locale=(sv|da|en)(?:;|$)/);
  const url = new URL(request.url);
  url.searchParams.set("__locale", match ? match[1] : "device");
  return new Request(url.toString(), { method: "GET" });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const key = pageKey(request);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    return offlinePage(cache);
  }
}

const OFFLINE_COPY = {
  en: { title: "You're offline", body: "Reconnect to load the menu.", order: "Open your last order" },
  sv: { title: "Du är offline", body: "Anslut igen för att ladda menyn.", order: "Öppna din senaste order" },
  da: { title: "Du er offline", body: "Opret forbindelse igen for at hente menuen.", order: "Åbn din seneste ordre" },
};

/** Shown for a page that was never cached. Links to the last order page this phone opened, which is cached. */
async function offlinePage(cache) {
  const lang = (self.navigator.language || "en").slice(0, 2);
  const copy = OFFLINE_COPY[lang] || OFFLINE_COPY.en;
  const orders = (await cache.keys()).map((r) => new URL(r.url).pathname).filter((p) => /^\/(?:(?:sv|da|en)\/)?[^/]+\/order\/[^/]+$/.test(p));
  const last = orders[orders.length - 1];
  const link = last ? `<p style="margin:16px 0 0"><a href="${last}" style="color:#0066cc">${copy.order}</a></p>` : "";
  return new Response(
    `<!doctype html><html lang="${lang}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title}</title>` +
      `<body style="margin:0;min-height:100dvh;display:grid;place-content:center;gap:4px;padding:24px;background:#f4f4f1;color:#111;font:15px/1.3 system-ui,sans-serif">` +
      `<h1 style="margin:0;font-size:28px;letter-spacing:-0.03em">${copy.title}</h1><p style="margin:0;color:#6b6b66">${copy.body}</p>${link}</body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
