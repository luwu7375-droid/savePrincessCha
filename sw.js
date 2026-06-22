// ── Service Worker — cleanup / disabled state ─────────────────────────────────
// This SW intentionally does nothing and unregisters itself.
// It exists so any browser that cached the previous spc-shell-v1 SW receives
// a new version, deletes all caches, and stops intercepting requests.
//
// PWA caching strategy will be re-designed in a future PR once the app shell
// is stable. Until then the app runs fully network-first.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = "spc-shell-disabled-v1";

self.addEventListener("install", () => {
  // Activate immediately — don't wait for old SW to lose all clients.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});

// Intentional no-op: every request goes straight to the network.
self.addEventListener("fetch", () => {});
