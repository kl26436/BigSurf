// Big Surf Workout Tracker - Service Worker
// Provides basic offline functionality and faster loading

const CACHE_NAME = 'big-surf-v8.8-final-audit-cleanup';
const STATIC_ASSETS = [
  '/index.html',
  '/styles/index.css',
  '/styles/tokens.css',
  '/styles/reset.css',
  '/styles/components/cards.css',
  '/styles/components/buttons.css',
  '/styles/components/forms.css',
  '/styles/components/modals.css',
  '/styles/components/nav.css',
  '/styles/components/empty-states.css',
  '/styles/pages/app-shell.css',
  '/styles/pages/templates.css',
  '/styles/pages/history.css',
  '/styles/pages/stats.css',
  '/styles/pages/exercise-lib.css',
  '/styles/pages/settings.css',
  '/styles/pages/plate-calculator.css',
  '/styles/pages/body-measurements.css',
  '/styles/pages/ai-coach.css',
  '/styles/pages/dexa.css',
  '/styles/utilities.css',
  '/BigSurf.png',
  '/js/main.js',
  '/js/core/app-initialization.js',
  '/js/core/utils/app-state.js',
  '/js/core/workout/workout-core.js',
  '/js/core/ui/ui-helpers.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Service Worker: Installation failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) &&
      !event.request.url.includes('cdnjs.cloudflare.com') &&
      !event.request.url.includes('gstatic.com')) {
    return;
  }

  // Network first for Firebase API calls
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Return offline message for API calls
          return new Response(
            JSON.stringify({ error: 'offline', message: 'You are offline' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Network first for JavaScript files (always get fresh code)
  if (event.request.url.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Cache the fresh JS file
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache first strategy for static assets (CSS, images, etc.)
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update cache in background
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, networkResponse.clone()));
              }
            })
            .catch(() => {}); // Ignore fetch errors in background

          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache successful GET requests
            if (event.request.method === 'GET' &&
                networkResponse &&
                networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('❌ Fetch failed:', error);
            // Return offline page for HTML requests
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            throw error;
          });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Schedule a notification after a delay (for rest timer)
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, delay, tag, silent } = event.data;

    setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: '/BigSurf.png',
        badge: '/BigSurf.png',
        vibrate: [200, 100, 200],
        tag: tag || 'rest-timer',
        requireInteraction: false,
        silent: silent !== undefined ? silent : false
      });
    }, delay);
  }
});

// Push notification event - handle background push notifications
self.addEventListener('push', (event) => {

  let data = { title: 'Big Surf', body: 'Notification', icon: '/BigSurf.png' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/BigSurf.png',
    badge: '/BigSurf.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'bigsurf-notification',
    requireInteraction: data.requireInteraction || false,
    silent: data.silent !== undefined ? data.silent : false,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event - open or focus app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
