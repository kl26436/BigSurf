// UX-1: equipment-aware exercise stats + labeled trend chart.
// Real-source import of aggregators (ui-helpers mocked for convertWeight,
// which is identity here so the math is unit-agnostic) and the pure chartTrend.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: vi.fn((w) => w),
    showNotification: vi.fn(),
    escapeHtml: vi.fn((s) => s),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import {
    aggregateExerciseStats,
    exerciseEquipmentCounts,
} from '../../js/core/features/metrics/aggregators.js';
import { chartTrend } from '../../js/core/features/charts/chart-trend.js';

// Leg Press logged across two machines. "All machines" mixes them; filtering
// to one machine should yield an honest, machine-scoped trend.
const workouts = [
    { date: '2026-06-01', location: 'Downtown Gym', exercises: { e0: { name: 'Leg Press', equipment: 'Cybex sled', sets: [{ weight: 300, reps: 10 }, { weight: 320, reps: 8 }] } } },
    { date: '2026-06-08', location: 'Downtown Gym', exercises: { e0: { name: 'Leg Press', equipment: 'Hammer Strength', sets: [{ weight: 360, reps: 8 }, { weight: 390, reps: 6 }] } } },
    { date: '2026-06-15', location: 'Downtown Gym', exercises: { e0: { name: 'Leg Press', equipment: 'Cybex sled', sets: [{ weight: 330, reps: 10 }] } } },
    { date: '2026-06-22', location: 'Downtown Gym', exercises: { e0: { name: 'Leg Press', equipment: 'Hammer Strength', sets: [{ weight: 410, reps: 6 }] } } },
    // A cancelled session must be ignored everywhere.
    { date: '2026-06-25', cancelledAt: '2026-06-25T10:00:00Z', exercises: { e0: { name: 'Leg Press', equipment: 'Cybex sled', sets: [{ weight: 999, reps: 5 }] } } },
];

beforeEach(() => {
    AppState.globalUnit = 'lbs';
});

describe('exerciseEquipmentCounts', () => {
    it('counts sessions per machine, ignoring cancelled workouts', () => {
        const { total, byEquipment } = exerciseEquipmentCounts(workouts, 'Leg Press', 'All');
        expect(total).toBe(4);
        expect(byEquipment).toHaveLength(2);
        const byName = Object.fromEntries(byEquipment.map(e => [e.equipment, e.count]));
        expect(byName['Cybex sled']).toBe(2);
        expect(byName['Hammer Strength']).toBe(2);
    });

    it('returns empty for an exercise never logged', () => {
        expect(exerciseEquipmentCounts(workouts, 'Nonexistent', 'All'))
            .toEqual({ total: 0, byEquipment: [] });
    });
});

describe('aggregateExerciseStats equipment filter', () => {
    it('combined view spans all machines (max from Hammer Strength)', () => {
        const s = aggregateExerciseStats(workouts, 'Leg Press', 'All');
        expect(s.maxWeight).toBe(410);
        expect(s.sessions).toHaveLength(4);
        expect(s.trend).toHaveLength(4);
        // Trend points carry equipment for machine-change markers.
        expect(s.trend.every(p => 'equipment' in p)).toBe(true);
    });

    it('filtering to one machine narrows the trend honestly', () => {
        const cybex = aggregateExerciseStats(workouts, 'Leg Press', 'All', 'Cybex sled');
        expect(cybex.sessions).toHaveLength(2);
        expect(cybex.maxWeight).toBe(330);
        expect(cybex.sessions.every(sess => sess.equipment === 'Cybex sled')).toBe(true);

        const hammer = aggregateExerciseStats(workouts, 'Leg Press', 'All', 'Hammer Strength');
        expect(hammer.sessions).toHaveLength(2);
        expect(hammer.maxWeight).toBe(410);
    });

    it('best sets carry date, location, and equipment for the row meta', () => {
        const s = aggregateExerciseStats(workouts, 'Leg Press', 'All');
        const top = s.topSets[0];
        expect(top.date).toBeTruthy();
        expect(top.location).toBe('Downtown Gym');
        expect(top.equipment).toBeTruthy();
    });

    it('the empty (no equipment) filter is distinct from all-machines', () => {
        // No session logged Leg Press with a blank equipment, so '' yields none.
        const none = aggregateExerciseStats(workouts, 'Leg Press', 'All', '');
        expect(none.sessions).toHaveLength(0);
        expect(none.maxWeight).toBe(0);
    });
});

describe('chartTrend', () => {
    const points = [
        { y: 300, date: '2026-04-06', equipment: 'Hammer Strength' },
        { y: 360, date: '2026-05-01', equipment: 'Cybex sled' },
        { y: 410, date: '2026-06-29', equipment: 'Hammer Strength' },
    ];

    it('renders crisp axis labels (y min/max + start/end dates)', () => {
        const svg = chartTrend({ points, color: 'var(--primary)', unit: 'lb' });
        expect(svg).toContain('>410<'); // y max
        expect(svg).toContain('>300<'); // y min
        expect(svg).toContain('Apr 6');  // x start
        expect(svg).toContain('Jun 29'); // x end
    });

    it('is accessible (role=img with a descriptive aria-label)', () => {
        const svg = chartTrend({ points, color: 'var(--primary)', unit: 'lb' });
        expect(svg).toContain('role="img"');
        expect(svg).toMatch(/aria-label="[^"]*300[^"]*410[^"]*lb/);
    });

    it('marks machine-change points when markChanges is on', () => {
        const withMarks = chartTrend({ points, color: 'var(--primary)', markChanges: true });
        const withoutMarks = chartTrend({ points, color: 'var(--primary)', markChanges: false });
        // Interior machine-change points add extra <circle>s.
        const count = (str) => (str.match(/<circle/g) || []).length;
        expect(count(withMarks)).toBeGreaterThan(count(withoutMarks));
    });

    it('returns an empty svg for no points', () => {
        expect(chartTrend({ points: [], color: 'x' })).toBe('<svg></svg>');
    });
});
