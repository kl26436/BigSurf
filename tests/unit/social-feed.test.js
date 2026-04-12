// Tests for social feed features (Phase 14.6)
// Verifies feed item creation, highlight extraction, and privacy filtering

import { describe, it, expect } from 'vitest';

/**
 * Extract workout highlights for feed display.
 */
function extractWorkoutHighlights(workout) {
    if (!workout) return { exerciseCount: 0, totalVolume: 0, prs: [] };

    const exercises = workout.exercises || {};
    let exerciseCount = Object.keys(exercises).length;
    let totalVolume = 0;
    const prs = [];

    for (const key of Object.keys(exercises)) {
        const ex = exercises[key];
        if (!ex || !ex.sets) continue;
        for (const set of ex.sets) {
            if (set && set.weight > 0 && set.reps > 0) {
                totalVolume += set.weight * set.reps;
            }
            if (set && set.isPR) {
                prs.push({
                    exercise: ex.name || 'Unknown',
                    weight: set.weight,
                    reps: set.reps,
                });
            }
        }
    }

    return { exerciseCount, totalVolume, prs };
}

/**
 * Create a feed item from a completed workout.
 */
function createFeedItem(workout, userId, userProfile) {
    const highlights = extractWorkoutHighlights(workout);
    return {
        userId,
        userName: userProfile?.displayName || 'Anonymous',
        userPhoto: userProfile?.photoURL || null,
        workoutType: workout.workoutType,
        date: workout.date,
        highlights,
        timestamp: new Date().toISOString(),
        privacy: userProfile?.feedPrivacy || 'friends',
    };
}

/**
 * Filter feed items by viewer's relationship to each item's author.
 * @param {Array} feedItems
 * @param {string} viewerId - Current user's ID
 * @param {Set<string>} following - Set of user IDs the viewer follows
 * @returns {Array} Filtered items visible to the viewer
 */
function filterFeedByPrivacy(feedItems, viewerId, following = new Set()) {
    if (!feedItems) return [];
    return feedItems.filter(item => {
        if (item.privacy === 'public') return true;
        if (item.userId === viewerId) return true; // Own items always visible
        if (item.privacy === 'friends' && following.has(item.userId)) return true;
        return false;
    });
}

// ===================================================================
// TESTS
// ===================================================================

describe('extractWorkoutHighlights', () => {
    it('extracts correct exercise count and volume', () => {
        const workout = {
            exercises: {
                exercise_0: {
                    name: 'Bench Press',
                    sets: [{ weight: 135, reps: 10 }, { weight: 155, reps: 8 }],
                },
                exercise_1: {
                    name: 'Cable Fly',
                    sets: [{ weight: 30, reps: 12 }],
                },
            },
        };
        const highlights = extractWorkoutHighlights(workout);
        expect(highlights.exerciseCount).toBe(2);
        expect(highlights.totalVolume).toBe(135 * 10 + 155 * 8 + 30 * 12);
        expect(highlights.prs).toEqual([]);
    });

    it('captures PRs from sets', () => {
        const workout = {
            exercises: {
                exercise_0: {
                    name: 'Squat',
                    sets: [{ weight: 315, reps: 1, isPR: true }],
                },
            },
        };
        const highlights = extractWorkoutHighlights(workout);
        expect(highlights.prs).toHaveLength(1);
        expect(highlights.prs[0]).toEqual({ exercise: 'Squat', weight: 315, reps: 1 });
    });

    it('handles null workout', () => {
        expect(extractWorkoutHighlights(null)).toEqual({ exerciseCount: 0, totalVolume: 0, prs: [] });
    });

    it('handles workout with no exercises', () => {
        expect(extractWorkoutHighlights({})).toEqual({ exerciseCount: 0, totalVolume: 0, prs: [] });
    });
});

describe('createFeedItem', () => {
    it('produces correct structure with highlights', () => {
        const workout = {
            workoutType: 'Push Day',
            date: '2026-04-10',
            exercises: {
                exercise_0: { name: 'Bench', sets: [{ weight: 135, reps: 10 }] },
            },
        };
        const profile = { displayName: 'Kevin', photoURL: 'https://example.com/photo.jpg', feedPrivacy: 'public' };
        const item = createFeedItem(workout, 'user123', profile);

        expect(item.userId).toBe('user123');
        expect(item.userName).toBe('Kevin');
        expect(item.userPhoto).toBe('https://example.com/photo.jpg');
        expect(item.workoutType).toBe('Push Day');
        expect(item.date).toBe('2026-04-10');
        expect(item.privacy).toBe('public');
        expect(item.highlights.exerciseCount).toBe(1);
        expect(item.highlights.totalVolume).toBe(1350);
        expect(item.timestamp).toBeDefined();
    });

    it('defaults privacy to friends when not set', () => {
        const item = createFeedItem({ workoutType: 'Push', date: '2026-04-10' }, 'user1', {});
        expect(item.privacy).toBe('friends');
    });

    it('defaults userName to Anonymous when profile missing', () => {
        const item = createFeedItem({ workoutType: 'Push', date: '2026-04-10' }, 'user1', null);
        expect(item.userName).toBe('Anonymous');
    });
});

describe('filterFeedByPrivacy', () => {
    const feedItems = [
        { userId: 'alice', privacy: 'public', workoutType: 'Push' },
        { userId: 'bob', privacy: 'friends', workoutType: 'Pull' },
        { userId: 'charlie', privacy: 'private', workoutType: 'Legs' },
        { userId: 'viewer', privacy: 'private', workoutType: 'Arms' },
    ];

    it('shows public items to everyone', () => {
        const result = filterFeedByPrivacy(feedItems, 'viewer', new Set());
        const types = result.map(i => i.workoutType);
        expect(types).toContain('Push'); // alice's public post
    });

    it('shows friends items only when following', () => {
        const following = new Set(['bob']);
        const result = filterFeedByPrivacy(feedItems, 'viewer', following);
        const types = result.map(i => i.workoutType);
        expect(types).toContain('Pull'); // bob is followed
    });

    it('hides friends items when not following', () => {
        const result = filterFeedByPrivacy(feedItems, 'viewer', new Set());
        const types = result.map(i => i.workoutType);
        expect(types).not.toContain('Pull'); // bob not followed
    });

    it('hides private items from others', () => {
        const result = filterFeedByPrivacy(feedItems, 'viewer', new Set(['charlie']));
        const types = result.map(i => i.workoutType);
        expect(types).not.toContain('Legs'); // charlie's private post
    });

    it('always shows own items regardless of privacy', () => {
        const result = filterFeedByPrivacy(feedItems, 'viewer', new Set());
        const types = result.map(i => i.workoutType);
        expect(types).toContain('Arms'); // viewer's own private post
    });

    it('handles null input', () => {
        expect(filterFeedByPrivacy(null, 'viewer')).toEqual([]);
    });
});
