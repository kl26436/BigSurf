// Big Surf Workout Tracker - Service Worker
// Provides basic offline functionality and faster loading

const CACHE_NAME = 'big-surf-v8.14-offline';
// Precache list — mirrors styles/index.css @import order. Add new CSS files here when
// they're added to index.css, otherwise the first-paint on install misses them (cache-first
// fetch will still pick them up on first navigation, but precaching avoids the blip).
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
  '/styles/components/active-pill.css',
  '/styles/components/range-filter.css',
  '/styles/components/metric-card.css',
  '/styles/components/charts.css',
  '/styles/components/bodyweight.css',
  '/styles/components/segmented-control.css',
  '/styles/components/chips.css',
  '/styles/components/grouped-rows.css',
  '/styles/components/page-header.css',
  '/styles/components/fields.css',
  '/styles/components/completion-summary.css',
  '/styles/components/toast.css',
  '/styles/components/shell-hud.css',
  '/styles/components/sheet.css',
  '/styles/components/library-tabs.css',
  '/styles/components/gym-card.css',
  '/styles/components/quick-add-sheet.css',
  '/styles/components/confirm-sheet.css',
  '/styles/components/compat-badge.css',
  '/styles/components/quick-edit-sheet.css',
  '/styles/pages/app-shell.css',
  '/styles/pages/active-workout-v2.css',
  '/styles/pages/templates.css',
  '/styles/pages/history.css',
  '/styles/pages/edit-history.css',
  '/styles/pages/dashboard-v2.css',
  '/styles/pages/detail-pages.css',
  '/styles/pages/exercise-lib.css',
  '/styles/pages/equipment-library.css',
  '/styles/pages/locations.css',
  '/styles/pages/manual-workout.css',
  '/styles/pages/settings.css',
  '/styles/pages/plate-calculator.css',
  '/styles/pages/body-measurements.css',
  '/styles/pages/ai-coach.css',
  '/styles/pages/dexa.css',
  '/styles/pages/error-log.css',
  '/styles/pages/metric-detail.css',
  '/styles/pages/block.css',
  '/styles/animations.css',
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

// Fetch strategy (offline support, launch blocker 11a):
//   • Firebase / Google API traffic (Firestore, Auth, Functions, the hosting
//     /__/ auth helper) is NOT intercepted. The Firestore SDK has its own
//     offline cache and needs real network errors to know it's offline — the
//     old handler answered failed API calls with a fake 200 JSON body.
//   • Versioned CDN files (Firebase SDK on gstatic, Font Awesome, Chart.js,
//     Leaflet) never change at a given URL → cache first. The old handler sent
//     the gstatic SDK modules down the "network first, fake JSON offline"
//     path, so the app couldn't boot without a connection.
//   • Our own JS and the page itself → network first; the cached copy only
//     when the network actually FAILS (offline). Deliberately no timeout: on
//     slow-but-live signal right after a deploy, a timeout would serve some
//     modules fresh and others from the old cache — version skew, the exact
//     breakage of the old 1-year cache (see CLAUDE.md "Deployment"). Slow
//     beats broken.
//   • Other same-origin assets (CSS, images) → cache first, refreshed in the
//     background (unchanged).
const PASSTHROUGH_HOSTS = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cloudfunctions.net',
  'run.app',
  'firebaseio.com',
  'googleapis.com',
  'apis.google.com',
  'accounts.google.com',
];

const IMMUTABLE_CDN_HOSTS = [
  'www.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
];

function hostMatches(hostname, list) {
  return list.some((h) => hostname === h || hostname.endsWith('.' + h));
}

function putInCache(request, response) {
  // `request` may be a URL string (the shared '/index.html' key).
  if (!response || !(response.ok || response.type === 'opaque')) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  putInCache(request, response);
  return response;
}

// cacheKey: where the copy lives — every navigation shares '/index.html'
// (it's a single-page app) instead of one entry per URL + query string.
async function networkFirst(request, cacheKey = request) {
  try {
    const response = await fetch(request);
    putInCache(cacheKey, response);
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // APIs and the Firebase auth helper go straight to the network.
  if (hostMatches(url.hostname, PASSTHROUGH_HOSTS)) return;
  if (sameOrigin && url.pathname.startsWith('/__/')) return;

  if (!sameOrigin) {
    if (hostMatches(url.hostname, IMMUTABLE_CDN_HOSTS)) event.respondWith(cacheFirst(request));
    return; // anything else cross-origin: browser default
  }

  // The app shell: any navigation is the single-page app's index.html.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  // Our modules: network first (fresh code), cache when offline / slow.
  if (url.pathname.endsWith('.js')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache first strategy for static assets (CSS, images, etc.)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const network = fetch(request).then((networkResponse) => {
        putInCache(request, networkResponse);
        return networkResponse;
      });
      if (cachedResponse) {
        network.catch(() => {}); // background refresh; offline is fine
        return cachedResponse;
      }
      return network;
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

// Notification click event - open or focus the app at the notification's
// target (data.url set by the sender, e.g. the weekly review deep link)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it and let the page route itself
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'notification-click', url: targetUrl });
            return client.focus();
          }
        }
        // Otherwise, open a new window at the deep link
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
