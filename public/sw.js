const CACHE_NAME = 'bassma-clinic-cache-v8';

self.addEventListener('install', (event) => {
  // Force activation immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim clients and clear old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Don't intercept Telegram API, Supabase API or database uploads
  if (url.includes('telegram.org') || url.includes('supabase.co')) {
    return;
  }

  // Intercept local assets and Google fonts
  const isLocalAsset = url.startsWith(self.location.origin);
  const isGoogleFont = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

  if (!isLocalAsset && !isGoogleFont) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Stale-While-Revalidate Strategy
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn("Asset fetch failed (offline):", err);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
