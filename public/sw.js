/* Success Management service worker: push notifications + offline fallback. */
const CACHE = "sm-v1"
const OFFLINE = "/offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/favicon-192.png"])).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

// Pages always come from the network (data is live); offline we show a friendly page.
self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET" || req.mode !== "navigate") return
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
})

self.addEventListener("push", (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: event.data ? event.data.text() : "Ny besked" } }
  const title = data.title || "Success Management"
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/favicon-192.png",
    badge: "/favicon-48.png",
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { href: data.href || "/" },
  }))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const href = new URL((event.notification.data && event.notification.data.href) || "/", self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin) && "focus" in c) { c.navigate(href); return c.focus() }
    return self.clients.openWindow(href)
  }))
})
