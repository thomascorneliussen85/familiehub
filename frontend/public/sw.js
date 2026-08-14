const CACHE_NAME = 'familiehub-shell-v1';
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Nettverk først (dashbordet trenger ferske data), med app-shell som fallback
// ved nettverksfeil ELLER en feilrespons (f.eks. 502 fra Render midt i en
// deploy, når gammel instans er stoppet og ny ikke er klar ennå) – uten dette
// ville en oppfrisking av siden i akkurat det vinduet vist Render sin rå
// feilside i stedet for appen som allerede lå i cache.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) return res;
        return caches.match(event.request).then((cached) => cached || res);
      })
      .catch(() => caches.match(event.request))
  );
});

// Push-varsler (f.eks. røykvarsler-alarm) – payloaden sendes som JSON fra
// backend (se services/pushService.js): { title, body, tag }.
self.addEventListener('push', (event) => {
  let data = { title: 'FamilieHub', body: 'Du har et nytt varsel.' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // ingen/ikke-JSON payload – bruk standardteksten over
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: data.tag,
      requireInteraction: data.tag === 'smoke-alarm',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
