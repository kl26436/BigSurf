/**
 * Firebase Cloud Functions for Big Surf Workout Tracker
 * Handles scheduled push notifications for rest timers on iOS
 * Includes reverse geocoding for location city/state display
 * Includes Withings API integration for body weight sync
 *
 * Uses Web Push API directly (more reliable on iOS Safari than FCM)
 */

const functions = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const webpush = require('web-push');
const https = require('https');

// Withings API secrets (stored via: firebase functions:secrets:set)
const withingsClientId = defineSecret('WITHINGS_CLIENT_ID');
const withingsClientSecret = defineSecret('WITHINGS_CLIENT_SECRET');

// AI Coach secret (stored via: firebase functions:secrets:set ANTHROPIC_API_KEY)
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

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

// ============================================================================
// REVERSE GEOCODING (Location City/State lookup)
// ============================================================================

/**
 * Forward geocode an address to get coordinates
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * Called from client to bypass CORS restrictions
 */
exports.geocodeAddress = functions.https.onCall(async (data, context) => {
    const { query } = data;

    if (!query) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing query');
    }

    return new Promise((resolve, reject) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;

        const options = {
            headers: {
                'User-Agent': 'BigSurf-Workout-Tracker/1.0 (https://bigsurf.fit)'
            }
        };

        https.get(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    resolve({ results: results });
                } catch (error) {
                    console.error('❌ Error parsing geocode response:', error);
                    resolve({ results: [] });
                }
            });
        }).on('error', (error) => {
            console.error('❌ Error calling Nominatim:', error);
            resolve({ results: [] });
        });
    });
});

/**
 * Reverse geocode coordinates to get city and state
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * Called from client to bypass CORS restrictions
 */
exports.reverseGeocode = functions.https.onCall(async (data, context) => {
    // Authentication optional for this read-only endpoint
    const { latitude, longitude } = data;

    if (!latitude || !longitude) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing latitude or longitude');
    }

    return new Promise((resolve, reject) => {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`;

        const options = {
            headers: {
                'User-Agent': 'BigSurf-Workout-Tracker/1.0 (https://bigsurf.fit)'
            }
        };

        https.get(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const address = json.address || {};

                    // Extract city (try multiple fields)
                    const city = address.city || address.town || address.village ||
                                 address.municipality || address.suburb || null;

                    // Extract state
                    const state = address.state || address.region || null;

                    resolve({
                        city: city,
                        state: state,
                        formatted: city && state ? `${city}, ${state}` : (city || state || null)
                    });
                } catch (error) {
                    console.error('❌ Error parsing geocode response:', error);
                    resolve({ city: null, state: null, formatted: null });
                }
            });
        }).on('error', (error) => {
            console.error('❌ Error calling Nominatim:', error);
            resolve({ city: null, state: null, formatted: null });
        });
    });
});

// ============================================================================
// WITHINGS API INTEGRATION (Body Weight Sync)
// ============================================================================

/**
 * Helper: make an HTTPS POST request with form-encoded body.
 */
function httpsPost(hostname, path, params) {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams(params).toString();
        const options = {
            hostname,
            port: 443,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Failed to parse Withings response: ' + data));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Generate the Withings OAuth authorization URL.
 * Frontend calls this, then redirects the user to the returned URL.
 */
exports.withingsGetAuthUrl = functions.runWith({ secrets: [withingsClientId] })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { callbackUrl } = data;
        if (!callbackUrl) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing callbackUrl');
        }

        const clientId = withingsClientId.value().trim();
        const state = context.auth.uid; // Use UID as state for verification

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: callbackUrl,
            scope: 'user.metrics',
            state: state,
        });

        const url = `https://account.withings.com/oauth2_user/authorize2?${params.toString()}`;
        return { url };
    });

/**
 * Exchange the OAuth authorization code for access/refresh tokens.
 * Called by frontend after Withings redirects back with a code.
 */
exports.withingsExchangeToken = functions.runWith({ secrets: [withingsClientId, withingsClientSecret] })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { code, callbackUrl } = data;
        if (!code || !callbackUrl) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing code or callbackUrl');
        }

        const clientId = withingsClientId.value().trim().trim();
        const clientSecret = withingsClientSecret.value().trim().trim();
        const userId = context.auth.uid;

        console.log(`🔑 Client ID: length=${clientId.length}, ends=${clientId.slice(-4)}`);
        console.log(`🔗 Redirect URI: ${callbackUrl}`);

        try {
            const result = await httpsPost('wbsapi.withings.net', '/v2/oauth2', {
                action: 'requesttoken',
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: callbackUrl,
            });

            if (result.status !== 0) {
                console.error('❌ Withings token exchange failed:', result);
                throw new functions.https.HttpsError('internal', `Withings error: ${result.error || result.status}`);
            }

            const tokens = result.body;

            // Store tokens securely in Firestore
            await db.collection('users').doc(userId).collection('integrations').doc('withings').set({
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + (tokens.expires_in * 1000),
                withingsUserId: tokens.userid,
                scope: tokens.scope,
                connectedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastSync: null,
            });

            console.log(`✅ Withings connected for user ${userId}`);
            return { success: true, withingsUserId: tokens.userid };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            console.error('❌ Withings token exchange error:', error);
            throw new functions.https.HttpsError('internal', 'Token exchange failed');
        }
    });

/**
 * Refresh an expired Withings access token.
 */
async function refreshWithingsToken(userId) {
    const clientId = withingsClientId.value().trim();
    const clientSecret = withingsClientSecret.value().trim();

    const integrationDoc = await db.collection('users').doc(userId)
        .collection('integrations').doc('withings').get();

    if (!integrationDoc.exists) {
        throw new Error('Withings not connected');
    }

    const { refreshToken } = integrationDoc.data();

    const result = await httpsPost('wbsapi.withings.net', '/v2/oauth2', {
        action: 'requesttoken',
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    if (result.status !== 0) {
        // Token is invalid — user needs to re-authorize
        await db.collection('users').doc(userId)
            .collection('integrations').doc('withings')
            .update({ status: 'expired' });
        throw new Error('Withings refresh token expired — re-authorization needed');
    }

    const tokens = result.body;

    await db.collection('users').doc(userId)
        .collection('integrations').doc('withings')
        .update({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000),
        });

    return tokens.access_token;
}

/**
 * Fetch weight measurements from Withings and store in Firestore.
 * Called by frontend or scheduled function.
 */
exports.withingsSyncWeight = functions.runWith({ secrets: [withingsClientId, withingsClientSecret] })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;

        try {
            // Get stored tokens
            const integrationDoc = await db.collection('users').doc(userId)
                .collection('integrations').doc('withings').get();

            if (!integrationDoc.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Withings not connected');
            }

            let { accessToken, expiresAt } = integrationDoc.data();

            // Refresh token if expired
            if (Date.now() >= expiresAt) {
                accessToken = await refreshWithingsToken(userId);
            }

            // Fetch measurements from Withings
            // meastypes: 1=weight(kg), 6=body fat(%), 8=fat mass(kg),
            //            76=muscle mass(kg), 77=hydration(kg), 88=bone mass(kg)
            // Height (type 4) is pulled separately below with no date filter —
            // users typically set height once during initial device setup, often
            // years before the 30-day sync window.
            const sinceDays = (data && data.days) || 30;
            const startDate = Math.floor((Date.now() - sinceDays * 86400000) / 1000);

            const result = await httpsPost('wbsapi.withings.net', '/measure', {
                action: 'getmeas',
                access_token: accessToken,
                meastypes: '1,6,8,76,77,88',
                category: '1', // Real measurements only (not goals)
                startdate: startDate.toString(),
                enddate: Math.floor(Date.now() / 1000).toString(),
            });

            // Separate unbounded request for height so we capture profile values
            // set at device setup years ago.
            let latestHeightCm = null;
            let latestHeightTs = 0;
            try {
                const heightResult = await httpsPost('wbsapi.withings.net', '/measure', {
                    action: 'getmeas',
                    access_token: accessToken,
                    meastypes: '4',
                    category: '1',
                });
                if (heightResult.status === 0) {
                    const groups = heightResult.body?.measuregrps || [];
                    for (const group of groups) {
                        for (const measure of group.measures) {
                            if (measure.type !== 4) continue;
                            const value = measure.value * Math.pow(10, measure.unit);
                            const cm = Math.round(value * 100 * 10) / 10;
                            if (cm > 0 && group.date > latestHeightTs) {
                                latestHeightCm = cm;
                                latestHeightTs = group.date;
                            }
                        }
                    }
                } else {
                    console.warn('Withings height lookup returned status', heightResult.status);
                }
            } catch (e) {
                console.warn('Withings height lookup failed:', e.message);
            }

            if (result.status !== 0) {
                if (result.status === 401) {
                    // Token expired during request — try refresh
                    accessToken = await refreshWithingsToken(userId);
                    // Retry not implemented here — user can sync again
                }
                throw new functions.https.HttpsError('internal', `Withings API error: status ${result.status}`);
            }

            const measureGroups = result.body?.measuregrps || [];
            let saved = 0;

            for (const group of measureGroups) {
                const date = new Date(group.date * 1000);
                const dateStr = date.toISOString().split('T')[0];
                const timestamp = date.toISOString();

                let weight = null;
                let bodyFat = null;
                let fatMassKg = null;
                let muscleMassKg = null;
                let hydrationKg = null;
                let boneMassKg = null;

                for (const measure of group.measures) {
                    const value = measure.value * Math.pow(10, measure.unit);
                    if (measure.type === 1)  weight = Math.round(value * 100) / 100; // kg
                    if (measure.type === 6)  bodyFat = Math.round(value * 10) / 10; // %
                    if (measure.type === 8)  fatMassKg = Math.round(value * 100) / 100; // kg
                    if (measure.type === 76) muscleMassKg = Math.round(value * 100) / 100; // kg
                    if (measure.type === 77) hydrationKg = Math.round(value * 100) / 100; // kg
                    if (measure.type === 88) boneMassKg = Math.round(value * 100) / 100; // kg
                    // Height (type 4) captured by the separate unbounded request above.
                }

                if (weight) {
                    const docId = `withings_${dateStr}_${group.grpid}`;
                    await db.collection('users').doc(userId).collection('measurements').doc(docId).set({
                        date: dateStr,
                        weight: weight,
                        unit: 'kg', // Withings always returns kg
                        bodyFat: bodyFat,
                        fatMass: fatMassKg,
                        muscleMass: muscleMassKg,
                        hydration: hydrationKg,
                        boneMass: boneMassKg,
                        notes: 'Withings',
                        measurements: null,
                        timestamp: timestamp,
                        source: 'withings',
                        withingsGrpId: group.grpid,
                    }, { merge: true }); // merge to avoid overwriting edits
                    saved++;
                }
            }

            // Write height to preferences/settings only if the user hasn't set
            // one themselves — avoids stomping on a manually-entered value.
            if (latestHeightCm != null) {
                const settingsRef = db.collection('users').doc(userId)
                    .collection('preferences').doc('settings');
                const settingsSnap = await settingsRef.get();
                const existing = settingsSnap.exists ? settingsSnap.data() : {};
                if (existing.profileHeightCm == null) {
                    await settingsRef.set(
                        { profileHeightCm: latestHeightCm },
                        { merge: true }
                    );
                }
            }

            // Update last sync time
            await db.collection('users').doc(userId)
                .collection('integrations').doc('withings')
                .update({ lastSync: admin.firestore.FieldValue.serverTimestamp() });

            console.log(`✅ Synced ${saved} Withings measurements for user ${userId}`);
            return { success: true, synced: saved };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            console.error('❌ Withings sync error:', error);
            throw new functions.https.HttpsError('internal', error.message || 'Sync failed');
        }
    });

/**
 * Check Withings connection status for a user.
 */
exports.withingsStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const doc = await db.collection('users').doc(userId)
        .collection('integrations').doc('withings').get();

    if (!doc.exists) {
        return { connected: false };
    }

    const { connectedAt, lastSync, status, expiresAt } = doc.data();
    return {
        connected: status !== 'expired',
        expired: status === 'expired',
        connectedAt: connectedAt?.toDate?.()?.toISOString() || null,
        lastSync: lastSync?.toDate?.()?.toISOString() || null,
        tokenExpired: Date.now() >= expiresAt,
    };
});

/**
 * Disconnect Withings integration — removes stored tokens.
 */
exports.withingsDisconnect = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    await db.collection('users').doc(userId)
        .collection('integrations').doc('withings').delete();

    console.log(`✅ Withings disconnected for user ${userId}`);
    return { success: true };
});

/**
 * Test endpoint: verify Withings secrets are configured correctly.
 * Does NOT expose the secret values — just confirms they're set.
 */
exports.withingsTestConfig = functions.runWith({ secrets: [withingsClientId, withingsClientSecret] })
    .https.onCall(async (data, context) => {
        const hasClientId = !!withingsClientId.value().trim();
        const hasClientSecret = !!withingsClientSecret.value().trim();
        const clientIdPrefix = hasClientId ? withingsClientId.value().trim().substring(0, 6) + '...' : 'NOT SET';

        return {
            configured: hasClientId && hasClientSecret,
            clientIdPrefix,
            hasClientSecret,
        };
    });

// ============================================================================
// AI TRAINING COACH (Phase 17 — Claude API integration)
// ============================================================================

const TRAINING_SCIENCE_PROMPT = `You are an expert strength and conditioning coach integrated into the Big Surf workout tracker app. You analyze training data and provide actionable recommendations.

Key principles you follow:
- Progressive overload is the primary driver of strength and hypertrophy
- Volume landmarks: MEV ~6-8 sets/muscle/week, MRV ~15-25 sets/muscle/week
- Most people grow optimally at 10-20 hard sets per muscle group per week
- Training frequency of 2-3x per muscle group per week is optimal for most
- Deload every 4-6 weeks of hard training (reduce volume 40-50%)
- Prioritize compound movements, supplement with isolation
- When plateau detected, suggest: increase reps, add a set, microload, change variation

Always be specific: name exercises, give exact set/rep/weight targets based on their recent numbers.
Keep recommendations concise and actionable — these are read on a phone at the gym.
Format as short bullet points, not paragraphs.`;

const WORKOUT_BUILDER_PROMPT = `You are an expert strength and conditioning coach. You build workout templates for the Big Surf workout tracker app.

You will be given the user's exercise library and training history. Generate a workout template as a JSON object.

RULES:
- Prefer exercises from the user's library when they match the focus. Use the exact name from their library.
- You may suggest exercises NOT in the library if they fill a gap. For any exercise not in the user's library, add an "alternatives" array with 2 substitutions the user could do instead.
- Exercises from the user's library should NOT have an "alternatives" field.
- Each exercise needs: name, bodyPart, equipmentType, sets (number), reps (number), weight (number in user's unit or 0 if unknown).
- Use the user's recent weights as a baseline for weight suggestions. If no history exists, use 0.
- Order exercises: compound movements first, isolation last.
- Total exercises: 5-8 per workout.
- Include a mix of compound and isolation work appropriate for the focus.

RESPOND WITH ONLY VALID JSON matching this schema — no markdown, no explanation, no code fences:
{
  "name": "Workout Name",
  "category": "push|pull|legs|cardio|other",
  "exercises": [
    {
      "name": "Exercise Name",
      "bodyPart": "Chest|Back|Legs|Shoulders|Arms|Core",
      "equipmentType": "Machine|Dumbbell|Barbell|Cable|Bodyweight",
      "sets": 4,
      "reps": 10,
      "weight": 135,
      "fromLibrary": true
    },
    {
      "name": "New Exercise",
      "bodyPart": "Chest",
      "equipmentType": "Cable",
      "sets": 3,
      "reps": 12,
      "weight": 0,
      "fromLibrary": false,
      "alternatives": ["Library Exercise A", "Library Exercise B"]
    }
  ]
}`;

/**
 * AI Coach — on-demand training analysis using Claude API.
 * Rate limited to 1 call per 24 hours per user.
 *
 * Request data:
 * - question: string — the user's question
 * - context: string — compact training summary built client-side
 */
exports.getTrainingRecommendation = functions.runWith({
    secrets: [anthropicApiKey],
    timeoutSeconds: 60,
    memory: '256MB',
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { question, context: trainingContext } = data;

    if (!question) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing question');
    }

    // Rate limiting: disabled for testing (was 1 call per 24 hours)
    // TODO: Re-enable before production
    // const lastCallDoc = await db.collection('users').doc(userId)
    //     .collection('preferences').doc('coachRateLimit').get();
    // if (lastCallDoc.exists) {
    //     const lastCall = lastCallDoc.data().timestamp;
    //     const hoursSince = (Date.now() - lastCall) / (1000 * 60 * 60);
    //     if (hoursSince < 24) {
    //         throw new functions.https.HttpsError('resource-exhausted', 'Coach is available once per day.');
    //     }
    // }

    try {
        const apiKey = anthropicApiKey.value();
        if (!apiKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'ANTHROPIC_API_KEY not configured. Run: firebase functions:secrets:set ANTHROPIC_API_KEY'
            );
        }

        // Call Claude API via HTTPS (no SDK dependency needed).
        // Opus 4.7 + adaptive thinking: coaching benefits from deeper reasoning
        // when interpreting plateaus, volume patterns, and tradeoffs. max_tokens
        // raised to accommodate thinking tokens + full recommendation.
        const requestBody = JSON.stringify({
            model: 'claude-opus-4-7',
            max_tokens: 8000,
            thinking: { type: 'adaptive' },
            system: TRAINING_SCIENCE_PROMPT,
            messages: [{
                role: 'user',
                content: `Here is my training data:\n\n${trainingContext || 'No data provided.'}\n\n${question}`,
            }],
        });

        const response = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(requestBody),
                },
            }, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (res.statusCode === 200) {
                            resolve(parsed);
                        } else {
                            console.error('❌ Claude API error:', res.statusCode, body);
                            reject(new Error(`Claude API error: ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse Claude API response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });

        // Find the text block. With adaptive thinking, content[0] may be a
        // thinking block — we want the user-visible text, not the reasoning.
        const recommendation = response.content?.find(b => b.type === 'text')?.text
            || 'No recommendation generated.';

        // Update rate limit timestamp
        await db.collection('users').doc(userId)
            .collection('preferences').doc('coachRateLimit')
            .set({ timestamp: Date.now() });

        // Save coach response to history
        await db.collection('users').doc(userId)
            .collection('coachHistory').add({
                question,
                response: recommendation,
                timestamp: new Date().toISOString(),
                usage: {
                    inputTokens: response.usage?.input_tokens || 0,
                    outputTokens: response.usage?.output_tokens || 0,
                },
            });

        console.log(`✅ AI Coach response for user ${userId} (${response.usage?.input_tokens || 0} in, ${response.usage?.output_tokens || 0} out)`);

        return { recommendation };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('❌ AI Coach error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get training recommendation');
    }
});

/**
 * Generate a structured workout template using Claude API.
 * Separate from getTrainingRecommendation — no shared rate limit.
 *
 * Request data:
 * - focus: string — workout focus (e.g. "Push", "Pull", "Legs", "Upper Body")
 * - exerciseLibrary: string — compact list of user's exercises
 * - trainingContext: string — recent training summary
 * - unit: string — "lbs" or "kg"
 */
exports.generateWorkoutTemplate = functions.runWith({
    secrets: [anthropicApiKey],
    timeoutSeconds: 60,
    memory: '256MB',
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { focus, exerciseLibrary, trainingContext, unit } = data;

    if (!focus) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing workout focus');
    }

    try {
        const apiKey = anthropicApiKey.value();
        if (!apiKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'ANTHROPIC_API_KEY not configured'
            );
        }

        const userMessage = `Generate a ${focus} workout template.

User's exercise library (prefer these):
${exerciseLibrary || 'No exercises in library yet.'}

Recent training data:
${trainingContext || 'No recent data.'}

Weight unit: ${unit || 'lbs'}

Build the workout now. Return ONLY the JSON object.`;

        const requestBody = JSON.stringify({
            model: 'claude-opus-4-7',
            max_tokens: 4000,
            system: WORKOUT_BUILDER_PROMPT,
            messages: [{
                role: 'user',
                content: userMessage,
            }],
        });

        const response = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(requestBody),
                },
            }, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (res.statusCode === 200) {
                            resolve(parsed);
                        } else {
                            console.error('❌ Claude API error:', res.statusCode, body);
                            reject(new Error(`Claude API error: ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse Claude API response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });

        const rawText = response.content?.[0]?.text || '';

        // Parse the JSON response — strip any markdown fences if present
        let template;
        try {
            const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            template = JSON.parse(cleaned);
        } catch (e) {
            console.error('❌ Failed to parse template JSON:', rawText);
            throw new functions.https.HttpsError('internal', 'AI returned invalid template format');
        }

        // Validate basic structure
        if (!template.name || !template.exercises || !Array.isArray(template.exercises)) {
            throw new functions.https.HttpsError('internal', 'AI returned incomplete template');
        }

        console.log(`✅ Generated template "${template.name}" with ${template.exercises.length} exercises for user ${userId}`);

        return { template };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('❌ Template generation error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to generate workout template');
    }
});

// ============================================================================
// DEXA SCAN EXTRACTION (Phase 18 — PDF upload + AI extraction)
// ============================================================================

const DEXA_EXTRACTION_PROMPT = `You are a medical data extraction specialist. You extract structured body composition data from DEXA (Dual-Energy X-ray Absorptiometry) scan reports.

Given a DEXA scan PDF, extract ALL available data into a JSON object. Different providers (Bodyspec, DexaFit, Hologic, GE Lunar) use different layouts — adapt accordingly.

Return ONLY a valid JSON object with this structure:
{
  "date": "YYYY-MM-DD",
  "provider": "provider name or null",
  "totalBodyFat": number (percentage, e.g. 18.5),
  "regionFat": {
    "leftArm": number or null,
    "rightArm": number or null,
    "leftLeg": number or null,
    "rightLeg": number or null,
    "trunk": number or null
  },
  "leanMass": {
    "leftArm": number or null (in lbs),
    "rightArm": number or null,
    "leftLeg": number or null,
    "rightLeg": number or null,
    "trunk": number or null
  },
  "fatMass": {
    "leftArm": number or null (in lbs),
    "rightArm": number or null,
    "leftLeg": number or null,
    "rightLeg": number or null,
    "trunk": number or null
  },
  "massUnit": "lbs" or "kg",
  "boneDensity": {
    "tScore": number or null,
    "zScore": number or null
  },
  "vat": number or null (visceral adipose tissue in lbs/kg),
  "totalWeight": number or null (total body weight at scan),
  "totalLeanMass": number or null (total lean mass),
  "totalFatMass": number or null (total fat mass),
  "confidence": {
    "totalBodyFat": 0.0-1.0,
    "regionFat": 0.0-1.0,
    "leanMass": 0.0-1.0,
    "fatMass": 0.0-1.0,
    "boneDensity": 0.0-1.0,
    "vat": 0.0-1.0,
    "totalWeight": 0.0-1.0
  }
}

Rules:
- If a value is not found in the report, use null and set confidence to 0.0
- If values are in grams, convert to lbs or kg (match whatever unit the report uses)
- Regional fat percentages should be the body fat % for that specific region
- The confidence score reflects how certain you are the extracted value is correct
- RESPOND WITH ONLY VALID JSON — no markdown fences, no explanation`;

exports.extractDexaData = functions.runWith({
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: '1GB',
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { pdfBase64, fileName } = data;

    if (!pdfBase64) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing PDF data');
    }

    // Reject files > 10 MB (base64 is ~33% larger than raw)
    const estimatedSize = (pdfBase64.length * 3) / 4;
    if (estimatedSize > 10 * 1024 * 1024) {
        throw new functions.https.HttpsError('invalid-argument', 'File too large. Maximum 10 MB.');
    }

    // Rate limiting: disabled for testing (was 5 extractions per day)
    // TODO: Re-enable before production
    // const rateLimitDoc = await db.collection('users').doc(userId)
    //     .collection('preferences').doc('dexaRateLimit').get();
    // if (rateLimitDoc.exists) {
    //     const { timestamp, count } = rateLimitDoc.data();
    //     const hoursSince = (Date.now() - timestamp) / (1000 * 60 * 60);
    //     if (hoursSince < 24 && count >= 5) {
    //         throw new functions.https.HttpsError('resource-exhausted', 'DEXA extraction limit reached.');
    //     }
    // }

    try {
        const apiKey = anthropicApiKey.value();
        if (!apiKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'ANTHROPIC_API_KEY not configured. Run: firebase functions:secrets:set ANTHROPIC_API_KEY'
            );
        }

        // Call Claude API with PDF document
        const requestBody = JSON.stringify({
            model: 'claude-opus-4-7',
            max_tokens: 4000,
            system: DEXA_EXTRACTION_PROMPT,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'document',
                        source: {
                            type: 'base64',
                            media_type: 'application/pdf',
                            data: pdfBase64,
                        },
                    },
                    {
                        type: 'text',
                        text: `Extract all DEXA scan data from this report${fileName ? ` (${fileName})` : ''}. Return ONLY the JSON object.`,
                    },
                ],
            }],
        });

        const response = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'pdfs-2024-09-25',
                    'Content-Length': Buffer.byteLength(requestBody),
                },
            }, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (res.statusCode === 200) {
                            resolve(parsed);
                        } else {
                            console.error(`❌ Claude API error ${res.statusCode}:`, body);
                            reject(new Error(`Claude API error: ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse Claude API response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });

        const rawText = response.content?.[0]?.text || '';

        // Parse the JSON response — strip any markdown fences if present
        let extractedData;
        try {
            const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            extractedData = JSON.parse(cleaned);
        } catch (e) {
            console.error('❌ Failed to parse DEXA extraction JSON:', rawText);
            throw new functions.https.HttpsError('internal', 'AI could not extract data from this PDF. Try manual entry.');
        }

        // Validate minimum required field
        if (extractedData.totalBodyFat === undefined || extractedData.totalBodyFat === null) {
            console.warn('⚠️ DEXA extraction missing totalBodyFat, returning partial data');
        }

        // Rate limit counter: disabled for testing
        // TODO: Re-enable before production
        // const currentData = rateLimitDoc.exists ? rateLimitDoc.data() : {};
        // const hoursSinceLastCall = currentData.timestamp
        //     ? (Date.now() - currentData.timestamp) / (1000 * 60 * 60) : 999;
        // await db.collection('users').doc(userId)
        //     .collection('preferences').doc('dexaRateLimit')
        //     .set({ timestamp: Date.now(), count: hoursSinceLastCall < 24 ? (currentData.count || 0) + 1 : 1 });

        console.log(`✅ DEXA scan extracted for user ${userId}: ${extractedData.totalBodyFat}% body fat`);

        return {
            extractedData,
            usage: {
                inputTokens: response.usage?.input_tokens || 0,
                outputTokens: response.usage?.output_tokens || 0,
            },
        };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('❌ DEXA extraction error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to extract DEXA scan data');
    }
});
