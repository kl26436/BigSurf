/**
 * Capacitor Push Notifications
 * Handles native iOS push notifications when running in Capacitor
 *
 * This module only activates when running inside a Capacitor native app.
 * When running as a web app, it does nothing.
 */

import { auth, functions, httpsCallable } from '../data/firebase-config.js';

// Check if running in Capacitor
const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();

let PushNotifications = null;

/**
 * Initialize Capacitor push notifications
 * Only runs when in native Capacitor app
 */
export async function initializeCapacitorPush() {
    if (!isCapacitor) {
        console.log('📱 Not running in Capacitor, skipping native push setup');
        return false;
    }

    try {
        // Dynamically import Capacitor push notifications
        const { PushNotifications: PN } = await import('@capacitor/push-notifications');
        PushNotifications = PN;

        console.log('📱 Initializing Capacitor push notifications...');

        // Request permission
        const permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            const result = await PushNotifications.requestPermissions();
            if (result.receive !== 'granted') {
                console.warn('⚠️ Push notification permission not granted');
                return false;
            }
        } else if (permStatus.receive !== 'granted') {
            console.warn('⚠️ Push notification permission denied');
            return false;
        }

        // Register with APNs
        await PushNotifications.register();

        // Handle registration success
        PushNotifications.addListener('registration', async (token) => {
            console.log('✅ Push registration success, token:', token.value.substring(0, 20) + '...');

            // Save token to Firebase
            await saveDeviceToken(token.value);
        });

        // Handle registration error
        PushNotifications.addListener('registrationError', (error) => {
            console.error('❌ Push registration failed:', error.error);
        });

        // Handle push notification received while app is in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('📬 Push received (foreground):', notification);
            // The notification will be shown automatically based on presentationOptions
        });

        // Handle push notification action (user tapped notification)
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('🔔 Push notification tapped:', notification);
            // Could navigate to specific screen based on notification data
        });

        console.log('✅ Capacitor push notifications initialized');
        return true;
    } catch (error) {
        console.error('❌ Error initializing Capacitor push:', error);
        return false;
    }
}

/**
 * Save device token to Firebase for sending push notifications
 */
async function saveDeviceToken(token) {
    if (!auth.currentUser) {
        console.warn('⚠️ Cannot save device token: user not signed in');
        return;
    }

    try {
        const saveToken = httpsCallable(functions, 'saveDeviceToken');
        await saveToken({
            token: token,
            platform: 'ios',
        });
        console.log('✅ Device token saved to Firebase');
    } catch (error) {
        console.error('❌ Error saving device token:', error);
    }
}

/**
 * Schedule a push notification for rest timer (native)
 * Uses APNs through Firebase Cloud Functions
 */
export async function scheduleNativePush(delaySeconds, exerciseName) {
    if (!isCapacitor || !auth.currentUser) {
        return null;
    }

    try {
        const scheduleNotification = httpsCallable(functions, 'scheduleNativeNotification');
        const notificationId = `rest_${auth.currentUser.uid}_${Date.now()}`;

        const result = await scheduleNotification({
            delaySeconds: delaySeconds,
            exerciseName: exerciseName,
            notificationId: notificationId,
            platform: 'ios',
        });

        console.log('✅ Native push scheduled:', result.data);
        return notificationId;
    } catch (error) {
        console.error('❌ Error scheduling native push:', error);
        return null;
    }
}

/**
 * Check if running in Capacitor native app
 */
export function isNativeApp() {
    return isCapacitor;
}
