const CACHE_NAME = 'bassma-clinic-cache-v10';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
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
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Never intercept API calls or external proxy domains
  if (
    url.includes('telegram.org') || 
    url.includes('supabase.co') || 
    url.includes('allorigins.win') || 
    url.includes('corsproxy.io') ||
    url.includes('codetabs.com')
  ) {
    return;
  }

  const isLocalAsset = url.startsWith(self.location.origin);
  const isGoogleFont = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

  if (!isLocalAsset && !isGoogleFont) {
    return;
  }

  // Stale-While-Revalidate Strategy for all local assets & fonts
  // Fast loading from cache, silent update in the background
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
        console.warn('[SW] Fetch failed (offline):', err);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
