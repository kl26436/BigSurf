// Schema Migration Module - core/schema-migration.js
// Handles automatic migration of workout data to schema v3.0
// - Old schema: document ID = date (YYYY-MM-DD), one workout per day
// - New schema: document ID = unique ID, date stored as field, multiple workouts per day

import { db, doc, setDoc, getDoc, deleteDoc, collection, getDocs } from './firebase-config.js';

/**
 * Generate a unique workout ID for migration
 * Format: {date}_{timestamp}_{random}
 */
function generateMigrationId(date, index = 0) {
    const timestamp = Date.now() + index; // Add index to ensure uniqueness
    const random = Math.random().toString(36).substring(2, 8);
    return `${date}_${timestamp}_${random}`;
}

/**
 * Check if a document ID uses the old schema (date as ID)
 */
function isOldSchemaDoc(docId) {
    return /^\d{4}-\d{2}-\d{2}$/.test(docId);
}

/**
 * Check if user needs migration
 * Returns true if any workouts use the old schema (date as document ID)
 */
export async function needsMigration(userId) {
    if (!userId) return false;

    try {
        const workoutsRef = collection(db, "users", userId, "workouts");
        const snapshot = await getDocs(workoutsRef);

        let hasOldSchema = false;

        snapshot.forEach((docSnap) => {
            if (isOldSchemaDoc(docSnap.id)) {
                hasOldSchema = true;
            }
        });

        return hasOldSchema;
    } catch (error) {
        console.error('❌ Error checking migration status:', error);
        return false;
    }
}

/**
 * Run migration for a user - converts old schema docs to new schema
 * @param {string} userId - Firebase user ID
 * @param {function} onProgress - Optional callback for progress updates
 * @returns {object} - Migration results { success, migrated, errors }
 */
export async function runMigration(userId, onProgress = null) {
    if (!userId) {
        return { success: false, migrated: 0, errors: ['No user ID provided'] };
    }

    const results = {
        success: true,
        migrated: 0,
        skipped: 0,
        errors: []
    };

    try {
        const workoutsRef = collection(db, "users", userId, "workouts");
        const snapshot = await getDocs(workoutsRef);

        const oldSchemaDocs = [];

        // Find all old schema documents
        snapshot.forEach((docSnap) => {
            if (isOldSchemaDoc(docSnap.id)) {
                oldSchemaDocs.push({
                    id: docSnap.id,
                    data: docSnap.data()
                });
            }
        });

        if (oldSchemaDocs.length === 0) {
            return { success: true, migrated: 0, skipped: 0, errors: [], message: 'No migration needed' };
        }

        if (onProgress) {
            onProgress(`Migrating ${oldSchemaDocs.length} workouts...`);
        }

        // Migrate each document
        for (let i = 0; i < oldSchemaDocs.length; i++) {
            const oldDoc = oldSchemaDocs[i];

            try {
                // Generate new unique ID
                const newId = generateMigrationId(oldDoc.id, i);

                // Create new document with updated schema
                const newData = {
                    ...oldDoc.data,
                    workoutId: newId,
                    date: oldDoc.id, // Ensure date field is set
                    version: '3.0',
                    migratedAt: new Date().toISOString(),
                    migratedFrom: oldDoc.id
                };

                // Write new document
                const newDocRef = doc(db, "users", userId, "workouts", newId);
                await setDoc(newDocRef, newData);

                // Delete old document
                const oldDocRef = doc(db, "users", userId, "workouts", oldDoc.id);
                await deleteDoc(oldDocRef);

                results.migrated++;

                if (onProgress) {
                    onProgress(`Migrated ${results.migrated}/${oldSchemaDocs.length} workouts...`);
                }

            } catch (docError) {
                console.error(`❌ Error migrating document ${oldDoc.id}:`, docError);
                results.errors.push(`Failed to migrate ${oldDoc.id}: ${docError.message}`);
                results.success = false;
            }
        }

    } catch (error) {
        console.error('❌ Migration error:', error);
        results.success = false;
        results.errors.push(`Migration failed: ${error.message}`);
    }

    return results;
}

/**
 * Check and run migration silently on login
 * Only migrates if needed, doesn't interrupt user flow
 */
export async function checkAndMigrateOnLogin(userId) {
    if (!userId) return;

    try {
        const needsUpdate = await needsMigration(userId);

        if (needsUpdate) {
            console.log('📦 Schema migration needed, running in background...');

            const results = await runMigration(userId);

            if (results.success && results.migrated > 0) {
                console.log(`✅ Schema migration complete: ${results.migrated} workouts migrated`);
            } else if (results.errors.length > 0) {
                console.error('❌ Schema migration had errors:', results.errors);
            }

            return results;
        } else {
            return { success: true, migrated: 0, message: 'No migration needed' };
        }
    } catch (error) {
        console.error('❌ Error during login migration check:', error);
        return { success: false, migrated: 0, errors: [error.message] };
    }
}
