/**
 * Firebase Cloud Functions for Big Surf Workout Tracker
 * Handles scheduled push notifications for rest timers on iOS
 *
 * Uses Web Push API directly (more reliable on iOS Safari than FCM)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

const db = admin.firestore();

// VAPID keys for Web Push (generated using web-push library)
// Public key is also in push-notification-manager.js on client
const VAPID_PUBLIC_KEY = 'BCCpd5gMslosl6OBbQe5mSwa6YWG2AK8q7pNKAm2MdSIUR41iWFKsUarOxbb4NathzspJ9XdbvYtPTexZxNdrxs';
const VAPID_PRIVATE_KEY = '746jLd3ZPl3qo_vgHFzSkHkkuPCmyqoyi07qhZ6CEkk';

// Configure web-push
webpush.setVapidDetails(
    'mailto:support@bigsurf.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

/**
 * Schedule a push notification for rest timer
 * Called when user starts a rest timer - schedules notification to be sent after delay
 *
 * Request body:
 * - subscription: object - Web Push subscription object
 * - delaySeconds: number - How many seconds until notification should be sent
 * - exerciseName: string - Name of the exercise for the notification
 * - notificationId: string - Unique ID for this notification (for cancellation)
 */
exports.scheduleRestNotification = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscription, delaySeconds, exerciseName, notificationId } = data;
    const userId = context.auth.uid;

    if (!subscription || !delaySeconds || !notificationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Calculate when to send the notification
    const sendAt = Date.now() + (delaySeconds * 1000);

    // Store the scheduled notification in Firestore
    await db.collection('scheduled_notifications').doc(notificationId).set({
        userId: userId,
        subscription: subscription,
        sendAt: sendAt,
        exerciseName: exerciseName || 'your next set',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`📅 Scheduled notification ${notificationId} for ${new Date(sendAt).toISOString()}`);

    return { success: true, notificationId: notificationId, sendAt: sendAt };
});

/**
 * Cancel a scheduled notification
 * Called when user skips the rest timer or navigates away
 */
exports.cancelRestNotification = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { notificationId } = data;

    if (!notificationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing notificationId');
    }

    // Delete the scheduled notification
    await db.collection('scheduled_notifications').doc(notificationId).delete();

    return { success: true };
});

/**
 * Scheduled function that runs every minute to send due notifications
 * This is the core of the iOS background notification system
 */
exports.sendDueNotifications = functions.pubsub
    .schedule('every 1 minutes')
    .onRun(async (context) => {
        const now = Date.now();

        // Find all notifications that are due
        const dueNotifications = await db.collection('scheduled_notifications')
            .where('status', '==', 'pending')
            .where('sendAt', '<=', now)
            .get();

        if (dueNotifications.empty) {
            console.log('📭 No due notifications');
            return null;
        }

        console.log(`📬 Found ${dueNotifications.size} due notifications`);

        const sendPromises = [];
        const updatePromises = [];

        dueNotifications.forEach((doc) => {
            const notification = doc.data();

            // Prepare the push message payload
            const payload = JSON.stringify({
                title: 'Rest Complete!',
                body: `Time for ${notification.exerciseName}`,
                icon: '/BigSurf.png',
                badge: '/BigSurf.png',
                tag: 'rest-timer',
                data: {
                    type: 'rest-timer',
                    notificationId: doc.id
                }
            });

            // Send the notification using web-push
            sendPromises.push(
                webpush.sendNotification(notification.subscription, payload)
                    .then(() => {
                        console.log(`✅ Sent notification: ${doc.id}`);
                    })
                    .catch((error) => {
                        console.error(`❌ Failed to send notification ${doc.id}:`, error.message);
                        // If subscription is invalid, mark for cleanup
                        if (error.statusCode === 410 || error.statusCode === 404) {
                            console.log(`   Subscription expired or invalid, will clean up`);
                        }
                    })
            );

            // Mark as sent
            updatePromises.push(
                doc.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() })
            );
        });

        await Promise.all([...sendPromises, ...updatePromises]);

        // Clean up old notifications (older than 1 hour)
        const oneHourAgo = now - (60 * 60 * 1000);
        const oldNotifications = await db.collection('scheduled_notifications')
            .where('sendAt', '<', oneHourAgo)
            .get();

        const deletePromises = [];
        oldNotifications.forEach((doc) => {
            deletePromises.push(doc.ref.delete());
        });
        await Promise.all(deletePromises);

        return null;
    });

/**
 * HTTP endpoint for immediate notification (alternative to scheduled)
 * Can be used for testing or immediate notifications
 */
exports.sendImmediateNotification = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscription, title, body } = data;

    if (!subscription) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing subscription');
    }

    const payload = JSON.stringify({
        title: title || 'Big Surf',
        body: body || 'Notification',
        icon: '/BigSurf.png',
        badge: '/BigSurf.png',
        tag: 'bigsurf'
    });

    try {
        await webpush.sendNotification(subscription, payload);
        console.log('✅ Sent immediate notification');
        return { success: true };
    } catch (error) {
        console.error('❌ Failed to send immediate notification:', error.message);
        throw new functions.https.HttpsError('internal', 'Failed to send notification');
    }
});

/**
 * Store push subscription for a user
 * Called when user grants notification permission
 */
exports.savePushSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscription } = data;
    const userId = context.auth.uid;

    if (!subscription) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing subscription');
    }

    // Store/update the subscription
    await db.collection('users').doc(userId).collection('push_subscriptions').doc('current').set({
        subscription: subscription,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        platform: 'web'
    });

    console.log(`✅ Saved push subscription for user ${userId}`);

    return { success: true };
});

// ============================================================================
// NATIVE iOS PUSH NOTIFICATIONS (Capacitor/APNs)
// ============================================================================

/**
 * Save device token for native iOS push (APNs)
 * Called from Capacitor app when registering for push
 */
exports.saveDeviceToken = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { token, platform } = data;
    const userId = context.auth.uid;

    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing device token');
    }

    // Store the device token
    await db.collection('users').doc(userId).collection('device_tokens').doc('current').set({
        token: token,
        platform: platform || 'ios',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Saved device token for user ${userId} (${platform})`);

    return { success: true };
});

/**
 * Schedule a native iOS push notification
 * Uses Firebase Cloud Messaging to send to APNs
 */
exports.scheduleNativeNotification = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { delaySeconds, exerciseName, notificationId, platform } = data;
    const userId = context.auth.uid;

    if (!delaySeconds || !notificationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Get the user's device token
    const tokenDoc = await db.collection('users').doc(userId)
        .collection('device_tokens').doc('current').get();

    if (!tokenDoc.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'No device token found');
    }

    const { token } = tokenDoc.data();

    // Calculate when to send
    const sendAt = Date.now() + (delaySeconds * 1000);

    // Store scheduled notification
    await db.collection('scheduled_notifications').doc(notificationId).set({
        userId: userId,
        deviceToken: token,
        platform: platform || 'ios',
        sendAt: sendAt,
        exerciseName: exerciseName || 'your next set',
        status: 'pending',
        type: 'native',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`📅 Scheduled native notification ${notificationId}`);

    return { success: true, notificationId: notificationId, sendAt: sendAt };
});

/**
 * Modified sendDueNotifications to handle both web push and native iOS
 */
exports.sendDueNativeNotifications = functions.pubsub
    .schedule('every 1 minutes')
    .onRun(async (context) => {
        const now = Date.now();

        // Find native notifications that are due
        const dueNotifications = await db.collection('scheduled_notifications')
            .where('status', '==', 'pending')
            .where('type', '==', 'native')
            .where('sendAt', '<=', now)
            .get();

        if (dueNotifications.empty) {
            return null;
        }

        console.log(`📬 Found ${dueNotifications.size} due native notifications`);

        const promises = [];

        dueNotifications.forEach((doc) => {
            const notification = doc.data();

            // Send via Firebase Cloud Messaging (works with APNs)
            const message = {
                token: notification.deviceToken,
                notification: {
                    title: 'Rest Complete! 💪',
                    body: `Time for ${notification.exerciseName}`
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                }
            };

            promises.push(
                admin.messaging().send(message)
                    .then(() => {
                        console.log(`✅ Sent native notification: ${doc.id}`);
                        return doc.ref.update({
                            status: 'sent',
                            sentAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    })
                    .catch((error) => {
                        console.error(`❌ Failed native notification ${doc.id}:`, error.message);
                        return doc.ref.update({ status: 'failed', error: error.message });
                    })
            );
        });

        await Promise.all(promises);
        return null;
    });
