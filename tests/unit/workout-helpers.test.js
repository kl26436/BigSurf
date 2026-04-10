// Tests for workout display helpers
import { describe, it, expect } from 'vitest';
import { getExerciseName, getWorkoutDisplayName } from '../../js/core/utils/workout-helpers.js';

describe('getExerciseName', () => {
    it('returns exercise.name when available', () => {
        expect(getExerciseName({ name: 'Bench Press' })).toBe('Bench Press');
    });

    it('falls back to exercise.machine', () => {
        expect(getExerciseName({ machine: 'Lat Pulldown' })).toBe('Lat Pulldown');
    });

    it('falls back to exercise.exercise', () => {
        expect(getExerciseName({ exercise: 'Squat' })).toBe('Squat');
    });

    it('returns "Unknown Exercise" for empty object', () => {
        expect(getExerciseName({})).toBe('Unknown Exercise');
    });

    it('returns "Unknown Exercise" for null', () => {
        expect(getExerciseName(null)).toBe('Unknown Exercise');
    });

    it('returns "Unknown Exercise" for undefined', () => {
        expect(getExerciseName(undefined)).toBe('Unknown Exercise');
    });

    it('prefers name over machine', () => {
        expect(getExerciseName({ name: 'Bench', machine: 'Chest Press' })).toBe('Bench');
    });
});

describe('getWorkoutDisplayName', () => {
    it('returns workout.name when available', () => {
        expect(getWorkoutDisplayName({ name: 'Push Day' })).toBe('Push Day');
    });

    it('falls back to workout.day', () => {
        expect(getWorkoutDisplayName({ day: 'Monday Push' })).toBe('Monday Push');
    });

    it('falls back to workout.workoutType', () => {
        expect(getWorkoutDisplayName({ workoutType: 'Chest' })).toBe('Chest');
    });

    it('returns "Unnamed" for empty object', () => {
        expect(getWorkoutDisplayName({})).toBe('Unnamed');
    });

    it('returns "Unnamed" for null', () => {
        expect(getWorkoutDisplayName(null)).toBe('Unnamed');
    });
});
