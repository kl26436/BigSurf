// Mock workout documents for testing
// Covers various schema versions, states, and edge cases

/**
 * Normal completed workout - all sets filled, new schema ID
 */
export const completedWorkout = {
    id: '2025-06-15_1718467200000_abc123def456',
    workoutType: 'Chest \u2013 Push',
    date: '2025-06-15',
    startedAt: '2025-06-15T10:30:00.000Z',
    completedAt: '2025-06-15T11:45:00.000Z',
    cancelledAt: null,
    totalDuration: 4500,
    location: 'Downtown Gym',
    exercises: {
        exercise_0: {
            name: 'Bench Press',
            equipment: 'Hammer Strength Flat',
            sets: [
                { reps: 10, weight: 135, originalUnit: 'lbs' },
                { reps: 8, weight: 155, originalUnit: 'lbs' },
                { reps: 6, weight: 175, originalUnit: 'lbs' },
            ],
            notes: 'Felt strong today',
            completed: true,
        },
        exercise_1: {
            name: 'Incline Dumbbell Press',
            equipment: 'Dumbbells',
            sets: [
                { reps: 12, weight: 50, originalUnit: 'lbs' },
                { reps: 10, weight: 55, originalUnit: 'lbs' },
            ],
            notes: '',
            completed: true,
        },
    },
    exerciseNames: {
        exercise_0: 'Bench Press',
        exercise_1: 'Incline Dumbbell Press',
    },
    version: '3.0',
    lastUpdated: '2025-06-15T11:45:00.000Z',
};

/**
 * Cancelled workout - no completed exercises
 */
export const cancelledWorkout = {
    id: '2025-06-14_1718380800000_xyz789ghi012',
    workoutType: 'Back \u2013 Pull',
    date: '2025-06-14',
    startedAt: '2025-06-14T09:00:00.000Z',
    completedAt: null,
    cancelledAt: '2025-06-14T09:05:00.000Z',
    totalDuration: 300,
    location: 'Downtown Gym',
    exercises: {},
    exerciseNames: {},
    version: '3.0',
    lastUpdated: '2025-06-14T09:05:00.000Z',
};

/**
 * Old schema workout - document ID is the date itself (pre-v3.0)
 */
export const oldSchemaWorkout = {
    id: '2025-06-15',
    workoutType: 'Legs \u2013 Squat',
    date: '2025-06-15',
    startedAt: '2025-06-15T14:00:00.000Z',
    completedAt: '2025-06-15T15:30:00.000Z',
    cancelledAt: null,
    totalDuration: 5400,
    location: 'Home Gym',
    exercises: {
        exercise_0: {
            name: 'Barbell Squat',
            equipment: 'Barbell',
            sets: [
                { reps: 8, weight: 225, originalUnit: 'lbs' },
                { reps: 6, weight: 245, originalUnit: 'lbs' },
            ],
            notes: '',
            completed: true,
        },
    },
    exerciseNames: {
        exercise_0: 'Barbell Squat',
    },
    version: '2.0',
    lastUpdated: '2025-06-15T15:30:00.000Z',
};

/**
 * New schema workout - unique ID with date field
 */
export const newSchemaWorkout = {
    id: '2025-06-15_1718467200000_abc123def456',
    workoutType: 'Chest \u2013 Push',
    date: '2025-06-15',
    startedAt: '2025-06-15T10:30:00.000Z',
    completedAt: '2025-06-15T11:45:00.000Z',
    cancelledAt: null,
    totalDuration: 4500,
    location: 'Downtown Gym',
    exercises: {
        exercise_0: {
            name: 'Bench Press',
            equipment: 'Hammer Strength Flat',
            sets: [
                { reps: 10, weight: 135, originalUnit: 'lbs' },
            ],
            notes: '',
            completed: true,
        },
    },
    exerciseNames: {
        exercise_0: 'Bench Press',
    },
    version: '3.0',
    lastUpdated: '2025-06-15T11:45:00.000Z',
};

/**
 * Mixed units workout - exercises with both lbs and kg
 */
export const mixedUnitsWorkout = {
    id: '2025-06-16_1718553600000_mix456units78',
    workoutType: 'Full Body',
    date: '2025-06-16',
    startedAt: '2025-06-16T08:00:00.000Z',
    completedAt: '2025-06-16T09:30:00.000Z',
    cancelledAt: null,
    totalDuration: 5400,
    location: 'Downtown Gym',
    exercises: {
        exercise_0: {
            name: 'Bench Press',
            equipment: 'Barbell',
            sets: [
                { reps: 10, weight: 135, originalUnit: 'lbs' },
                { reps: 8, weight: 155, originalUnit: 'lbs' },
            ],
            notes: '',
            completed: true,
        },
        exercise_1: {
            name: 'Deadlift',
            equipment: 'Barbell',
            sets: [
                { reps: 5, weight: 100, originalUnit: 'kg' },
                { reps: 5, weight: 120, originalUnit: 'kg' },
            ],
            notes: 'Using kg plates at this gym',
            completed: true,
        },
    },
    exerciseNames: {
        exercise_0: 'Bench Press',
        exercise_1: 'Deadlift',
    },
    version: '3.0',
    lastUpdated: '2025-06-16T09:30:00.000Z',
};

/**
 * Boundary workout - Sunday night, end of month (June 30)
 * Tests date boundary handling
 */
export const boundaryWorkout = {
    id: '2025-06-30_1719705600000_sun999end012',
    workoutType: 'Arms',
    date: '2025-06-30',
    startedAt: '2025-06-30T23:00:00.000Z',
    completedAt: '2025-07-01T00:15:00.000Z',
    cancelledAt: null,
    totalDuration: 4500,
    location: 'Home Gym',
    exercises: {
        exercise_0: {
            name: 'Bicep Curl',
            equipment: 'Dumbbells',
            sets: [
                { reps: 12, weight: 30, originalUnit: 'lbs' },
                { reps: 10, weight: 35, originalUnit: 'lbs' },
            ],
            notes: 'Late night session',
            completed: true,
        },
    },
    exerciseNames: {
        exercise_0: 'Bicep Curl',
    },
    version: '3.0',
    lastUpdated: '2025-07-01T00:15:00.000Z',
};

/**
 * All mock workouts as an array for convenience
 */
export const allMockWorkouts = [
    completedWorkout,
    cancelledWorkout,
    oldSchemaWorkout,
    newSchemaWorkout,
    mixedUnitsWorkout,
    boundaryWorkout,
];
