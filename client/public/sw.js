/* Minimal offline shell worker — satisfies Chrome installability pairing with manifest on Android.
 * No stale caching: fetch handler defers entirely to network. Updates apply on next reload. */

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(clients.claim());
});

/** Installability audits expect a controlled fetch listener; always fall through to network. */
self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});
