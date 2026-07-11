const CACHE_NAME = 'bassma-clinic-cache-v9';

self.addEventListener('install', (event) => {
  // Force activation immediately, don't wait for old SW to die
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all clients and delete every old cache version
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
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

  // Never intercept API calls
  if (url.includes('telegram.org') || url.includes('supabase.co') || url.includes('allorigins.win') || url.includes('corsproxy.io')) {
    return;
  }

  const isNavigationRequest = event.request.mode === 'navigate';
  const isLocalAsset = url.startsWith(self.location.origin);
  const isGoogleFont = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

  if (!isLocalAsset && !isGoogleFont) {
    return;
  }

  // NETWORK-FIRST for HTML navigation — always get fresh app shell
  if (isNavigationRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // STALE-WHILE-REVALIDATE for JS/CSS/font assets (fast load + background refresh)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn('[SW] Asset fetch failed (offline):', err);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
