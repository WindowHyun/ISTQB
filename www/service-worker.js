const CACHE_NAME = "istqb-fl-v4-tablet-pwa-v34";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./data/index.json",
  "./data/istqb/sample-a.json",
  "./data/istqb/sample-b.json",
  "./data/istqb/sample-c.json",
  "./data/istqb/sample-d.json",
  "./data/istqb/sample-extra.json",
  "./data/csts/csts-2402-fl.json",
  "./data/csts/csts-2403-fl.json",
  "./data/csts/csts-2404-fl.json",
  "./data/csts/csts-2405-fl.json",
  "./data/csts/csts-2018-general.json",
  "./data/csts/csts-2019-general.json",
  "./data/csts/csts-example-answer-included.json",
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
  "./source-visuals/D32-traceability.png",
  "./csts-figures/2402FL-27.png",
  "./csts-figures/2402FL-27-2.png",
  "./csts-figures/2402FL-27-3.png",
  "./csts-figures/2402FL-27-4.png",
  "./csts-figures/2403FL-2.png",
  "./csts-figures/2403FL-11.png",
  "./csts-figures/2403FL-11-2.png",
  "./csts-figures/2403FL-11-3.png",
  "./csts-figures/2403FL-11-4.png",
  "./csts-figures/2403FL-60.png",
  "./csts-figures/2405FL-30.png",
  "./csts-figures/2405FL-30-2.png",
  "./csts-figures/2405FL-30-3.png",
  "./csts-figures/2405FL-30-4.png",
  "./csts-figures/SW-CSTS-7.png"
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
