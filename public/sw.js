const CACHE = "revserp-static-v2"
const CACHE_PREFIX = "revserp-"
const OFFLINE_URL = "/offline.html"
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/revserp-icon-192.png",
  "/icons/revserp-icon-512.png",
  "/icons/revserp-maskable-512.png",
  "/icons/apple-touch-icon.png",
]
const ASSET_DESTINATIONS = new Set(["font", "image", "script", "style"])

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL))
      )
    )
    return
  }

  if (!ASSET_DESTINATIONS.has(request.destination)) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone()).catch(() => {})
      }
      return response
    })
  )
})
