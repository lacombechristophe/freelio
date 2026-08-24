const VERSION = "crm-field-v1"
const STATIC_CACHE = `${VERSION}-static`
const FIELD_CACHE = `${VERSION}-field`
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/terrain-offline", "/crm-icon-192.png", "/crm-icon-512.png"])).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("crm-field-") && ![STATIC_CACHE, FIELD_CACHE].includes(key)).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_FIELD_RESOURCES" && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((value) => typeof value === "string" && new URL(value, self.location.origin).origin === self.location.origin)
    event.waitUntil((async () => {
      let cached = 0
      try {
        const fieldCache = await caches.open(FIELD_CACHE)
        const staticCache = await caches.open(STATIC_CACHE)
        for (const url of urls) {
          try {
            const response = await fetch(url, { credentials: "include" })
            if (response.ok) {
              const path = new URL(url, self.location.origin).pathname
              const cache = path.startsWith("/_next/static/") || path.startsWith("/fonts/") || path.startsWith("/crm-icon-") || path === "/terrain-offline" ? staticCache : fieldCache
              const offlineHtml = path === "/terrain-offline" ? await response.clone().text() : null
              await cache.put(url, response)
              cached += 1
              if (offlineHtml) {
                const assetPaths = [...offlineHtml.matchAll(/(?:src|href)="([^"?]*\/_next\/static\/[^"?]+)"/g)].map((match) => match[1])
                for (const assetPath of [...new Set(assetPaths)]) {
                  try {
                    const assetUrl = new URL(assetPath, self.location.origin).toString()
                    const assetResponse = await fetch(assetUrl, { credentials: "include" })
                    if (assetResponse.ok) {
                      await staticCache.put(assetUrl, assetResponse)
                      cached += 1
                    }
                  } catch {
                    // A failed asset keeps the activation incomplete and will be retried.
                  }
                }
              }
            }
          } catch {
            // The client reports the cache result and can retry later.
          }
        }
        event.ports?.[0]?.postMessage({ ok: true, cached })
      } catch {
        event.ports?.[0]?.postMessage({ ok: false, cached })
      }
    })())
  }
  if (event.data?.type === "CLEAR_FIELD_CACHE") {
    event.waitUntil(caches.delete(FIELD_CACHE))
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/crm-icon-")) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    }))
    return
  }

  if (request.mode === "navigate" && url.pathname === "/dashboard/terrain") {
    event.respondWith(fetch(request).catch(async () => (await caches.open(STATIC_CACHE)).match("/terrain-offline") || (await caches.open(STATIC_CACHE)).match(OFFLINE_URL)))
  }
})
