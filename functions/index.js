/**
 * Firebase Cloud Functions for Big Surf Workout Tracker
 * Handles scheduled push notifications for rest timers on iOS
 * Includes reverse geocoding for location city/state display
 * Includes Withings API integration for body weight sync
 *
 * Uses Web Push API directly (more reliable on iOS Safari than FCM)
 */

// v1 API is preserved under the /v1 subpath from firebase-functions v5+.
// All the exports below use v1 (functions.https.onCall, functions.pubsub,
// functions.runWith) so we import the v1 namespace explicitly rather than
// rewriting every handler to v2.
const functions = require('firebase-functions/v1');
// v2 is used ONLY for coachChatStream — v1 callables buffer the whole response
// and cannot stream. Mixing v1/v2 in one codebase is supported as long as
// function names differ.
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const webpush = require('web-push');
const https = require('https');
const {
    TOOL_DEFINITIONS, TOOL_STATUS, makeToolExecutors,
    validateProposal, liveToolDefinitions,
} = require('./coach-tools');
const { buildOutcomesContext } = require('./coach-outcomes');

// ── Model routing ────────────────────────────────────────────────────
// Coach chat + template building + DEXA extraction use the flagship model
// (quality is the product). High-volume/digest paths (weekly review) use the
// cheaper model. Centralized so switching is a one-line change.
const COACH_MODEL = 'claude-opus-4-8';
const DIGEST_MODEL = 'claude-sonnet-5'; // scheduled digests (weekly review)
const LIVE_COACH_MODEL = 'claude-sonnet-5'; // mid-workout: speed IS the feature
const VISION_MODEL = 'claude-haiku-4-5-20251001'; // machine photo ID: cheap + vision-capable

// Withings API secrets (stored via: firebase functions:secrets:set)
const withingsClientId = defineSecret('WITHINGS_CLIENT_ID');
const withingsClientSecret = defineSecret('WITHINGS_CLIENT_SECRET');

// AI Coach secret (stored via: firebase functions:secrets:set ANTHROPIC_API_KEY)
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

admin.initializeApp();

const db = admin.firestore();

// ── AI spend protection ──────────────────────────────────────────────
// Every function that calls the Anthropic API must pass through this
// limiter. Per-user daily caps live in a single doc per user, so a
// client retry loop or an abusive account can't run up the API bill.
// The admin UID is exempt so day-to-day testing isn't throttled — this
// replaces the old pattern of commenting limits out "for testing".
const ADMIN_UID = 'YpB4kgun28TD3eSBAR8QYfkK4a13';

async function enforceAiDailyLimit(userId, kind, maxPerDay) {
    if (userId === ADMIN_UID) return;
    const ref = db.collection('users').doc(userId)
        .collection('preferences').doc('aiRateLimits');
    const dayKey = new Date().toISOString().slice(0, 10);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const entry = data[kind] || {};
        const count = entry.dayKey === dayKey ? (entry.count || 0) : 0;
        if (count >= maxPerDay) {
            throw new functions.https.HttpsError(
                'resource-exhausted',
                'Daily limit reached — try again tomorrow'
            );
        }
        // Count before the API call: failed calls still consume quota,
        // which is the safe direction for spend protection.
        tx.set(ref, { [kind]: { dayKey, count: count + 1 } }, { merge: true });
    });
}

// VAPID keys for Web Push (generated using web-push library).
// Public key is also in push-notification-manager.js on the client. The
// PRIVATE key lives in Secret Manager (functions:secrets:set VAPID_PRIVATE_KEY)
// — it used to be hardcoded here, i.e. committed to the repo.
const VAPID_PUBLIC_KEY = 'BCCpd5gMslosl6OBbQe5mSwa6YWG2AK8q7pNKAm2MdSIUR41iWFKsUarOxbb4NathzspJ9XdbvYtPTexZxNdrxs';
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');

// web-push is configured LAZILY: secret values are only readable at runtime
// inside functions that declare the secret, never at module load. Every
// webpush.sendNotification caller must run this first (and bind the secret
// via runWith/secrets).
let _vapidConfigured = false;
function ensureVapidConfigured() {
    if (_vapidConfigured) return;
    webpush.setVapidDetails(
        'mailto:support@bigsurf.app',
        VAPID_PUBLIC_KEY,
        vapidPrivateKey.value()
    );
    _vapidConfigured = true;
}

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
exports.sendDueNotifications = functions.runWith({ secrets: [vapidPrivateKey] }).pubsub
    .schedule('every 1 minutes')
    .onRun(async (context) => {
        ensureVapidConfigured();
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
exports.sendImmediateNotification = functions.runWith({ secrets: [vapidPrivateKey] }).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    ensureVapidConfigured();

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

const TRAINING_SCIENCE_PROMPT = `You are an expert strength and conditioning coach integrated into the Big Surf workout tracker app. You analyze the user's specific training data and give actionable, individualized recommendations.

THE DATA YOU RECEIVE INCLUDES (depending on what's available):
- User profile — goal (cut/bulk/recomp/strength/general), experience level, injuries/limitations, notes, height, weekly goal
- Readiness check-ins — a 1-5 "how are you feeling" score (+ optional note) attached to recent workouts
- Personal records — best sets per exercise+equipment with dates
- The user's saved workout templates (name, category, exercises with sets×reps)
- Weekly volume by muscle group with status (low / moderate / high)
- Key lift trends — max weight across recent sessions, normalized to display unit
- Recent workouts in detail — date, location, exercises with sets/reps/weights and notes
- Equipment library grouped by gym (so you know what's actually available at each location)
- Body weight & body-fat trend — latest value, 30/90-day and 1-year change, and a monthly trajectory when present
- DEXA scan history — newest-first scans (body fat %, lean mass, fat mass, VAT, bone T-score), scan-to-scan deltas, and any left/right lean-mass asymmetry
- Training frequency, weekly goal, and unit preference

HOW TO USE THE DATA — this is non-negotiable:
- If the profile lists injuries, NEVER program exercises that load the injured area without flagging it; suggest substitutions instead.
- When the profile has a goal, frame recommendations around it (a cut and a bulk answer the same question differently).
- Reference the user's actual numbers ("your bench went 135 → 145 → 145"), not abstract advice.
- When the question touches an existing saved workout, adjust THAT workout rather than inventing a new plan from scratch.
- Auto-regulate on readiness: low scores (1-2/5) → suggest reduced load/volume that day, not hero sets; repeated low scores across a week → probe recovery (sleep, deload).
- Missed sessions: prefer redistributing a PORTION of the missed volume across remaining days over doubling one day; if the week is nearly over, let it go — one missed session costs almost nothing, but a crammed 2-hour make-up session raises injury risk and wrecks the next week. Say this plainly when relevant.
- When suggesting an exercise, prefer ones the user has equipment for at their training location.
- If the user asks about a specific day (legs, push, pull), stay on that topic; don't drift.
- If the data doesn't support a confident answer, say so plainly — never invent details.
- Match prescriptions to the user's current weights, not generic %1RMs.
- LOADABLE WEIGHTS ONLY: when the context lists available plates, every weight you prescribe must be buildable with them — move in whole multiples of the stated smallest jump FROM a weight the user has already lifted. No plate list → default to 5 lb / 2.5 kg jumps.
- RESPECT RAMP STRUCTURE: if the user's recent sessions ramp up across sets (e.g. 135/155/175), prescribe the progression as a ramp — bump the top set and scale the lead-in sets to match. Never flatten a ramp into one weight across all sets; flat prescriptions are only for users who train straight sets.
- When body-composition data is present, tie it to training: read weight + body-fat trend together (gaining lean while body fat holds = recomp), flag lean-mass loss during a cut, and turn left/right lean-mass asymmetry into specific unilateral-work suggestions for the weaker side.

Training principles to apply (when supported by the data):
- Progressive overload is the primary driver of strength and hypertrophy
- Volume landmarks: MEV ~6-8 sets/muscle/week, MRV ~15-25 sets/muscle/week
- Most people grow optimally at 10-20 hard sets per muscle group per week
- Training frequency of 2-3x per muscle group per week is optimal for most
- Deload every 4-6 weeks of hard training (reduce volume 40-50%)
- Prioritize compound movements, supplement with isolation
- On plateaus: increase reps, add a set, microload, change variation, or deload

Format: short bullet points, not paragraphs. These are read on a phone at the gym.
Concreteness beats brevity: any prescription MUST carry exact numbers — weight × reps (in the user's unit) and a one-line why. "Go a bit heavier" is useless under a bar; "155 × 8 — last week's 145 × 8 was clean" is coaching.
Carry context across turns of the conversation — if you said something earlier, build on it instead of contradicting yourself.`;

const WORKOUT_BUILDER_PROMPT = `You are an expert strength and conditioning coach. You build workout templates for the Big Surf workout tracker app.

You will be given the user's exercise library and training history. Generate a workout template as a JSON object.

RULES:
- Prefer exercises from the user's library when they match the focus. Use the exact name from their library.
- Ground weight suggestions in the user's recent numbers from the training context. If history shows their last bench press at 145 lbs × 8, prescribe 145 — not a generic 135. If no history exists for that lift, use 0.
- You may suggest exercises NOT in the library if they fill a gap. For any exercise not in the user's library, add an "alternatives" array with 2 substitutions the user could do instead (prefer ones from their library).
- Exercises from the user's library should NOT have an "alternatives" field.
- Each exercise needs: name, bodyPart, equipmentType, sets (number), reps (number), weight (number in user's unit or 0 if unknown).
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
// Appended to the system prompt on the STREAMING path only — the legacy
// callable has no tools, so it must not promise any.
// Appended to the system prompt on paths that have NO tools (the buffered
// callable fallback). The model must never claim an in-app action succeeded
// when it has no way to perform one.
const NO_ACTIONS_NOTE = `

IMPORTANT — NO ACTIONS AVAILABLE IN THIS SESSION: you cannot create, update, or save anything in the app right now (no workout templates, no memory). If the user asks you to build or change a workout, give the full details as text, then say plainly that you couldn't save it to their workouts this time and they should try again shortly. NEVER say you updated or saved something.`;

const COACH_TOOLS_PROMPT = `

TOOLS — you can act in the app, not just talk:
- CONSENT RULE (overrides everything below): write tools (create_workout_template, update_workout_template, set_week_plan) run ONLY on an explicit instruction to change something — "build me…", "add…", "change…", "reorder…", "update my…", "yes, do it". A question or analysis request ("what about my Friday workout?", "how does my week look?") NEVER triggers a write: propose the change in text, then ask "Want me to apply that?" and wait for a yes. An uninvited edit to a user's real workout is a serious failure even when the edit is good.
- The flip side: an explicit imperative IS the consent — "rename and archive everything else" means DO IT NOW, don't re-ask. One instruction covers its whole batch; never re-confirm each sub-step.
- BATCH EFFICIENCY: when one instruction needs several writes (archive 5 templates, rename 3), emit ALL the tool calls in a SINGLE response (parallel tool use) — never one call per round; tool rounds are hard-capped.
- create_workout_template: REQUIRED whenever the user asks you to build/make/plan a NEW recurring workout. Never answer such a request with a text-only workout description — create the template (weights drawn from their history), then summarize in one short line. The app renders a tappable card for the action. Name templates by what they ARE ("Push day", "Legs — heavy"), NEVER by weekday ("Monday push") — days live in the week plan, not in names.
- TEMPLATE TAXONOMY (classify at creation, prevents library sprawl): kind='core' for recurring workouts (default) · kind='variation' + parentTemplateId for a riff on an existing workout ("harder push day") · kind='oneOff' for single occasions (travel gym, test day — auto-archives after first use). DEDUPE GUARD: before creating, call list_templates — if an existing template covers most of the same exercises, update or vary IT instead of creating a near-duplicate.
- propose_session_adjustments: REQUIRED for deloads, make-up sessions, and one-off intensity/time changes to an existing workout — the user gets a "Start <workout> — <label>" card; the template is NEVER modified and NO new template is created. "Plan me a deload week" = session adjustments against existing templates, template count unchanged.
- archive_template: only when the user asks to clean up or approves a specific cleanup suggestion. Suggest archiving only inside a weekly review or a direct cleanup request — never spontaneously.
- update_workout_template: for ANY change to a workout the user already has — rename, add/remove exercise, REORDER exercises, change sets/reps/weight. Get the templateId from list_templates first if you don't have it. NEVER create a new template (or a near-duplicate name) when the user is asking to change an existing one — that leaves their real workout untouched and clutters their list.
- get_week_plan / set_week_plan: the weekly schedule (day → saved workout, rest days). "Move legs to Friday" or "I can only train Mon/Wed/Fri" = pointer updates via set_week_plan (partial updates fine: pass only the days that change; "rest" marks a rest day, null clears) — no template gets edited or duplicated for scheduling. Check get_week_plan before answering "what should I do today/this week".
- get_exercise_history / list_templates / get_prs: read tools — use them instead of guessing when the summary context isn't detailed enough.
- USAGE HONESTY: usageCount can undercount (workouts logged under a template's pre-rename name aren't attributed). NEVER declare a template dead/unused from usageCount alone — cross-check the recent-workouts context first, and when unsure say what you actually know.
- remember_fact: when the user shares DURABLE information — injuries, goals, schedule, equipment quirks, preferences — store it (short, one sentence). Never store measurements the app already tracks. Use forget_fact when the user corrects or retracts something you remembered.
- log_advice: whenever you give a concrete CHECKABLE recommendation (a weight target, a deload, a volume change, an exercise swap), silently log it — one call per recommendation. Your context shows what happened after past recommendations; reference that track record when relevant, as correlation not causation.
- PROGRAMS (get_program / create_program / adjust_program): a program = a multi-week direction (goal, length, per-week targets like "week 4: deload -40%") layered over the week plan. "Build me a program" → create the templates first if needed, then create_program (which also sets the week plan — one consent covers both). The current week derives from startDate; honor the active program's week target when proposing sessions (via propose_session_adjustments — the deload week NEVER edits templates). Trust levels: 'propose' (default — everything is a card) or 'auto_confirm' (the dashboard pre-builds each program week's adjusted session and starting it is the confirmation). Switch levels ONLY when the user explicitly asks ("turn on auto mode" → adjust_program {trustLevel:'auto_confirm'}); it is always reversible and you should mention that. Neither level ever writes a workout without a user tap. "I can only train 3 days next week" → adjust_program with a reshaped split.
- If a tool fails, say so briefly and give your best text answer instead — never claim an action succeeded when it didn't.`;

// Live-mode addendum (Phase 6): the coach is IN the workout, speed + brevity.
const LIVE_COACH_PROMPT = `

LIVE MODE — you are mid-workout with the user, between sets:
- Answer in 1-3 short sentences. One concrete prescription beats three options.
- The live workout state (gym, equipment there, sets just logged) is in the first message — ground every answer in it.
- Concrete suggestions go through proposal tools (propose_next_target / propose_swap / propose_add_exercise / propose_rest) — the app renders a card the user can Apply with one tap. Nothing you propose applies itself; still ground it and keep it singular.
- Swaps must use equipment from the current gym's list. Never propose equipment that isn't there.
- Weights must be loadable: when the live state lists plates, propose only weights buildable from them — whole multiples of the stated smallest jump from a weight already lifted this session or last.
- Pain or a tweak: NEVER coach through it. Propose a swap that unloads the area, or ending the session — and say why in one line.
- get_exercise_history / get_prs are available when you need more than the live state shows.
- log_advice: silently log concrete checkable recommendations (weight targets, swaps) — one call each.`;

/**
 * One streamed Anthropic round: emits visible text deltas via `send`, and
 * reconstructs the FULL content-block list (text, thinking + signature,
 * redacted_thinking, tool_use with parsed input) so tool loops can pass the
 * assistant turn back verbatim — required when extended thinking is on.
 */
async function anthropicStreamRound(apiKey, requestBody, send, emittedTextBefore) {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
    });
    if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        throw new Error(`Claude API ${upstream.status}: ${errBody.slice(0, 300)}`);
    }

    const open = {};   // index → in-progress block
    const blocks = []; // finalized, in index order
    let stopReason = null;
    const usage = { inputTokens: 0, outputTokens: 0 };
    let emittedText = false;
    let buffer = '';
    const decoder = new TextDecoder();

    for await (const chunk of upstream.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = rawEvent.split('\n').find(l => l.startsWith('data:'));
            if (!dataLine) continue;
            let ev;
            try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

            if (ev.type === 'message_start') {
                usage.inputTokens = ev.message?.usage?.input_tokens || 0;
            } else if (ev.type === 'content_block_start') {
                const cb = ev.content_block || {};
                if (cb.type === 'text') open[ev.index] = { type: 'text', text: '' };
                else if (cb.type === 'thinking') { open[ev.index] = { type: 'thinking', thinking: '', signature: '' }; send({ type: 'status', text: 'Thinking…' }); }
                else if (cb.type === 'redacted_thinking') open[ev.index] = { ...cb };
                else if (cb.type === 'tool_use') open[ev.index] = { type: 'tool_use', id: cb.id, name: cb.name, _json: '' };
                else open[ev.index] = { ...cb };
            } else if (ev.type === 'content_block_delta') {
                const blk = open[ev.index];
                if (!blk) continue;
                if (ev.delta?.type === 'text_delta') {
                    // Separate this round's text from a previous round's with a
                    // blank line so the client's accumulated bubble reads clean.
                    if (!emittedText && emittedTextBefore) send({ type: 'delta', text: '\n\n' });
                    emittedText = true;
                    blk.text += ev.delta.text;
                    send({ type: 'delta', text: ev.delta.text });
                } else if (ev.delta?.type === 'thinking_delta') {
                    blk.thinking += ev.delta.thinking || '';
                } else if (ev.delta?.type === 'signature_delta') {
                    blk.signature = ev.delta.signature || '';
                } else if (ev.delta?.type === 'input_json_delta') {
                    blk._json += ev.delta.partial_json || '';
                }
            } else if (ev.type === 'content_block_stop') {
                const blk = open[ev.index];
                if (!blk) continue;
                if (blk.type === 'tool_use') {
                    try { blk.input = JSON.parse(blk._json || '{}'); } catch { blk.input = {}; }
                    delete blk._json;
                }
                blocks[ev.index] = blk;
                delete open[ev.index];
            } else if (ev.type === 'message_delta') {
                stopReason = ev.delta?.stop_reason || stopReason;
                if (ev.usage?.output_tokens) usage.outputTokens = ev.usage.output_tokens;
            } else if (ev.type === 'error') {
                throw new Error(`Claude stream error: ${JSON.stringify(ev).slice(0, 300)}`);
            }
        }
    }

    return { blocks: blocks.filter(Boolean), stopReason, usage, emittedText };
}

/**
 * Prompt caching for chat threads: the FIRST user turn carries the big
 * training-context block and is resent verbatim every turn — mark it as a
 * cache breakpoint so the API caches everything up to and including it.
 * String content becomes a single text block; already-structured content is
 * passed through untouched.
 */
function withPromptCaching(messages) {
    return (messages || []).map((m, i) => {
        if (i === 0 && m.role === 'user' && typeof m.content === 'string') {
            return {
                role: 'user',
                content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
            };
        }
        return m;
    });
}

exports.getTrainingRecommendation = functions.runWith({
    secrets: [anthropicApiKey],
    // 120s (up from 60): Opus 4.8 at 'xhigh' effort reasons longer; the
    // callable buffers the full response, so give it room before the timeout.
    timeoutSeconds: 120,
    memory: '256MB',
    // Hard concurrency ceiling — caps worst-case API burn even if the
    // per-user limiter is somehow bypassed.
    maxInstances: 2,
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { question, context: trainingContext, messages: clientMessages } = data;

    // Accept either:
    //   - clientMessages: [{role:'user'|'assistant', content:string}, …] (new path)
    //   - question + trainingContext (legacy single-turn path)
    // We use whichever is provided; messages wins when both exist.
    const hasThread = Array.isArray(clientMessages) && clientMessages.length > 0;
    if (!hasThread && !question) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing question or messages');
    }

    // Spend protection: 10 coach questions per user per day (admin exempt)
    await enforceAiDailyLimit(userId, 'coach', 10);

    try {
        const apiKey = anthropicApiKey.value();
        if (!apiKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'ANTHROPIC_API_KEY not configured. Run: firebase functions:secrets:set ANTHROPIC_API_KEY'
            );
        }

        // Call Claude API via HTTPS (no SDK dependency needed).
        // Opus 4.7 + extended thinking: coaching benefits from deeper reasoning
        // when interpreting plateaus, volume patterns, and tradeoffs. The
        // explicit budget_tokens form is the canonical Anthropic schema —
        // earlier code used `type: 'adaptive'`, which the API silently
        // ignored, producing thin "doesn't read my data" responses.
        // Build the message thread. When the client sends a multi-turn
        // conversation we forward it verbatim — Claude needs the prior
        // turns so it doesn't switch topics between sends. Otherwise we
        // fall back to the legacy single-turn shape.
        const apiMessages = hasThread
            ? clientMessages
                .filter(m => m && m.role && m.content)
                .map(m => ({ role: m.role, content: String(m.content) }))
            : [{
                role: 'user',
                content: `Here is my training data:\n\n${trainingContext || 'No data provided.'}\n\nUser question: ${question}\n\nGround your answer in the specific numbers and exercises above. If the data doesn't support a recommendation, say so.`,
            }];

        const requestBody = JSON.stringify({
            model: COACH_MODEL,
            // 16k (up from 12k): thinking tokens count against max_tokens, and
            // at 'xhigh' effort the reasoning can eat into the budget — give the
            // visible answer room so deep analyses don't truncate.
            max_tokens: 16000,
            // Opus 4.8 uses adaptive thinking + output_config.effort for the
            // depth knob (not budget_tokens). 'xhigh' (between 'high' and 'max')
            // gives the deepest practical reasoning for coaching across
            // plateaus / volume / recomp without the overthinking risk of 'max'.
            thinking: { type: 'adaptive' },
            output_config: { effort: 'xhigh' },
            // Prompt caching: the system prompt + the first user turn (which
            // carries the big training-context block) are identical across the
            // turns of a conversation — cache them so multi-turn chats get
            // cheaper and faster time-to-first-token.
            // NO_ACTIONS_NOTE: this buffered path has no tools. Without this
            // line, a user asking "update my workout" gets a confident text
            // reply claiming the change was saved when nothing happened.
            system: [{ type: 'text', text: TRAINING_SCIENCE_PROMPT + NO_ACTIONS_NOTE, cache_control: { type: 'ephemeral' } }],
            messages: withPromptCaching(apiMessages),
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

        // (The old coachRateLimit timestamp write lived here — superseded by
        // enforceAiDailyLimit, removed.)

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
 * Streaming coach chat — 2nd-gen HTTPS function (v1 callables buffer the whole
 * response; this streams the first words in ~2s instead of a 60-120s spinner).
 *
 * Request: POST, `Authorization: Bearer <idToken>`, body
 * `{ messages: [{role, content}], question?: string }` — the same thread shape
 * the callable accepts; `question` is only used for the history doc.
 *
 * Response: SSE. Event protocol (the substrate for later tool events):
 *   {"type":"status","text":"Thinking…"}   — model is in a thinking block
 *   {"type":"delta","text":"…"}            — visible text delta
 *   {"type":"done","fullText":"…","usage":{…}} — terminal success
 *   {"type":"error","message":"…"}         — terminal error
 *
 * getTrainingRecommendation stays deployed unchanged as the fallback path —
 * prod has no build step, so cached clients keep calling it for a while.
 */
exports.coachChatStream = onRequest({
    secrets: [anthropicApiKey],
    timeoutSeconds: 300,
    memory: '512MiB',
    maxInstances: 2,
    cors: true,
    invoker: 'public', // auth is enforced in-handler via the bearer ID token
}, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'POST only' });
        return;
    }

    // Manual auth — no callable context here.
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let userId;
    try {
        if (!idToken) throw new Error('missing token');
        userId = (await admin.auth().verifyIdToken(idToken)).uid;
    } catch (e) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
    }

    const isLive = req.body?.mode === 'live';
    try {
        // Live mode gets its own generous cap (cheap model, short answers — a
        // set-by-set conversation is many small turns).
        if (isLive) await enforceAiDailyLimit(userId, 'coachLive', 30);
        else await enforceAiDailyLimit(userId, 'coach', 10);
    } catch (e) {
        res.status(429).json({ error: 'resource-exhausted', message: 'Daily coach limit reached — try again tomorrow.' });
        return;
    }

    const { messages, question, threadId: rawThreadId } = req.body || {};
    const apiMessages = (Array.isArray(messages) ? messages : [])
        .filter(m => m && m.role && m.content)
        .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content }));
    if (apiMessages.length === 0) {
        res.status(400).json({ error: 'invalid-argument', message: 'Missing messages' });
        return;
    }
    // Thread id (client-generated) → one coachHistory doc per conversation,
    // updated as it grows, so past sessions can be reopened AND continued.
    const threadId = typeof rawThreadId === 'string' && /^[\w-]{6,64}$/.test(rawThreadId)
        ? rawThreadId : null;

    // SSE from here on out.
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    const send = (ev) => { res.write(`data: ${JSON.stringify(ev)}\n\n`); };

    try {
        const apiKey = anthropicApiKey.value();
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

        // Tool loop: call the model; when it stops for tool_use, execute the
        // tools server-side (Admin SDK, scoped to this user), append the
        // results, and call again — streaming text deltas the whole way.
        // Hard cap MAX_TOOL_ROUNDS (12 — a program build chains list_templates
        // + several creates + set_week_plan + create_program + log_advice, so
        // the plan's original 6 truncated real flows); the whole loop still
        // costs ONE 'coach' rate-limit unit.
        // Coach memory — durable facts injected into every call (cap 30).
        let memoryBlock = '';
        try {
            const memSnap = await db.collection('users').doc(userId)
                .collection('preferences').doc('coachMemory').get();
            const facts = memSnap.exists ? (memSnap.data().facts || []) : [];
            if (facts.length) {
                memoryBlock = '\n\nWHAT YOU REMEMBER ABOUT THIS USER (from earlier conversations; ids usable with forget_fact):\n'
                    + facts.slice(0, 30).map(f => `- [${f.id}] ${f.text}`).join('\n');
            }
        } catch (e) {
            console.error('coach memory load failed (continuing without):', e);
        }

        const executors = makeToolExecutors({ db, userId, source: isLive ? 'live' : 'chat' });
        let msgs = withPromptCaching(apiMessages);
        let fullText = '';
        const usage = { inputTokens: 0, outputTokens: 0 };
        const actionCards = [];

        // Mode knobs: the coach tab gets the flagship model + deep thinking;
        // live mode trades depth for time-to-first-token (Sonnet, no extended
        // thinking, short answers, proposal tools instead of template writes).
        const modeRequest = isLive
            ? {
                model: LIVE_COACH_MODEL,
                max_tokens: 1500,
                system: [{ type: 'text', text: TRAINING_SCIENCE_PROMPT + LIVE_COACH_PROMPT + memoryBlock, cache_control: { type: 'ephemeral' } }],
                tools: liveToolDefinitions(),
            }
            : {
                model: COACH_MODEL,
                max_tokens: 16000,
                thinking: { type: 'adaptive' },
                output_config: { effort: 'xhigh' },
                system: [{ type: 'text', text: TRAINING_SCIENCE_PROMPT + COACH_TOOLS_PROMPT + memoryBlock, cache_control: { type: 'ephemeral' } }],
                tools: TOOL_DEFINITIONS,
            };

        const MAX_TOOL_ROUNDS = 12;
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const roundResult = await anthropicStreamRound(apiKey, {
                ...modeRequest,
                stream: true,
                messages: msgs,
            }, send, fullText.length > 0);

            const { blocks, stopReason } = roundResult;
            usage.inputTokens += roundResult.usage.inputTokens;
            usage.outputTokens += roundResult.usage.outputTokens;
            const roundText = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
            if (roundText) fullText += (fullText ? '\n\n' : '') + roundText;

            if (stopReason !== 'tool_use') break;

            // Cap exhausted mid-task: say so instead of truncating silently
            // (live-tested failure: a batch archive died half-done, mutely).
            if (round === MAX_TOOL_ROUNDS - 1) {
                const note = '\n\n(I hit my action limit before finishing — say "continue" and I\'ll pick up where I left off.)';
                send({ type: 'delta', text: note });
                fullText += note;
                break;
            }

            const toolUses = blocks.filter(b => b.type === 'tool_use');
            if (toolUses.length === 0) break; // defensive — shouldn't happen
            const resultBlocks = [];
            for (const tu of toolUses) {
                // log_advice is deliberately silent — no status flicker.
                if (tu.name !== 'log_advice') send({ type: 'status', text: TOOL_STATUS[tu.name] || 'Working…' });
                let out;
                try {
                    if (tu.name.startsWith('propose_')) {
                        // Proposals: validate + echo, ZERO I/O — the client
                        // applies them only on a user tap (the active workout
                        // is client-owned state; a server write would race
                        // the debounced auto-save).
                        const v = validateProposal(tu.name, tu.input);
                        if (v.ok) {
                            send({ type: 'proposal', proposal: v.proposal });
                            out = { result: { proposed: true, proposal: v.proposal } };
                        } else {
                            out = { error: v.error };
                        }
                    } else {
                        out = executors[tu.name]
                            ? await executors[tu.name](tu.input)
                            : { error: `Unknown tool: ${tu.name}` };
                    }
                } catch (e) {
                    console.error(`❌ coach tool ${tu.name} failed:`, e);
                    out = { error: 'Tool failed — tell the user the action could not be completed.' };
                }
                if (out.actionCard) {
                    send({ type: 'action_card', card: out.actionCard });
                    actionCards.push(out.actionCard);
                }
                const payload = out.error ? { error: out.error } : (out.result ?? out);
                resultBlocks.push({
                    type: 'tool_result',
                    tool_use_id: tu.id,
                    content: JSON.stringify(payload),
                    is_error: !!out.error,
                });
            }
            // Pass the assistant turn back VERBATIM (incl. thinking blocks with
            // signatures — required when extended thinking is enabled).
            msgs = [...msgs, { role: 'assistant', content: blocks }, { role: 'user', content: resultBlocks }];
        }

        // History — same doc shape the callable writes.
        // Live threads are ephemeral session talk — not saved to coachHistory.
        if (isLive) {
            console.log(`✅ Live coach for ${userId} (${usage.inputTokens} in, ${usage.outputTokens} out)`);
            send({ type: 'done', fullText, usage });
            res.end();
            return;
        }

        const lastUserMsg = [...apiMessages].reverse().find(m => m.role === 'user');
        // Thread title = the conversation's FIRST question (context prefix
        // stripped), stable across turns. Titling by the latest question made
        // one conversation morph names in the history list — reading as
        // several different chats.
        const firstUserMsg = apiMessages.find(m => m.role === 'user');
        const firstText = typeof firstUserMsg?.content === 'string' ? firstUserMsg.content : '';
        const qMarker = '\nQuestion: ';
        const qIdx = firstText.indexOf(qMarker);
        const threadTitle = (qIdx !== -1 ? firstText.slice(qIdx + qMarker.length) : firstText).slice(0, 200);
        const historyDoc = {
            question: question || (typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''),
            response: fullText,
            timestamp: new Date().toISOString(),
            usage,
            ...(actionCards.length ? { actions: actionCards } : {}),
        };
        if (threadId) {
            // Full-thread doc (one per conversation, grows turn by turn) so a
            // past session can be reopened WITH its context and continued.
            const thread = apiMessages
                .filter(m => typeof m.content === 'string' && m.content)
                .map(m => ({ role: m.role, content: m.content }));
            thread.push({ role: 'assistant', content: fullText });
            await db.collection('users').doc(userId).collection('coachHistory')
                .doc(threadId).set({ ...historyDoc, question: threadTitle || historyDoc.question, threadId, messages: thread });
        } else {
            await db.collection('users').doc(userId).collection('coachHistory').add(historyDoc);
        }

        console.log(`✅ Coach stream for ${userId} (${usage.inputTokens || 0} in, ${usage.outputTokens || 0} out)`);
        send({ type: 'done', fullText, usage });
        res.end();
    } catch (error) {
        console.error('❌ coachChatStream error:', error);
        send({ type: 'error', message: 'Coach is unavailable right now — try again.' });
        res.end();
    }
});

// Machine photo ID (Phase 8) — strict-JSON identification prompt.
const MACHINE_ID_PROMPT = `You identify gym equipment from a single photo for a workout tracker app.

Return ONLY a JSON object (no markdown fences, no prose):
{
  "brand": string|null,          // visible manufacturer, e.g. "Hammer Strength", "Life Fitness" — null if not visible/known
  "name": string,                // what the machine IS, e.g. "Iso-Lateral Chest Press", "Seated Leg Curl"
  "machineFunction": string,     // short movement description, e.g. "chest press"
  "equipmentType": string,       // one of: Machine, Cable, Free Weight, Bodyweight, Cardio, Other
  "confidence": number,          // 0-1 — how sure you are of brand+name together
  "exercises": string[],         // up to 6 exercise names doable on it, most common first
  "notes": string|null,          // anything useful: plate-loaded vs selectorized, unusual setup
  "altGuess": {"brand": string|null, "name": string}|null  // second-best interpretation when confidence < 0.7
}

Rules: identify what's actually IN the photo, never invent a brand you can't see or infer confidently; a blurry/ambiguous photo gets low confidence and an honest altGuess, not a guess dressed as certainty.`;

/**
 * Identify a gym machine from a photo (Phase 8). Same shape as
 * extractDexaData: base64 in, strict JSON out, per-user daily cap.
 */
exports.identifyMachine = functions.runWith({
    secrets: [anthropicApiKey],
    timeoutSeconds: 60,
    memory: '512MB',
    maxInstances: 2,
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const userId = context.auth.uid;
    const { imageBase64, mediaType } = data || {};
    if (!imageBase64) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing image data');
    }
    // Client downscales to ≤1024px JPEG; anything past 5 MB is a bad upload.
    const estimatedSize = (imageBase64.length * 3) / 4;
    if (estimatedSize > 5 * 1024 * 1024) {
        throw new functions.https.HttpsError('invalid-argument', 'Image too large. Maximum 5 MB.');
    }

    await enforceAiDailyLimit(userId, 'vision', 10);

    try {
        const apiKey = anthropicApiKey.value();
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                max_tokens: 1000,
                system: MACHINE_ID_PROMPT,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType || 'image/jpeg',
                                data: imageBase64,
                            },
                        },
                        { type: 'text', text: 'Identify this gym machine. Return ONLY the JSON object.' },
                    ],
                }],
            }),
        });
        if (!upstream.ok) {
            const errBody = await upstream.text().catch(() => '');
            console.error('❌ Vision API error:', upstream.status, errBody.slice(0, 300));
            throw new functions.https.HttpsError('internal', "Couldn't analyze the photo — try again.");
        }
        const response = await upstream.json();
        const rawText = response.content?.find(b => b.type === 'text')?.text || '';
        let identified;
        try {
            const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            identified = JSON.parse(cleaned);
        } catch (e) {
            console.error('❌ Machine ID JSON parse failed:', rawText.slice(0, 300));
            throw new functions.https.HttpsError('internal', "Couldn't read the photo — try a clearer shot.");
        }
        if (!identified.name) {
            throw new functions.https.HttpsError('internal', "Couldn't tell what this machine is — try a wider shot.");
        }
        console.log(`✅ Machine identified for ${userId}: ${identified.brand || ''} ${identified.name} (${identified.confidence})`);
        return {
            identified,
            usage: {
                inputTokens: response.usage?.input_tokens || 0,
                outputTokens: response.usage?.output_tokens || 0,
            },
        };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error('❌ Machine ID error:', error);
        throw new functions.https.HttpsError('internal', "Couldn't identify the machine");
    }
});

/**
 * Weekly review generation — shared by the Monday scheduled digest and the
 * on-demand requestWeeklyReview callable. Builds a compact server-side
 * summary, one cheap DIGEST_MODEL call, saves to coachHistory as
 * {type:'weekly_review'}.
 *
 * @returns {Promise<{status: string, review?: string, sessionId?: string}>}
 *   status: 'ok' | 'opted_out' | 'no_workouts' | 'already_reviewed' | 'api_error'
 */
async function generateWeeklyReviewForUser(userRef, apiKey, { force = false, sendPush = true } = {}) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const weekKey = new Date().toISOString().slice(0, 10);

    // Opt-out (default on). A manual request is explicit consent — skip it.
    if (!force) {
        const settingsSnap = await userRef.collection('preferences').doc('settings').get();
        if (settingsSnap.exists && settingsSnap.data().weeklyCoachReview === false) return { status: 'opted_out' };
    }

    // Active this week?
    const workoutsSnap = await userRef.collection('workouts')
        .where('date', '>=', weekAgo).orderBy('date', 'desc').limit(15).get();
    const workouts = workoutsSnap.docs.map(d => d.data())
        .filter(w => w.completedAt && !w.cancelledAt);
    if (workouts.length === 0) return { status: 'no_workouts' };

    // Once per week, retry-safe. Manual requests rate-limit separately
    // (per-day, in the callable) so they never consume the Monday slot.
    if (!force) {
        const limitRef = userRef.collection('preferences').doc('aiRateLimits');
        const limitSnap = await limitRef.get();
        if (limitSnap.exists && limitSnap.data().weeklyReview?.weekKey === weekKey) return { status: 'already_reviewed' };
        await limitRef.set({ weeklyReview: { weekKey } }, { merge: true });
    }

    // Week plan (5.5) — anchor the review to planned-vs-done, with an
    // explicit adherence line (minimal adherence awareness: the review
    // is the checkpoint that notices a broken week, not the user).
    let planLine = '';
    let adherenceLine = '';
    try {
        const planSnap = await userRef.collection('preferences').doc('weekPlan').get();
        if (planSnap.exists) {
            const { days = {}, restDays = [] } = planSnap.data();
            const tSnap = await userRef.collection('workoutTemplates').get();
            const names = new Map(tSnap.docs.map(d => [d.id, d.data().name || d.id]));
            const parts = Object.entries(days)
                .filter(([, tid]) => tid)
                .map(([d, tid]) => `${d} ${names.get(tid) || tid}`);
            if (restDays.length) parts.push(`rest ${restDays.join('/')}`);
            if (parts.length) planLine = `Week plan: ${parts.join(' · ')}\n\n`;
            // days values are templateId | 'rest' | null — only real
            // workouts count as planned training days.
            const plannedCount = Object.values(days).filter(tid => tid && tid !== 'rest').length;
            if (plannedCount > 0) {
                const trainedDays = new Set(workouts.map(w => w.date)).size;
                adherenceLine = `Adherence: trained ${trainedDays} of ${plannedCount} planned days this week.\n\n`;
            }
        }
    } catch (planErr) {
        console.log(`weeklyCoachReview plan read skipped for ${userRef.id}:`, planErr.message);
    }

    // Active program (Phase 9) — the review must know the block it's
    // reviewing. Week derived from startDate, never stored.
    let programLine = '';
    try {
        const progSnap = await userRef.collection('programs')
            .where('active', '==', true).limit(1).get();
        if (!progSnap.empty) {
            const prog = progSnap.docs[0].data();
            const week = Math.floor(Math.round((new Date() - new Date(`${prog.startDate}T12:00:00`)) / 86400000) / 7) + 1;
            if (week > (prog.weeks || 1)) {
                programLine = `Program: "${prog.name}" (${prog.weeks} weeks, ${prog.goal}) FINISHED — acknowledge the block is done and invite planning the next one.\n\n`;
            } else if (week >= 1) {
                const target = (prog.weekTargets || []).find(t => t.week === week);
                const next = (prog.weekTargets || []).find(t => t.week === week + 1);
                programLine = `Program: "${prog.name}" (${prog.goal}) — week ${week} of ${prog.weeks}`
                    + (target ? ` — this week: ${target.label}${target.weightPct ? ` (${target.weightPct > 0 ? '+' : ''}${target.weightPct}% weight)` : ''}` : '')
                    + (next ? `; next week: ${next.label}` : '')
                    + '.\n\n';
            }
        }
    } catch (progErr) {
        console.log(`weeklyCoachReview program read skipped for ${userRef.id}:`, progErr.message);
    }

    // Past advice outcomes (Phase 7) — the one proactive push should
    // know whether earlier calls worked. Outcome windows need up to
    // ~10 weeks of history; only read it when there's advice to score.
    let outcomesBlock = '';
    try {
        const advSnap = await userRef.collection('coachAdvice')
            .orderBy('date', 'desc').limit(15).get();
        const advice = advSnap.docs.map(d => d.data());
        if (advice.length) {
            const historyStart = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
            const histSnap = await userRef.collection('workouts')
                .where('date', '>=', historyStart).orderBy('date', 'desc').limit(120).get();
            const history = histSnap.docs.map(d => d.data()).filter(w => w.completedAt && !w.cancelledAt);
            const scored = buildOutcomesContext(advice, history, weekKey, { limit: 5 });
            if (scored) outcomesBlock = `${scored}\n`;
        }
    } catch (outErr) {
        console.log(`weeklyCoachReview outcomes skipped for ${userRef.id}:`, outErr.message);
    }

    // Compact summary — dates, types, top sets, readiness, notes.
    const lines = [];
    for (const w of workouts) {
        const names = w.exerciseNames || {};
        const ready = w.readiness?.score ? ` · felt ${w.readiness.score}/5` : '';
        lines.push(`${w.date} — ${w.workoutType || 'Workout'}${ready}`);
        for (const [key, ex] of Object.entries(w.exercises || {})) {
            const name = names[key];
            if (!name || !ex.sets?.length) continue;
            const sets = ex.sets
                .filter(s => s.type !== 'warmup' && (s.reps || s.weight))
                .map(s => `${s.reps || '?'}×${s.weight || 'BW'}`).join(', ');
            if (sets) lines.push(`  ${name}${ex.equipment ? ` [${ex.equipment}]` : ''}: ${sets}${ex.notes ? ` — "${ex.notes}"` : ''}`);
        }
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: DIGEST_MODEL,
            max_tokens: 1500,
            system: 'You are a strength coach writing a SHORT weekly training review for a phone screen. Format: 3-5 bullet points — what went well (with real numbers), one thing to watch, one concrete focus for next week. When a week plan is provided, compare planned vs completed factually (never guilt) and make the next-week focus concrete against it. When an active program is provided, frame the review against it — which week of the block this was, what next week brings. If the user trained fewer days than planned, offer once, without guilt, that they can ask the coach to reflow the program. When past recommendation outcomes are provided, reference at most one relevant fact (numbers only, correlation not causation). No preamble, no sign-off. Ground every claim in the data provided.',
            messages: [{ role: 'user', content: `${programLine}${adherenceLine}${planLine}${outcomesBlock}This week's training log:\n\n${lines.join('\n')}` }],
        }),
    });
    if (!upstream.ok) {
        console.error(`❌ weeklyCoachReview API error for ${userRef.id}:`, upstream.status);
        return { status: 'api_error' };
    }
    const resp = await upstream.json();
    const review = resp.content?.find(b => b.type === 'text')?.text;
    if (!review) return { status: 'api_error' };

    const sessionRef = await userRef.collection('coachHistory').add({
        type: 'weekly_review',
        question: 'Weekly review',
        response: review,
        timestamp: new Date().toISOString(),
        usage: {
            inputTokens: resp.usage?.input_tokens || 0,
            outputTokens: resp.usage?.output_tokens || 0,
        },
    });

    // Push (best effort — web push infra). Skipped for manual requests:
    // the user is already in the app looking at the result.
    if (sendPush) {
        try {
            const subSnap = await userRef.collection('push_subscriptions').doc('current').get();
            const sub = subSnap.exists ? subSnap.data().subscription : null;
            if (sub) {
                ensureVapidConfigured();
                await webpush.sendNotification(sub, JSON.stringify({
                    title: 'Big Surf',
                    body: 'Your weekly training review is ready',
                    icon: '/BigSurf.png',
                    badge: '/BigSurf.png',
                    tag: 'weekly-review',
                    // Tap deep-links to the review (service worker routes on
                    // data.url) instead of dumping the user on the dashboard.
                    data: { url: '/?open=weekly-review' },
                }));
            }
        } catch (pushErr) {
            console.log(`weeklyCoachReview push skipped for ${userRef.id}:`, pushErr.message);
        }
    }

    return { status: 'ok', review, sessionId: sessionRef.id };
}

/**
 * Weekly coach review (Phase 5) — proactive digest every Monday 14:00 UTC.
 * For each user active in the last 7 days: generateWeeklyReviewForUser, push
 * "Your weekly training review is ready".
 *
 * Spend guardrails: skip users with zero workouts in the window, per-user
 * 1/week via a weekKey (survives function retries), maxInstances 1, opt-out
 * via settings.weeklyCoachReview === false (default on).
 */
exports.weeklyCoachReview = functions.runWith({
    secrets: [anthropicApiKey, vapidPrivateKey],
    timeoutSeconds: 540,
    memory: '512MB',
    maxInstances: 1,
}).pubsub.schedule('every monday 14:00').onRun(async () => {
    const apiKey = anthropicApiKey.value();
    if (!apiKey) { console.error('❌ weeklyCoachReview: no API key'); return null; }

    const userRefs = await db.collection('users').listDocuments();
    let reviewed = 0;
    for (const userRef of userRefs) {
        try {
            const result = await generateWeeklyReviewForUser(userRef, apiKey);
            if (result.status === 'ok') reviewed++;
        } catch (userErr) {
            console.error(`❌ weeklyCoachReview failed for ${userRef.id}:`, userErr);
        }
    }
    console.log(`✅ weeklyCoachReview: ${reviewed} review(s) generated`);
    return null;
});

/**
 * On-demand weekly review — "Review my week" on the coach landing. Same
 * generation as the Monday digest, but for the signed-in user right now.
 *
 * Spend guardrails: one manual review per user per day (separate from the
 * Monday weekKey, so a manual Sunday review doesn't eat Monday's digest).
 * No push — the user is in the app watching the result stream in.
 */
exports.requestWeeklyReview = functions.runWith({
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: '512MB',
    maxInstances: 2,
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in to get a review');
    }
    const apiKey = anthropicApiKey.value();
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'Coach unavailable');
    }

    const userRef = db.collection('users').doc(context.auth.uid);

    // Deliberately NOT enforceAiDailyLimit: that limiter counts BEFORE the
    // call, so a failed generation would burn the day's only slot. Here the
    // slot is written only on success — same spend ceiling (1/day), kinder
    // failure mode. Admin exemption matches the shared limiter's.
    const todayKey = new Date().toISOString().slice(0, 10);
    const limitRef = userRef.collection('preferences').doc('aiRateLimits');
    if (context.auth.uid !== ADMIN_UID) {
        const limitSnap = await limitRef.get();
        if (limitSnap.exists && limitSnap.data().weeklyReview?.manualDate === todayKey) {
            return { status: 'rate_limited' };
        }
    }

    const result = await generateWeeklyReviewForUser(userRef, apiKey, { force: true, sendPush: false });
    if (result.status === 'ok') {
        await limitRef.set({ weeklyReview: { manualDate: todayKey } }, { merge: true });
    }
    return result;
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
    // 120s (up from 60): headroom for Opus 4.8 reasoning before the timeout.
    timeoutSeconds: 120,
    memory: '256MB',
    maxInstances: 2,
}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { focus, exerciseLibrary, trainingContext, unit } = data;

    if (!focus) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing workout focus');
    }

    // Spend protection: 5 generated workouts per user per day (admin exempt)
    await enforceAiDailyLimit(userId, 'template', 5);

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
            model: COACH_MODEL,
            // Bumped from 4k: 4k was occasionally truncating mid-JSON when
            // the template had alternatives + weights, producing parse
            // errors that surfaced as "didn't build me a template".
            max_tokens: 12000,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
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

        // With extended thinking enabled, content[0] is a thinking block —
        // we want the visible text. Pull whichever block holds the JSON.
        const rawText = (response.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('\n')
            .trim();

        // Robust JSON extraction: prefer a clean markdown-fence strip, but
        // fall back to "first { … last }" so a stray preamble/postamble
        // doesn't kill the whole template.
        let template;
        try {
            const fenced = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            try {
                template = JSON.parse(fenced);
            } catch (_) {
                const start = fenced.indexOf('{');
                const end = fenced.lastIndexOf('}');
                if (start >= 0 && end > start) {
                    template = JSON.parse(fenced.slice(start, end + 1));
                } else {
                    throw new Error('No JSON object found in response');
                }
            }
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
  "vat": number or null (visceral adipose tissue MASS in lbs/kg),
  "vatVolume": number or null (visceral adipose tissue VOLUME in in³/cm³, if reported),
  "totalWeight": number or null (total body weight at scan),
  "totalLeanMass": number or null (total lean mass),
  "totalFatMass": number or null (total fat mass),
  "totalBMC": number or null (total Bone Mineral Content in lbs/kg — the mass, NOT the T/Z-score),
  "rmr": number or null (Resting Metabolic Rate in calories/day, from a "Supplemental Results" or "RMR" section if present),
  "androidFatPct": number or null (android region body fat %, the lower-abdominal region),
  "gynoidFatPct": number or null (gynoid region body fat %, hips/thighs/buttocks),
  "agRatio": number or null (Android/Gynoid ratio, e.g. 0.71),
  "confidence": {
    "totalBodyFat": 0.0-1.0,
    "regionFat": 0.0-1.0,
    "leanMass": 0.0-1.0,
    "fatMass": 0.0-1.0,
    "boneDensity": 0.0-1.0,
    "vat": 0.0-1.0,
    "totalWeight": 0.0-1.0,
    "rmr": 0.0-1.0,
    "androidGynoid": 0.0-1.0
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
    maxInstances: 2,
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

    // Spend protection: 5 DEXA extractions per user per day (admin exempt)
    await enforceAiDailyLimit(userId, 'dexa', 5);

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
            model: COACH_MODEL,
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
