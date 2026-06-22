// ── Service Worker — savePrincessCha ─────────────────────────────────────────
// Strategy:
//   • App-shell files cached on install (cache-first on fetch).
//   • Navigation requests fall back to /index.html when offline.
//   • Supabase / chat API / model requests are NEVER cached.
//   • Bump CACHE_NAME when deploying a new version so stale caches are dropped.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = "spc-shell-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/v2.css",
  "/v2-bubbles.css",
  "/app.js",
  "/public-config.js",
  "/manifest.webmanifest",
];

// Hostnames and path prefixes that must never be cached.
// Matches Supabase, OpenAI-compatible, and generic /api/* routes.
const BYPASS_HOSTNAMES = [
  "supabase.co",
  "supabase.in",
  "openai.com",
  "anthropic.com",
  "cloudflare.com",
];

const BYPASS_PATH_PREFIXES = [
  "/api/",
  "/rest/v1/",
  "/auth/v1/",
  "/realtime/v1/",
  "/storage/v1/",
  "/functions/v1/",
];

function shouldBypass(url) {
  const { hostname, pathname } = new URL(url);
  if (BYPASS_HOSTNAMES.some((h) => hostname.endsWith(h))) return true;
  if (BYPASS_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

// ── Install: pre-cache app shell ───────────────────────���──────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      // Skip waiting so the new SW activates immediately on next navigation.
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      // Claim all clients so pages don't need a reload after first install.
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell; network-only for API ───────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests.
  if (request.method !== "GET") return;

  // Never intercept API / auth / realtime traffic.
  if (shouldBypass(request.url)) return;

  // Navigation (HTML page) requests: try network first, fall back to cached
  // index.html so the app still loads offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html")
      )
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful same-origin responses.
        if (
          response.ok &&
          response.type === "basic" &&
          new URL(request.url).origin === self.location.origin
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
