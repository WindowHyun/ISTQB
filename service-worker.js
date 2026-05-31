const CACHE_NAME = "istqb-fl-v4-tablet-pwa-v26";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./questions.json",
  "./questions.js",
  "./csts-questions.json",
  "./csts-questions.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./figures/A23.png",
  "./figures/B23.png",
  "./figures/C23.png",
  "./figures/C24.png",
  "./figures/C31.png",
  "./figures/C32.png",
  "./source-visuals/A14-execution-history.png",
  "./source-visuals/A21-final-grade.png",
  "./source-visuals/A22-decision-table.png",
  "./source-visuals/B22-artery-table.png",
  "./source-visuals/B31-project-effort.png",
  "./source-visuals/B32-test-priority.png",
  "./source-visuals/B38-sort-log.png",
  "./source-visuals/C22-driving-table.png",
  "./source-visuals/D22-classification-table.png",
  "./source-visuals/D23-hotel-transition.png",
  "./source-visuals/D32-traceability.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate" || event.request.url.endsWith("/index.html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});
