/**
 * Migration Script: Single Workout Per Day → Multiple Workouts Per Day
 *
 * This script migrates existing workouts from using date as document ID
 * to using auto-generated unique IDs with date as a field.
 *
 * OLD SCHEMA:
 *   users/{userId}/workouts/{YYYY-MM-DD} → { workoutType, date, ... }
 *
 * NEW SCHEMA:
 *   users/{userId}/workouts/{uniqueId} → { workoutType, date, ... }
 *
 * The migration:
 * 1. Reads all existing workouts
 * 2. Creates new documents with unique IDs (preserving all data)
 * 3. Adds a 'migrated' flag and 'originalId' for tracking
 * 4. Does NOT delete old documents (safe rollback)
 *
 * After testing, you can run cleanup to remove old date-based documents.
 */

import { db, collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from './firebase-config.js';

/**
 * Check if a workout document uses the old schema (date as ID)
 */
function isOldSchemaDoc(docId) {
    // Old schema: YYYY-MM-DD format
    return /^\d{4}-\d{2}-\d{2}$/.test(docId);
}

/**
 * Generate a unique workout ID
 * Format: {date}_{timestamp}_{random}
 */
function generateWorkoutId(date) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${date}_${timestamp}_${random}`;
}

/**
 * Analyze current workouts and report status
 */
export async function analyzeWorkouts(userId) {
    if (!userId) {
        console.error('❌ No user ID provided');
        return null;
    }

    console.log('📊 Analyzing workout data...');

    const workoutsRef = collection(db, "users", userId, "workouts");
    const q = query(workoutsRef, orderBy("date", "desc"));
    const snapshot = await getDocs(q);

    const analysis = {
        total: 0,
        oldSchema: [],
        newSchema: [],
        needsMigration: false
    };

    snapshot.forEach((docSnap) => {
        analysis.total++;
        const data = docSnap.data();

        if (isOldSchemaDoc(docSnap.id)) {
            analysis.oldSchema.push({
                id: docSnap.id,
                date: data.date,
                workoutType: data.workoutType,
                completedAt: data.completedAt,
                migrated: data.migrated || false
            });
        } else {
            analysis.newSchema.push({
                id: docSnap.id,
                date: data.date,
                workoutType: data.workoutType,
                completedAt: data.completedAt
            });
        }
    });

    analysis.needsMigration = analysis.oldSchema.length > 0;

    console.log('📊 Analysis Results:');
    console.log(`   Total workouts: ${analysis.total}`);
    console.log(`   Old schema (date as ID): ${analysis.oldSchema.length}`);
    console.log(`   New schema (unique ID): ${analysis.newSchema.length}`);
    console.log(`   Needs migration: ${analysis.needsMigration}`);

    if (analysis.oldSchema.length > 0) {
        console.log('\n📋 Old schema workouts:');
        analysis.oldSchema.forEach(w => {
            console.log(`   - ${w.id}: ${w.workoutType} (completed: ${w.completedAt ? 'yes' : 'no'})`);
        });
    }

    return analysis;
}

/**
 * Migrate workouts from old schema to new schema
 * This creates NEW documents with unique IDs, does NOT delete old ones
 */
export async function migrateWorkouts(userId, dryRun = true) {
    if (!userId) {
        console.error('❌ No user ID provided');
        return { success: false, error: 'No user ID' };
    }

    console.log(`\n🔄 ${dryRun ? '[DRY RUN] ' : ''}Starting migration...`);

    const analysis = await analyzeWorkouts(userId);

    if (!analysis.needsMigration) {
        console.log('✅ No migration needed - all workouts already use new schema');
        return { success: true, migrated: 0, skipped: 0 };
    }

    const results = {
        success: true,
        migrated: 0,
        skipped: 0,
        errors: []
    };

    for (const oldWorkout of analysis.oldSchema) {
        // Skip if already migrated (has a corresponding new document)
        if (oldWorkout.migrated) {
            console.log(`   ⏭️ Skipping ${oldWorkout.id} - already migrated`);
            results.skipped++;
            continue;
        }

        try {
            // Read full workout data
            const oldDocRef = doc(db, "users", userId, "workouts", oldWorkout.id);
            const oldDocSnap = await getDocs(query(collection(db, "users", userId, "workouts")));

            let workoutData = null;
            oldDocSnap.forEach((d) => {
                if (d.id === oldWorkout.id) {
                    workoutData = d.data();
                }
            });

            if (!workoutData) {
                console.log(`   ⚠️ Could not read data for ${oldWorkout.id}`);
                results.errors.push({ id: oldWorkout.id, error: 'Could not read data' });
                continue;
            }

            // Generate new unique ID
            const newId = generateWorkoutId(workoutData.date);

            // Prepare migrated document
            const migratedData = {
                ...workoutData,
                originalId: oldWorkout.id,  // Track where it came from
                migratedAt: new Date().toISOString(),
                schemaVersion: '3.0'  // Mark as new schema
            };

            if (dryRun) {
                console.log(`   📝 Would migrate: ${oldWorkout.id} → ${newId}`);
                console.log(`      Date: ${workoutData.date}, Type: ${workoutData.workoutType}`);
            } else {
                // Create new document with unique ID
                const newDocRef = doc(db, "users", userId, "workouts", newId);
                await setDoc(newDocRef, migratedData);

                // Mark old document as migrated (don't delete yet)
                const updatedOldData = {
                    ...workoutData,
                    migrated: true,
                    migratedTo: newId,
                    migratedAt: new Date().toISOString()
                };
                await setDoc(oldDocRef, updatedOldData);

                console.log(`   ✅ Migrated: ${oldWorkout.id} → ${newId}`);
            }

            results.migrated++;
        } catch (error) {
            console.error(`   ❌ Error migrating ${oldWorkout.id}:`, error);
            results.errors.push({ id: oldWorkout.id, error: error.message });
            results.success = false;
        }
    }

    console.log(`\n📊 Migration ${dryRun ? '(DRY RUN) ' : ''}Results:`);
    console.log(`   Migrated: ${results.migrated}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors.length}`);

    return results;
}

/**
 * Clean up old schema documents AFTER successful migration
 * Only run this after verifying the migration worked correctly!
 */
export async function cleanupOldWorkouts(userId, dryRun = true) {
    if (!userId) {
        console.error('❌ No user ID provided');
        return { success: false, error: 'No user ID' };
    }

    console.log(`\n🧹 ${dryRun ? '[DRY RUN] ' : ''}Starting cleanup of old documents...`);

    const workoutsRef = collection(db, "users", userId, "workouts");
    const snapshot = await getDocs(workoutsRef);

    const results = {
        success: true,
        deleted: 0,
        skipped: 0,
        errors: []
    };

    for (const docSnap of snapshot.docs) {
        // Only process old schema documents that have been migrated
        if (isOldSchemaDoc(docSnap.id)) {
            const data = docSnap.data();

            if (data.migrated && data.migratedTo) {
                if (dryRun) {
                    console.log(`   📝 Would delete: ${docSnap.id} (migrated to ${data.migratedTo})`);
                } else {
                    try {
                        await deleteDoc(doc(db, "users", userId, "workouts", docSnap.id));
                        console.log(`   🗑️ Deleted: ${docSnap.id}`);
                        results.deleted++;
                    } catch (error) {
                        console.error(`   ❌ Error deleting ${docSnap.id}:`, error);
                        results.errors.push({ id: docSnap.id, error: error.message });
                    }
                }
            } else {
                console.log(`   ⏭️ Skipping ${docSnap.id} - not yet migrated`);
                results.skipped++;
            }
        }
    }

    console.log(`\n📊 Cleanup ${dryRun ? '(DRY RUN) ' : ''}Results:`);
    console.log(`   Deleted: ${results.deleted}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors.length}`);

    return results;
}

/**
 * Rollback migration - restore old documents, remove new ones
 * Use this if something goes wrong!
 */
export async function rollbackMigration(userId, dryRun = true) {
    if (!userId) {
        console.error('❌ No user ID provided');
        return { success: false, error: 'No user ID' };
    }

    console.log(`\n⏪ ${dryRun ? '[DRY RUN] ' : ''}Starting rollback...`);

    const workoutsRef = collection(db, "users", userId, "workouts");
    const snapshot = await getDocs(workoutsRef);

    const results = {
        restoredOld: 0,
        deletedNew: 0,
        errors: []
    };

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        // Restore old documents (remove migrated flag)
        if (isOldSchemaDoc(docSnap.id) && data.migrated) {
            if (dryRun) {
                console.log(`   📝 Would restore: ${docSnap.id}`);
            } else {
                try {
                    const { migrated, migratedTo, migratedAt, ...originalData } = data;
                    await setDoc(doc(db, "users", userId, "workouts", docSnap.id), originalData);
                    console.log(`   ✅ Restored: ${docSnap.id}`);
                    results.restoredOld++;
                } catch (error) {
                    results.errors.push({ id: docSnap.id, error: error.message });
                }
            }
        }

        // Delete new schema documents that were created during migration
        if (!isOldSchemaDoc(docSnap.id) && data.originalId) {
            if (dryRun) {
                console.log(`   📝 Would delete migrated doc: ${docSnap.id}`);
            } else {
                try {
                    await deleteDoc(doc(db, "users", userId, "workouts", docSnap.id));
                    console.log(`   🗑️ Deleted: ${docSnap.id}`);
                    results.deletedNew++;
                } catch (error) {
                    results.errors.push({ id: docSnap.id, error: error.message });
                }
            }
        }
    }

    console.log(`\n📊 Rollback ${dryRun ? '(DRY RUN) ' : ''}Results:`);
    console.log(`   Restored old docs: ${results.restoredOld}`);
    console.log(`   Deleted new docs: ${results.deletedNew}`);
    console.log(`   Errors: ${results.errors.length}`);

    return results;
}

// Export functions to window for console testing
if (typeof window !== 'undefined') {
    window.workoutMigration = {
        analyze: analyzeWorkouts,
        migrate: migrateWorkouts,
        cleanup: cleanupOldWorkouts,
        rollback: rollbackMigration
    };

    console.log('🔧 Workout Migration Tools loaded. Available commands:');
    console.log('   workoutMigration.analyze(userId) - Analyze current workout data');
    console.log('   workoutMigration.migrate(userId, dryRun=true) - Migrate to new schema');
    console.log('   workoutMigration.cleanup(userId, dryRun=true) - Delete old documents');
    console.log('   workoutMigration.rollback(userId, dryRun=true) - Undo migration');
}
