// Notification Helper - core/notification-helper.js
// Manages service worker notifications for background support

let serviceWorkerRegistration = null;

/**
 * Initialize notification system and service worker
 */
export async function initializeNotifications() {

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Workers not supported');
        return false;
    }

    try {
        // Register service worker if not already registered
        if (!navigator.serviceWorker.controller) {
            serviceWorkerRegistration = await navigator.serviceWorker.register('/service-worker.js');
        } else {
            serviceWorkerRegistration = await navigator.serviceWorker.ready;
        }

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
        }

        return true;
    } catch (error) {
        console.error('❌ Error initializing notifications:', error);
        return false;
    }
}

/**
 * Show immediate notification (works in foreground and background)
 */
export async function showNotification(title, body, options = {}) {
    const isSilent = options.silent !== undefined ? options.silent : false;

    // Build notification options (silent notifications can't vibrate)
    const notificationOptions = {
        body: body,
        icon: options.icon || '/BigSurf.png',
        badge: '/BigSurf.png',
        tag: options.tag || 'bigsurf',
        requireInteraction: options.requireInteraction || false,
        silent: isSilent,
        ...options
    };

    // Only add vibrate if not silent
    if (!isSilent) {
        notificationOptions.vibrate = options.vibrate || [200, 100, 200];
    }

    // Use service worker notification if available (works in background)
    if (serviceWorkerRegistration) {
        try {
            await serviceWorkerRegistration.showNotification(title, notificationOptions);
            return true;
        } catch (error) {
            console.error('❌ Service Worker notification failed:', error);
        }
    }

    // Fallback to regular notification (only works when app is open)
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, notificationOptions);
        return true;
    }

    console.warn('⚠️ Notifications not available');
    return false;
}

/**
 * Schedule a delayed notification via service worker
 * This will work even if the app is in the background or on lock screen
 */
export async function scheduleNotification(title, body, delay, options = {}) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        console.warn('⚠️ Service Worker not available for scheduled notification');
        return false;
    }

    try {
        navigator.serviceWorker.controller.postMessage({
            type: 'SCHEDULE_NOTIFICATION',
            title: title,
            body: body,
            delay: delay,
            tag: options.tag || 'bigsurf',
            silent: options.silent !== undefined ? options.silent : false
        });
        return true;
    } catch (error) {
        console.error('❌ Failed to schedule notification:', error);
        return false;
    }
}

/**
 * Check if notifications are supported and enabled
 */
export function areNotificationsEnabled() {
    return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Get service worker registration
 */
export function getServiceWorkerRegistration() {
    return serviceWorkerRegistration;
}
