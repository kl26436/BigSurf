/**
 * Push Notification Manager
 * Handles push notifications for iOS background/lock screen notifications
 *
 * Uses Web Push API directly (more reliable on iOS Safari than FCM)
 */

import { functions, auth, httpsCallable } from '../data/firebase-config.js';
import { AppState } from './app-state.js';
import { debugLog } from './config.js';

// Push subscription for this device
let pushSubscription = null;

// Active scheduled notification ID (for cancellation)
let activeNotificationId = null;

// Service worker registration
let swRegistration = null;

/**
 * VAPID public key for Web Push
 * Generated using web-push library
 */
const VAPID_PUBLIC_KEY = 'BCCpd5gMslosl6OBbQe5mSwa6YWG2AK8q7pNKAm2MdSIUR41iWFKsUarOxbb4NathzspJ9XdbvYtPTexZxNdrxs';

/**
 * Convert VAPID key from base64 to Uint8Array (required for Web Push API)
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Initialize push notifications using Web Push API
 * Should be called after user signs in and grants notification permission
 */
export async function initializeFCM() {
    debugLog('🔔 Initializing push notifications...');

    // Check if Push API is supported
    if (!('PushManager' in window)) {
        console.warn('⚠️ Push notifications not supported in this browser');
        return false;
    }

    try {
        // Use the main service worker (don't register a separate one)
        if ('serviceWorker' in navigator) {
            try {
                // Wait for the existing service worker to be ready
                swRegistration = await navigator.serviceWorker.ready;
                debugLog('✅ Service Worker is ready for push notifications');
            } catch (swError) {
                console.error('❌ Service Worker not available:', swError);
                return false;
            }
        } else {
            console.warn('⚠️ Service Workers not supported');
            return false;
        }

        // Check/request notification permission
        if (Notification.permission === 'denied') {
            console.warn('⚠️ Notification permission denied');
            return false;
        }

        if (Notification.permission !== 'granted') {
            debugLog('📋 Requesting notification permission...');
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('⚠️ Notification permission not granted');
                return false;
            }
            debugLog('✅ Notification permission granted');
        }

        // Subscribe to push notifications using Web Push API
        try {
            debugLog('📝 Subscribing to push notifications...');

            // Check for existing subscription
            pushSubscription = await swRegistration.pushManager.getSubscription();

            if (!pushSubscription) {
                // Create new subscription
                pushSubscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });
                debugLog('✅ New push subscription created');
            } else {
                debugLog('✅ Existing push subscription found');
            }

            // Convert subscription to JSON for sending to server
            const subscriptionJson = pushSubscription.toJSON();
            debugLog('✅ Push subscription endpoint:', subscriptionJson.endpoint?.substring(0, 50) + '...');

            // Save subscription to server
            await saveSubscriptionToServer(subscriptionJson);

            return true;
        } catch (subscribeError) {
            console.error('❌ Failed to subscribe to push:', subscribeError);

            // Log more details for debugging
            if (subscribeError.name === 'NotAllowedError') {
                console.error('   User denied permission or notification is blocked');
            } else if (subscribeError.name === 'AbortError') {
                console.error('   Subscription was aborted');
            }

            return false;
        }
    } catch (error) {
        console.error('❌ Error initializing push notifications:', error);
        return false;
    }
}

/**
 * Save push subscription to server for scheduled notifications
 */
async function saveSubscriptionToServer(subscription) {
    if (!auth.currentUser) return;

    try {
        const saveSubscription = httpsCallable(functions, 'savePushSubscription');
        await saveSubscription({ subscription });
        debugLog('✅ Push subscription saved to server');
    } catch (error) {
        console.error('❌ Error saving push subscription:', error);
    }
}

/**
 * Schedule a rest timer notification via Cloud Function
 * This will send a push notification even when app is backgrounded/locked
 *
 * @param {number} delaySeconds - Seconds until notification should be sent
 * @param {string} exerciseName - Name of the exercise for the notification
 * @returns {string|null} - Notification ID for cancellation, or null if failed
 */
export async function scheduleRestNotification(delaySeconds, exerciseName) {
    if (!pushSubscription || !auth.currentUser) {
        console.warn('⚠️ Cannot schedule notification: Push not initialized or user not signed in');
        console.warn('  pushSubscription:', pushSubscription ? 'present' : 'missing');
        console.warn('  auth.currentUser:', auth.currentUser ? 'present' : 'missing');
        return null;
    }

    // Cancel any existing scheduled notification
    await cancelRestNotification();

    try {
        debugLog('📅 Scheduling notification for', delaySeconds, 'seconds -', exerciseName);
        const scheduleNotification = httpsCallable(functions, 'scheduleRestNotification');

        const notificationId = `rest_${auth.currentUser.uid}_${Date.now()}`;

        // Send the full subscription object for Web Push
        const subscriptionJson = pushSubscription.toJSON();

        const result = await scheduleNotification({
            subscription: subscriptionJson,
            delaySeconds: delaySeconds,
            exerciseName: exerciseName,
            notificationId: notificationId,
        });
        debugLog('✅ Notification scheduled:', result.data);

        if (result.data.success) {
            activeNotificationId = notificationId;
            return notificationId;
        }

        return null;
    } catch (error) {
        console.error('❌ Error scheduling notification:', error);
        return null;
    }
}

/**
 * Cancel the active scheduled notification
 * Called when user skips rest timer or navigates away
 */
export async function cancelRestNotification() {
    if (!activeNotificationId || !auth.currentUser) {
        return;
    }

    try {
        const cancelNotification = httpsCallable(functions, 'cancelRestNotification');
        await cancelNotification({ notificationId: activeNotificationId });
        activeNotificationId = null;
    } catch (error) {
        console.error('❌ Error cancelling notification:', error);
    }
}

/**
 * Check if push notifications are available and initialized
 */
export function isFCMAvailable() {
    return !!pushSubscription;
}

/**
 * Get the current push subscription
 */
export function getPushSubscription() {
    return pushSubscription;
}

/**
 * Send an immediate test notification
 * Useful for testing the setup
 */
export async function sendTestNotification() {
    if (!pushSubscription || !auth.currentUser) {
        console.warn('⚠️ Cannot send test: Push not initialized');
        return false;
    }

    try {
        const sendImmediate = httpsCallable(functions, 'sendImmediateNotification');
        await sendImmediate({
            subscription: pushSubscription.toJSON(),
            title: 'Test Notification',
            body: 'Push notifications are working!',
        });
        return true;
    } catch (error) {
        console.error('❌ Error sending test notification:', error);
        return false;
    }
}
