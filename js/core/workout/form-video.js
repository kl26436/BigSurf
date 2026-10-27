// Form video helpers — core/workout/form-video.js
//
// The two live pieces of the retired v1 exercise cards (exercise-ui.js,
// deleted in UD-6): the active workout's form-video viewer and its cog-menu
// lookup use them.

import { AppState } from '../utils/app-state.js';

/** A YouTube watch / share / shorts link as an embeddable URL; anything else as-is. */
export function convertYouTubeUrl(url) {
    if (!url) return url;

    const pattern = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(pattern);
    if (match) {
        return `https://www.youtube.com/embed/${match[1]}`;
    }

    return url; // Return as-is if not YouTube
}

/**
 * Resolve the best form video for a given exercise + equipment combination.
 * Priority: equipment-specific > equipment general > exercise default > null
 *
 * @param {string} exerciseName
 * @param {string|null} equipmentName
 * @returns {Promise<{url: string|null, source: 'equipment'|'exercise'|null, label: string|null}>}
 */
export async function resolveFormVideo(exerciseName, equipmentName) {
    // 1. Try equipment-specific video
    if (equipmentName) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const allEquipment = await workoutManager.getUserEquipment();
            const equipment = allEquipment.find(eq => eq.name === equipmentName);

            if (equipment) {
                // Priority 1: per-exercise video on this equipment
                if (equipment.exerciseVideos?.[exerciseName]) {
                    return {
                        url: equipment.exerciseVideos[exerciseName],
                        source: 'equipment',
                        label: `Video for ${equipmentName}`,
                    };
                }
                // Priority 2: general equipment video
                if (equipment.video) {
                    return {
                        url: equipment.video,
                        source: 'equipment',
                        label: `Video for ${equipmentName}`,
                    };
                }
            }
        } catch (error) {
            console.error('Error resolving equipment video:', error);
        }
    }

    // 2. Try exercise default video from library
    const exerciseDb = AppState.exerciseDatabase || [];
    const exerciseDef = exerciseDb.find(ex => (ex.name || ex.machine) === exerciseName);
    if (exerciseDef?.video) {
        return {
            url: exerciseDef.video,
            source: 'exercise',
            label: `Default ${exerciseName} form`,
        };
    }

    // 3. No video
    return { url: null, source: null, label: null };
}
