const CACHE = "revserp-static-v1"
const ASSET_DESTINATIONS = new Set(["font", "image", "script", "style"])

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.mode === "navigate" ||
    !ASSET_DESTINATIONS.has(request.destination)
  )
    return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })
  )
})
