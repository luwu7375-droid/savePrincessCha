// ── Service Worker — Web Push + PWA lifecycle ─────────────────────────────────
// Handles:
//   - Web Push notifications (push event)
//   - Notification click handling (notificationclick event)
//   - PWA lifecycle (install, activate)
//
// Cache strategy: network-first (no fetch interception yet)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = "spc-shell-v2";

self.addEventListener("install", () => {
  // Activate immediately — don't wait for old SW to lose all clients.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })))
      .then(() => self.clients.claim())
  );
});

// Intentional no-op: every request goes straight to the network.
self.addEventListener("fetch", () => {});

// ── Web Push notification handler ─────────────────────────────────────────────

self.addEventListener("push", (event) => {
  console.log("[sw] push event received");

  if (!event.data) {
    console.warn("[sw] push event has no data, ignoring");
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    console.error("[sw] failed to parse push data as JSON:", error);
    return;
  }

  const {
    title = "小钗",
    body = "有新消息",
    icon = "/assets/pwa/icon-192.png",
    badge = "/assets/pwa/badge-72.png",
    tag = "default",
    data = {},
  } = payload;

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    data: {
      ...data,
      url: data.url || "/", // Default to app root
      timestamp: Date.now(),
    },
    requireInteraction: false, // Auto-dismiss after a few seconds
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
      .then(() => {
        console.log("[sw] notification shown:", title);
      })
      .catch((error) => {
        console.error("[sw] failed to show notification:", error);
      })
  );
});

// ── Notification click handler ────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  console.log("[sw] notification clicked:", event.notification.tag);

  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open to this origin
        for (const client of clientList) {
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // No matching window found, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
      .catch((error) => {
        console.error("[sw] failed to handle notification click:", error);
      })
  );
});
