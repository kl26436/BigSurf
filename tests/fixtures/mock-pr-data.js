// Mock PR data structures for testing

/**
 * Realistic PR data with existing records for Bench Press
 */
export const mockPRData = {
    exercisePRs: {
        'Bench Press': {
            bodyPart: 'Chest',
            'Hammer Strength': {
                maxWeight: { weight: 200, reps: 5, date: '2025-06-01', location: 'Downtown Gym' },
                maxReps: { weight: 135, reps: 12, date: '2025-06-01', location: 'Downtown Gym' },
                maxVolume: { weight: 160, reps: 12, volume: 1920, date: '2025-06-01', location: 'Downtown Gym' },
            },
        },
    },
    locations: {
        'Downtown Gym': { name: 'Downtown Gym', lastVisit: '2025-06-01T10:00:00.000Z', visitCount: 10 },
    },
    currentLocation: 'Downtown Gym',
};

/**
 * Empty PR data - no records yet
 */
export const emptyPRData = {
    exercisePRs: {},
    locations: {},
    currentLocation: null,
};

/**
 * PR data with multiple exercises and equipment
 */
export const multiExercisePRData = {
    exercisePRs: {
        'Bench Press': {
            bodyPart: 'Chest',
            'Barbell': {
                maxWeight: { weight: 225, reps: 5, date: '2025-06-10', location: 'Downtown Gym' },
                maxReps: { weight: 185, reps: 15, date: '2025-06-08', location: 'Downtown Gym' },
                maxVolume: { weight: 205, reps: 10, volume: 2050, date: '2025-06-09', location: 'Downtown Gym' },
            },
            'Hammer Strength': {
                maxWeight: { weight: 200, reps: 5, date: '2025-06-01', location: 'Downtown Gym' },
                maxReps: { weight: 135, reps: 12, date: '2025-06-01', location: 'Downtown Gym' },
                maxVolume: { weight: 160, reps: 12, volume: 1920, date: '2025-06-01', location: 'Downtown Gym' },
            },
        },
        'Squat': {
            bodyPart: 'Legs',
            'Barbell': {
                maxWeight: { weight: 315, reps: 3, date: '2025-06-12', location: 'Home Gym' },
                maxReps: { weight: 225, reps: 10, date: '2025-06-05', location: 'Home Gym' },
                maxVolume: { weight: 275, reps: 8, volume: 2200, date: '2025-06-11', location: 'Home Gym' },
            },
        },
    },
    locations: {
        'Downtown Gym': { name: 'Downtown Gym', lastVisit: '2025-06-10T10:00:00.000Z', visitCount: 20 },
        'Home Gym': { name: 'Home Gym', lastVisit: '2025-06-12T08:00:00.000Z', visitCount: 15 },
    },
    currentLocation: 'Downtown Gym',
};
