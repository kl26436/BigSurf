/**
 * Equipment Catalog — Pre-populated reference database of major gym equipment brands.
 *
 * Structure: Brand → Line → Machines[]
 * Each machine has: name (function), bodyPart, optional type, and — when its
 * function names one movement — `pattern` (LB-5). `pattern` is GENERATED:
 * edit names/body parts here, then re-run `node scripts/stamp-catalog-patterns.mjs`
 * (combos, multi-use stations and ambiguous back extensions stay without one).
 *
 * This is a REFERENCE catalog — not Firestore data. Used in the Add Equipment flow
 * to let users pick from known machines instead of typing everything manually.
 *
 * Sources: Official product pages from each manufacturer, researched April 2026.
 * Users can still add custom brands/lines/machines not in this catalog.
 */

export const EQUIPMENT_CATALOG = [

    // =========================================================================
    // HAMMER STRENGTH (owned by Life Fitness)
    // =========================================================================
    {
        brand: 'Hammer Strength',
        lines: [
            {
                name: 'Plate-Loaded',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Iso-Lateral Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Decline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Super Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Chest/Back', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Iso-Lateral Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Iso-Lateral High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Iso-Lateral Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Iso-Lateral D.Y. Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Iso-Lateral Front Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Iso-Lateral Wide Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Iso-Lateral Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Iso-Lateral Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Linear Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'V-Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum-X Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Glute Drive', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Shrug/Deadlift', bodyPart: 'Back' },
                    { name: 'Gripper', bodyPart: 'Arms' },
                    { name: 'Ground Base Jammer', bodyPart: 'Shoulders' },
                    { name: 'Ground Base Squat/High Pull', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Select',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Fly/Rear Deltoid', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Fixed Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Assist Dip Chin', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Abduction', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Hip Adduction', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Hip and Glute', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Horizontal Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'MTS',
                type: 'Selectorized',
                machines: [
                    { name: 'Iso-Lateral Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Decline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Iso-Lateral Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Iso-Lateral Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Iso-Lateral High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Iso-Lateral Front Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Iso-Lateral Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Iso-Lateral Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Iso-Lateral Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Iso-Lateral Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'HD Elite',
                type: 'Rack',
                machines: [
                    { name: 'Power Rack', bodyPart: 'Multi-Use' },
                    { name: 'Half Rack', bodyPart: 'Multi-Use' },
                    { name: 'Combo Rack', bodyPart: 'Multi-Use' },
                    { name: 'Olympic Flat Bench', bodyPart: 'Chest', type: 'Bench', pattern: 'horizontal-push' },
                    { name: 'Olympic Incline Bench', bodyPart: 'Chest', type: 'Bench', pattern: 'horizontal-push' },
                    { name: 'Olympic Decline Bench', bodyPart: 'Chest', type: 'Bench', pattern: 'horizontal-push' },
                    { name: 'Olympic Military Bench', bodyPart: 'Shoulders', type: 'Bench' },
                ],
            },
        ],
    },

    // =========================================================================
    // PANATTA — Full catalog from panattasport.com (scraped 2026-04-21)
    // =========================================================================
    {
        brand: 'Panatta',
        lines: [
            // -----------------------------------------------------------------
            // FIT EVO — Selectorized (96 products on site, machines only below)
            // -----------------------------------------------------------------
            {
                name: 'Fit Evo',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Vertical Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Vertical Chest Press Circular', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Inclined Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Inclined Chest Press Circular', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    { name: 'Total Press', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Deltoid Press', bodyPart: 'Shoulders' },
                    { name: 'Deltoid Press Circular', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Lateral Deltoids', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Standing Multi Flight', bodyPart: 'Shoulders' },
                    { name: 'Peck Back', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    { name: 'Rotary Cuff', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown Circular', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown Convergent', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown Double Stack', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'High Row Convergent', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pulley Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pulley Row Double Stack', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Rowing Machine Circular', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pullover Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Total Back', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back', pattern: 'trunk-ext' },
                    // Arms
                    { name: 'Curling Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Arm Curl 120', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Arm Curl -45', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Supinating Biceps', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Standing Total Arms', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Standing Total Arms', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'French Press Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Alternate Arm Extension 90', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Alternate Pronating Triceps', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Dips Press', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Dual System Horizontal Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Gluteus Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Master Gluteus Plus', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Hip Adductor', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Abductor Machine', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Adductor Machine', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Adductor/Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Standing Abductor Machine', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Calf Machine', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Upper Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Torsion Machine', bodyPart: 'Core' },
                    // Multi-Use
                    { name: 'Multipurpose Press', bodyPart: 'Multi-Use' },
                    { name: 'Multi Press', bodyPart: 'Multi-Use' },
                    { name: 'Jungle Machine', bodyPart: 'Multi-Use' },
                    { name: 'Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: 'Adjustable Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: 'Smith Machine', bodyPart: 'Multi-Use' },
                    { name: '4-Station Multi Gym', bodyPart: 'Multi-Use' },
                    { name: 'Chin and Dip Counterbalanced', bodyPart: 'Multi-Use' },
                ],
            },
            // -----------------------------------------------------------------
            // SEC — Selectorized (51 products on site)
            // -----------------------------------------------------------------
            {
                name: 'SEC',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Vertical Chest Convergent', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Inclined Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Deltoid Press Convergent', bodyPart: 'Shoulders' },
                    { name: 'Peck Back', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Pulley Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back', pattern: 'trunk-ext' },
                    // Arms
                    { name: 'Curling Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Abductor Machine', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Adductor Machine', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Adductor/Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Calf Machine', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Upper Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    // Multi-Use
                    { name: 'Jungle Machine', bodyPart: 'Multi-Use' },
                    { name: 'Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: 'Adjustable Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: 'Multi Press', bodyPart: 'Multi-Use' },
                    { name: 'Smith Machine', bodyPart: 'Multi-Use' },
                    { name: '4-Station Multi Gym', bodyPart: 'Multi-Use' },
                ],
            },
            // -----------------------------------------------------------------
            // FREEWEIGHT SPECIAL — Plate-Loaded (77 products on site)
            // -----------------------------------------------------------------
            {
                name: 'FreeWeight Special',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Vertical Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Inclined Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Declined Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Horizontal Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Inclined Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Horizontal Multi Press', bodyPart: 'Chest' },
                    { name: 'Super Vertical Multi Press', bodyPart: 'Chest' },
                    { name: 'Super Middle Chest Flight Machine', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Upper Chest Flight Machine', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Super Lower Chest Flight Machine', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Dips Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Dips Press Dual System', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Super Deltoid Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Deltoids', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Back Deltoids', bodyPart: 'Shoulders' },
                    { name: 'Super Shrug Machine', bodyPart: 'Shoulders', pattern: 'shrug' },
                    { name: 'Viking Press and Calf', bodyPart: 'Shoulders' },
                    { name: 'Super Peck Back', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    // Back
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Super Rowing', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Super Rowing Circular', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Super Pullover Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Pullover Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Super Lat Machine Convergent', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Super Lat Pulldown Circular', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Super High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Super Power Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Super Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'T-Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Super Dorsy Bar', bodyPart: 'Back' },
                    { name: 'Front Dorsy Bar', bodyPart: 'Back' },
                    // Arms
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Curling Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Curling Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Four Angle Biceps Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Preacher Curl Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Dip', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Alternate Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Three Angles Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Super French Press Machine', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Press 45°', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Leg Press 45° Dual System', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Leg Press Bridge', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Horizontal Leg Press Dual System', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Vertical Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Squat Machine', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Power Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Super Lunge Machine', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Alternate Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Alternate Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Kneeling Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Super Calf Hack', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Super Seated Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Donkey Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: '3D Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Reverse Hyperextension', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    // Core
                    { name: 'Total Core Crunch Machine', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            // -----------------------------------------------------------------
            // FREEWEIGHT HP — Plate-Loaded (19 products on site, mostly benches)
            // -----------------------------------------------------------------
            {
                name: 'FreeWeight HP',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Jammer', bodyPart: 'Multi-Use' },
                    { name: 'Combo Twist', bodyPart: 'Core', pattern: 'anti-rotation' },
                    { name: 'Squat Lunge', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
            // -----------------------------------------------------------------
            // MONOLITH — Selectorized (47 products on site)
            // -----------------------------------------------------------------
            {
                name: 'Monolith',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Vertical Chest Press Circular', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Inclined Chest Press Circular', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Deltoid Press Circular', bodyPart: 'Shoulders' },
                    { name: 'Lateral Deltoid', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Standing Multi Flight', bodyPart: 'Shoulders' },
                    { name: 'Peck Back', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown Circular', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown Convergent', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'High Row Convergent', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pulley Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Rowing Machine Circular', bodyPart: 'Back' },
                    { name: 'Pullover Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lower Back', bodyPart: 'Back', pattern: 'trunk-ext' },
                    // Arms
                    { name: 'Curling Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Alternate Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Standing Total Arms', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'French Press Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Dips Press', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curling', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Abductor Machine', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Adductor Machine', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Dual Adductor Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Master Gluteus Plus', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Gluteus Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Calf Hack Machine', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    // Multi-Use
                    { name: 'Jungle Machine', bodyPart: 'Multi-Use' },
                    { name: 'Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: 'Adjustable Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: '4-Station Multi Gym', bodyPart: 'Multi-Use' },
                    { name: '2-Station Multi Gym', bodyPart: 'Multi-Use' },
                ],
            },
        ],
    },

    // =========================================================================
    // LIFE FITNESS
    // =========================================================================
    {
        brand: 'Life Fitness',
        lines: [
            {
                name: 'Signature Series',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Abduction', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Hip Adduction', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Cable Motion Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Cable Motion Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                ],
            },
            {
                name: 'Insignia Series',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Glute', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Abduction/Adduction', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Cable Machines',
                type: 'Cable',
                machines: [
                    { name: 'Dual Adjustable Pulley', bodyPart: 'Multi-Use' },
                    { name: 'Cable Crossover', bodyPart: 'Multi-Use' },
                ],
            },
        ],
    },

    // =========================================================================
    // CYBEX
    // =========================================================================
    {
        brand: 'Cybex',
        lines: [
            {
                name: 'Eagle NX',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Overhead Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Rear Delt/Fly', bodyPart: 'Shoulders' },
                    { name: 'Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Arm Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Glute', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Abduction/Adduction', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Prestige',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                ],
            },
            {
                name: 'Bravo',
                type: 'Cable',
                machines: [
                    { name: 'Functional Trainer', bodyPart: 'Multi-Use' },
                    { name: 'Cable Crossover', bodyPart: 'Multi-Use' },
                    { name: 'Adjustable Pulley', bodyPart: 'Multi-Use' },
                ],
            },
        ],
    },

    // =========================================================================
    // TECHNOGYM
    // =========================================================================
    {
        brand: 'Technogym',
        lines: [
            {
                name: 'Selection',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Arm Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Adductor', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Glute Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Calf Machine', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Rotary Torso', bodyPart: 'Core', pattern: 'anti-rotation' },
                    { name: 'Total Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Delts Machine', bodyPart: 'Shoulders' },
                ],
            },
            {
                name: 'Selection 700',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Extension/Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Abductor/Adductor', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Pure Strength',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                ],
            },
            {
                name: 'Biostrength',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Machine', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
        ],
    },

    // =========================================================================
    // NAUTILUS
    // =========================================================================
    {
        brand: 'Nautilus',
        lines: [
            {
                name: 'Inspiration',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Deltoid Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Vertical Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Dip', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Glute Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Abductor/Adductor', bodyPart: 'Legs' },
                    { name: 'Dual Adjustable Pulley', bodyPart: 'Multi-Use', type: 'Cable' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Impact',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
        ],
    },

    // =========================================================================
    // MATRIX (Johnson Health Tech)
    // =========================================================================
    {
        brand: 'Matrix',
        lines: [
            {
                name: 'Magnum',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Vertical Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Supine Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Vertical Decline Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'T-Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Incline Lever Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension Bench', bodyPart: 'Back', pattern: 'hip-dominant' },
                    // Arms
                    { name: 'Elevated Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Standing Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    // Legs
                    { name: '45-Degree Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Reclining Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Seated Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Glute Trainer', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    // Core
                    { name: 'Ab Crunch Bench', bodyPart: 'Core' },
                    // Multi
                    { name: 'Smith Machine', bodyPart: 'Full Body' },
                    { name: 'Power Station', bodyPart: 'Full Body' },
                    { name: 'Squat Rack', bodyPart: 'Full Body' },
                    { name: 'Adjustable Crossover', bodyPart: 'Full Body' },
                    { name: 'Adjustable Pulley', bodyPart: 'Full Body' },
                    { name: 'Lat Pulldown / Low Row', bodyPart: 'Full Body' },
                    { name: 'Glute Ham Bench', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Ultra',
                type: 'Selectorized',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly / Rear Delt', bodyPart: 'Chest' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Independent Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Dependent Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Hip Adductor', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Hip Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Calf Extension', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Glute', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Rotary Torso', bodyPart: 'Core', pattern: 'anti-rotation' },
                ],
            },
            {
                name: 'Aura',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pectoral Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Rear Delt / Pec Fly', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Tricep Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Dip / Chin Assist', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Hip Adductor', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Hip Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Rotary Hip', bodyPart: 'Legs' },
                    { name: 'Calf Press', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Rotary Torso', bodyPart: 'Core', pattern: 'anti-rotation' },
                ],
            },
            {
                name: 'Versa',
                type: 'Selectorized',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly / Rear Delt', bodyPart: 'Chest' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Multi Press', bodyPart: 'Shoulders' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Lat Pulldown / Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Bicep Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Bicep / Tricep', bodyPart: 'Arms' },
                    { name: 'Chin / Dip Assist', bodyPart: 'Arms' },
                    { name: 'Leg Press / Calf Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Extension / Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hip Abductor / Adductor', bodyPart: 'Legs' },
                    { name: 'Glute', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Ab / Low Back', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Go',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Breaker Bench',
                type: 'Bench',
                machines: [
                    { name: 'Flat Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Military Press Bench', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                ],
            },
        ],
    },

    // =========================================================================
    // PRECOR (Amer Sports)
    // =========================================================================
    {
        brand: 'Precor',
        lines: [
            {
                name: 'Discovery',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Incline Lever Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    { name: 'Angled Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Squat Machine', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Smith Machine', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Resolute',
                type: 'Selectorized',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Rear Delt Pec Fly', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Diverging Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Calf Extension', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Inner Thigh', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Outer Thigh', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Inner / Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Glute Extension', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Rotary Torso', bodyPart: 'Core', pattern: 'anti-rotation' },
                    { name: 'Dual Adjustable Pulley', bodyPart: 'Full Body' },
                    { name: 'FTS Glide', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Vitality',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Rear Delt / Pec Fly', bodyPart: 'Shoulders' },
                    { name: 'Multi-Press', bodyPart: 'Shoulders' },
                    { name: 'Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pulldown / Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Biceps Curl / Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Leg Press / Calf Extension', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Curl / Leg Extension', bodyPart: 'Legs' },
                    { name: 'Inner / Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Abdominal / Back Extension', bodyPart: 'Core' },
                ],
            },
        ],
    },

    // =========================================================================
    // MAXPUMP (USA)
    // =========================================================================
    {
        brand: 'MaxPump',
        lines: [
            {
                name: 'P-Loaded',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Seated Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'ISO Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'ISO Decline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'ISO Bench Press Pro', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Crossover Flat Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Crossover Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Dec Fly Pro', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Pec Dec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Multi Flat Chest Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Max Pivot Press', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Supine Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Multi Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Military Shoulder Press Pro', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Crossover Multi Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Seated Rear Deltoid', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    { name: 'Standing Lateral Raise & Fly', bodyPart: 'Shoulders' },
                    { name: 'Seated Lateral Raise & Press', bodyPart: 'Shoulders' },
                    { name: 'Viking Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    // Back
                    { name: 'Classic Wide Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Crossover Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Multi Front Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Classic Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'ISO Lateral Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Middle Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Crossover Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'ISO Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Multi Low Row & Deadlift', bodyPart: 'Back' },
                    { name: 'Multi High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Max Multi Front Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Supported Angle Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pad Support Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Reverse Hyper', bodyPart: 'Back', pattern: 'hip-dominant' },
                    // Arms
                    { name: 'ISO Multi Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Preacher Multi Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Overhead Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Standing Tricep Extension & Dip', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Horizontal Multi Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: '70-Degree Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'ISO Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'ISO Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Squat & Calf', bodyPart: 'Legs' },
                    { name: '3D Safety Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Double Track Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Reverse Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Multi Lunge', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Rotating Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Press', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Max Glute Kickback Pro', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Multi Reverse Glute Ham', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    { name: 'MAX 3D Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Standing Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Multi Deadlift & Shrug', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    // Multi
                    { name: 'ISO Smith', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Evolution',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Decline Chest Press & Pec Dec Superset', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Pec Dec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Ultra ISO Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Ultra ISO Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Ultra ISO Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'ISO Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Shoulder Internal/External Rotation', bodyPart: 'Shoulders' },
                    { name: 'Seated Lateral Raise & Press Superset', bodyPart: 'Shoulders' },
                    { name: 'High Row & Low Row Superset', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Multi Double Back Superset', bodyPart: 'Back' },
                    { name: 'Seated Dual Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Cable Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Ultra ISO Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Preacher Multi Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'ISO Multi Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Standing Multi Rotary Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Max Standing Biceps', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Lying Tricep Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'ISO Tricep Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Tricep Overhead Extension & Dip Superset', bodyPart: 'Arms' },
                    { name: 'Leg Press & Extension Superset', bodyPart: 'Legs' },
                    { name: 'Classic Power Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Max Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing ISO Multi Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Max Lower Abs', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Angle Smith', bodyPart: 'Full Body' },
                    { name: 'Standing Lateral Raise & Fly', bodyPart: 'Shoulders' },
                    { name: 'Pec Dec Fly Pro', bodyPart: 'Chest', pattern: 'horizontal-push' },
                ],
            },
            {
                name: 'Glutemax',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Glute Ham', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Hip Adduction / Abduction Combo', bodyPart: 'Legs' },
                    { name: 'Reverse Hyper', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Squat Station Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'MAX 3D Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Multi Reverse Glute Ham', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Rotating Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Glute Isolator Pro', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Arc Glute Kickback', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Press', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Thrust Rack', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Multi Lunge', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Max Glute Kickback Pro', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Max Lunge Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Standing Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                ],
            },
            {
                name: 'Elite',
                type: 'Selectorized',
                machines: [
                    { name: 'Seated Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Deck Fly with Reverse', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Arm Curl Biceps', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    { name: 'Chin-Up / Dip Assist', bodyPart: 'Arms' },
                    { name: 'Forearm Trainer', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Hip Adduction / Abduction Combo', bodyPart: 'Legs' },
                    { name: 'Glute Ham', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Rotary Torso', bodyPart: 'Core', pattern: 'anti-rotation' },
                    // Combo machines
                    { name: 'Shoulder Press & Chest Press Combo', bodyPart: 'Chest' },
                    { name: 'Lat Pulldown & Seated Row Combo', bodyPart: 'Back' },
                    { name: 'Arms Curl & Extension Combo', bodyPart: 'Arms' },
                    { name: 'Leg Curl & Extension Combo', bodyPart: 'Legs' },
                    { name: 'Abdominal & Lower Back Combo', bodyPart: 'Core' },
                    // Multi-stations
                    { name: 'Multi Functional Trainer', bodyPart: 'Full Body' },
                    { name: '3 Station Cable', bodyPart: 'Full Body' },
                    { name: 'Cable Crossover', bodyPart: 'Full Body' },
                    { name: 'Dual Pulley', bodyPart: 'Full Body' },
                ],
            },
        ],
    },

    // =========================================================================
    // HOIST
    // =========================================================================
    {
        brand: 'Hoist',
        lines: [
            {
                name: 'ROC-IT',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Mid Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Low Back Extension', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: 'Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Press', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
        ],
    },

    // =========================================================================
    // ROGUE (Powerlifting / Home Gym)
    // =========================================================================
    {
        brand: 'Rogue',
        lines: [
            {
                name: 'Monster',
                type: 'Rack',
                machines: [
                    { name: 'Power Rack', bodyPart: 'Multi-Use' },
                    { name: 'Half Rack', bodyPart: 'Multi-Use' },
                    { name: 'Squat Stand', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
            {
                name: 'Barbells',
                type: 'Barbell',
                machines: [
                    { name: 'Ohio Power Bar', bodyPart: 'Multi-Use' },
                    { name: 'Ohio Bar', bodyPart: 'Multi-Use' },
                    { name: 'Ohio Deadlift Bar', bodyPart: 'Back', pattern: 'hip-dominant' },
                    { name: 'Bella Bar', bodyPart: 'Multi-Use' },
                    { name: 'EZ Curl Bar', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Safety Squat Bar', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Trap Bar', bodyPart: 'Multi-Use' },
                ],
            },
            {
                name: 'Benches',
                type: 'Bench',
                machines: [
                    { name: 'Flat Utility Bench', bodyPart: 'Multi-Use' },
                    { name: 'Adjustable Bench', bodyPart: 'Multi-Use' },
                    { name: 'Decline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Competition Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                ],
            },
        ],
    },

    // =========================================================================
    // ARSENAL STRENGTH
    // =========================================================================
    {
        brand: 'Arsenal Strength',
        lines: [
            {
                name: 'Reloaded',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Vertical Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Standing Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'ISO Flat Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'ISO Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: 'Lever Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'ISO Multi Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Vertical Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'T Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Multi Grip Pulldown/High Row', bodyPart: 'Back' },
                    { name: 'ISO Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Linear Smith Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    // Shoulders
                    { name: 'ISO Conv Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Viking Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Linear Smith Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    // Arms
                    { name: 'Tricep Kickback/Dip', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Power Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Linear Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Hack Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Bilateral Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Horizontal Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Linear Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension / Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Glute Bridge', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    // Multi
                    { name: 'Multi Flex', bodyPart: 'Full Body' },
                    { name: 'Posterior Chain Developer', bodyPart: 'Back' },
                ],
            },
            {
                name: 'Forge-X',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Wide Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Upright Decline Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Scorpion High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Diverging Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated ISO Bicep Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Tricep Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Pivot Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
            {
                name: 'M-1',
                type: 'Selectorized',
                machines: [
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Pec Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Bicep Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Overhead Tricep Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Seated Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Inner/Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Glute Isolator', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Donkey Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Functional Trainer', bodyPart: 'Full Body' },
                    { name: 'Basic Trainer', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Alpha',
                type: 'Rack',
                machines: [
                    // Racks
                    { name: 'Power Rack', bodyPart: 'Full Body' },
                    { name: 'Half Rack', bodyPart: 'Full Body' },
                    { name: 'Double Half Rack', bodyPart: 'Full Body' },
                    { name: 'Alpha-7 Power Rack', bodyPart: 'Full Body' },
                    { name: 'Alpha-7 Half Rack', bodyPart: 'Full Body' },
                    { name: 'Alpha-7 Double Half Rack', bodyPart: 'Full Body' },
                    { name: 'Smith Machine', bodyPart: 'Full Body' },
                    { name: 'Combo Rack', bodyPart: 'Full Body' },
                    { name: 'Monolift', bodyPart: 'Full Body' },
                    // Benches
                    { name: 'Olympic Flat Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Olympic Incline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Olympic Decline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Olympic Military Bench', bodyPart: 'Shoulders' },
                    { name: 'Competition Flat Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Adjustable Lumbar Incline Bench', bodyPart: 'Chest' },
                    { name: 'Multi Adjustable Bench', bodyPart: 'Full Body' },
                    { name: 'Flat Bench', bodyPart: 'Full Body' },
                    { name: 'Adjustable Decline Bench', bodyPart: 'Full Body' },
                    // Stations
                    { name: 'Standing Preacher Curl Bench', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Bent-Over Row Bench', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Dumbbell/Row Kickback Bench', bodyPart: 'Back' },
                    { name: '45 Degree Back Extension', bodyPart: 'Back', pattern: 'hip-dominant' },
                    { name: 'Glute/Ham Developer', bodyPart: 'Legs' },
                    { name: 'Sissy Squat Stand', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Vertical Knee Raise/Dip Station', bodyPart: 'Core' },
                    { name: 'Push Pull Sled', bodyPart: 'Full Body' },
                    { name: 'Deadlift Jack', bodyPart: 'Full Body' },
                    { name: 'Squat Box', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
        ],
    },

    // =========================================================================
    // NEWTECH WELLNESS (South Korea)
    // =========================================================================
    {
        brand: 'Newtech',
        lines: [
            {
                name: 'M-Torture',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Wide Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Wide Chest Press 2', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press 2', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Seated Chest Press (Rotary)', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Chest & Decline Combo', bodyPart: 'Chest' },
                    { name: 'Chest & Decline Combo 2', bodyPart: 'Chest' },
                    { name: 'Pec Dec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Dec Fly with Reverse', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Torque Pec Dec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: '2 Way Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Standing & Seated Row Combo', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Low Row (Rotary)', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Bentover Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Front Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Linear T-Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Vertical Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Wide Pulldown Front', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Wide Pulldown Rear', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Wide Pulldown Rear 2', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Plate Loaded Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    // Arms
                    { name: 'Overhead Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Plate Loaded Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    // Legs
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat Premium', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'V-Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Drop Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Leg Press Premium', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Squat & Calf Raise', bodyPart: 'Legs' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Glute Kickback', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Hip Thrust (Rotary)', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Glute Ham', bodyPart: 'Legs', pattern: 'knee-flexion' },
                ],
            },
            {
                name: 'OnHim',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Chest Press (Rotary)', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Dec Fly (with Reverse)', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Standing Fly Chest & Back', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown (High Pulley)', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Advance Pro Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Row (Inward)', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Row (Outward)', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Reverse Hyper', bodyPart: 'Back', pattern: 'hip-dominant' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Seated Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Single Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    // Arms
                    { name: 'Arm Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Glute Kickback', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Kneeling Hip Raise', bodyPart: 'Legs' },
                    { name: 'Hip Adduction/Abduction Combo', bodyPart: 'Legs' },
                    { name: 'Hip Abduction (Single Move)', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Chin-Up/Dip Assist', bodyPart: 'Full Body' },
                    // Core
                    { name: 'Rotary Torso', bodyPart: 'Core', pattern: 'anti-rotation' },
                    // Cable
                    { name: 'Adjustable Low Pulley', bodyPart: 'Full Body' },
                    { name: 'Multi Low Cable', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Plate',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Flat Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Multi Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'T-Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                ],
            },
            {
                name: 'Cable & Multi-Station',
                type: 'Cable',
                machines: [
                    { name: 'Cable Crossover', bodyPart: 'Full Body' },
                    { name: 'Dual Pulley', bodyPart: 'Full Body' },
                    { name: 'Multi Pulley', bodyPart: 'Full Body' },
                    { name: 'Tri Cable', bodyPart: 'Full Body' },
                    { name: 'Tri Cable (4 Station)', bodyPart: 'Full Body' },
                    { name: 'Tri Cable 6 Station', bodyPart: 'Full Body' },
                    { name: 'Multi Gym Pro (5 Station-C)', bodyPart: 'Full Body' },
                    { name: 'Multi Gym Pro (5 Station-P)', bodyPart: 'Full Body' },
                    { name: 'Multi Gym Pro (8 Station)', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Racks & Smith',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Power Rack', bodyPart: 'Full Body' },
                    { name: 'Half Rack', bodyPart: 'Full Body' },
                    { name: 'Squat Rack', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Smith Machine (Vertical)', bodyPart: 'Full Body' },
                    { name: 'Smith Machine (Angle)', bodyPart: 'Full Body' },
                    { name: 'Smith Machine & Half Rack', bodyPart: 'Full Body' },
                    { name: '3D Rack', bodyPart: 'Full Body' },
                    { name: '3D + Smith + Half Rack', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Bench',
                type: 'Bench',
                machines: [
                    { name: 'Olympic Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Olympic Incline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Olympic Decline Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'MV Olympic Bench', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Adjustable Incline Bench', bodyPart: 'Full Body' },
                    { name: 'Adjustable Incline Bench Pro', bodyPart: 'Full Body' },
                    { name: 'Adjustable Decline Bench', bodyPart: 'Full Body' },
                    { name: 'Flat Bench', bodyPart: 'Full Body' },
                    { name: 'Utility Bench', bodyPart: 'Full Body' },
                    { name: 'Hip Thrust Bench', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Preacher Curl Bench (Rotary)', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Preacher Curl Bench (Stand)', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Bentover Support Bench', bodyPart: 'Back' },
                    { name: 'Sit Up', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Functional',
                type: 'Bodyweight',
                machines: [
                    { name: 'Roman Chair (45-90 Adjustable)', bodyPart: 'Back', pattern: 'hip-dominant' },
                    { name: '90 Degree Roman Chair (GHD)', bodyPart: 'Back' },
                    { name: 'Moving Leg Raise', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Dip & Leg Raise', bodyPart: 'Arms' },
                    { name: 'Twist Double', bodyPart: 'Core', pattern: 'anti-rotation' },
                ],
            },
        ],
    },

    // =========================================================================
    // MEGAMASS FITNESS (Houston, TX)
    // =========================================================================
    {
        brand: 'MegaMass',
        lines: [
            {
                name: 'General',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Plate-Loaded Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Flat/Decline Pro', bodyPart: 'Chest' },
                    { name: 'Leverage Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: 'Plate-Loaded Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'ISO-Lateral Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: '45 Degree Linear Iso Row Pro', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: '45 Degree Linear Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'T-Bar Linear Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Linear Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Smith Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Plate-Loaded Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Leverage Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Lat Pulldown/Low Row 2-in-1', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Plate-Loaded Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Shoulder/Incline Pro', bodyPart: 'Shoulders' },
                    // Legs
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'True Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Swimming Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Multi Squat (V Squat)', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension/Leg Curl 2-in-1', bodyPart: 'Legs' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                ],
            },
            {
                name: 'Multi-Use Station',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Smith Machine', bodyPart: 'Full Body' },
                    { name: 'Tower Smith 3-in-1', bodyPart: 'Full Body' },
                    { name: 'Leverage Gym (All-in-One)', bodyPart: 'Full Body' },
                    { name: '5 Station Jungle Gym', bodyPart: 'Full Body' },
                ],
            },
        ],
    },

    // =========================================================================
    // ATLANTIS STRENGTH
    // =========================================================================
    {
        brand: 'Atlantis Strength',
        lines: [
            {
                name: 'Precision',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Seated Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Converging Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline/Flat Converging Bench Press', bodyPart: 'Chest' },
                    { name: 'Lying Converging Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec/Rear Delt Fly Combo', bodyPart: 'Chest' },
                    { name: 'Vertical Pec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pullover', bodyPart: 'Chest' },
                    { name: 'Multi-Press', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Incline T-Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Incline Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Diverging Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Vertical Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Assisted Chin/Dip', bodyPart: 'Back' },
                    { name: 'Incline Hyper Extension', bodyPart: 'Back', pattern: 'hip-dominant' },
                    { name: 'Reverse Hyper Extension', bodyPart: 'Back', pattern: 'hip-dominant' },
                    // Shoulders
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Seated Side/Rear Deltoid', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Horizontal Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Biceps Isolator', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Overhead Triceps', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Incline Triceps Pushdown', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'French Press', bodyPart: 'Arms' },
                    { name: 'Biceps-Triceps Combo', bodyPart: 'Arms' },
                    { name: 'Multi-Forearm', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Extension/Leg Curl Combo', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: '40 Degree Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Horizontal Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pivot Press', bodyPart: 'Legs' },
                    { name: 'Glute Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Total Hip', bodyPart: 'Legs' },
                    { name: 'Adductor/Abductor Combo', bodyPart: 'Legs' },
                    { name: 'Sissy Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    // Calves
                    { name: 'Standing Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Seated Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Incline Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Tibia Dorsi Flexion', bodyPart: 'Legs', pattern: 'calf' },
                    // Core
                    { name: 'Abdominal Rotation', bodyPart: 'Core', pattern: 'anti-rotation' },
                    { name: 'Dual Seated Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Power',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Shrug and Deadlift Machine', bodyPart: 'Back' },
                    { name: 'Unilateral Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Front Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seal Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Viking Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Vertical Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Vertical Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Flat Pec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Pec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Power Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Unilateral Leg Press Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Thruster Pro', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Glute Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Glute and Ham Developer', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs', pattern: 'calf' },
                ],
            },
            {
                name: 'Natural Motion',
                type: 'Cable',
                machines: [
                    { name: 'Functional Training System', bodyPart: 'Full Body' },
                    { name: 'Dynamic Functional Training System', bodyPart: 'Full Body' },
                    { name: 'Unilateral Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Unilateral Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                ],
            },
            {
                name: 'Bench',
                type: 'Bench',
                machines: [
                    { name: 'Utility Bench', bodyPart: 'Full Body' },
                    { name: 'Adjustable Sit Up Bench', bodyPart: 'Core' },
                    { name: 'Standing Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Adjustable Single Leg Squat Stand', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Standing Leg Raise', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Flat Dumbbell Bench with Pivots', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Dumbbell Bench with Pivots', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Dumbbell Bench with Pivots', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Olympic Incline Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Poliquin Seated Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                ],
            },
        ],
    },

    // =========================================================================
    // ROGERS ATHLETIC (Pendulum line)
    // =========================================================================
    {
        brand: 'Rogers Athletic',
        lines: [
            {
                name: 'Pendulum',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Vertical Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder/Incline', bodyPart: 'Shoulders' },
                    { name: '3-Way Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Lat Combo Pull', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Power Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Power Squat Pro XT', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Squat Pro', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Press', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Reverse Glute-Ham', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: '5-Way Neck', bodyPart: 'Neck' },
                    { name: '4-Way Neck', bodyPart: 'Neck' },
                    { name: 'Power Grip Pro', bodyPart: 'Arms' },
                ],
            },
        ],
    },

    // =========================================================================
    // GYM80 (Germany)
    // =========================================================================
    {
        brand: 'gym80',
        lines: [
            {
                name: 'Sygnum',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Seated Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Inner Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly with Pads', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Chest Crossover', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Standing Chest Crossover', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Iso Lat', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Seated Row without Chest Support', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Incline Row Combo', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Chin/Dip Assist', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back', pattern: 'trunk-ext' },
                    { name: '45° Back Extension', bodyPart: 'Back', pattern: 'hip-dominant' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Shoulder Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Standing Shoulder Lateral Raise', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Reverse Fly / Rear Delt', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    { name: 'Neck Press', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Bicep Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Horizontal Biceps', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Seated Preacher Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Overhead', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Dip Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Forearms Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    // Legs
                    { name: 'Seated Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Lying Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Donkey Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Adductor', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Radial Gluteus', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Kneeling Glutes Kick', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Bootymizer', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    // Core
                    { name: 'Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Total Ab', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Ab Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Lying Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Twister Machine', bodyPart: 'Core', pattern: 'anti-rotation' },
                    { name: 'Leg Raise', bodyPart: 'Core', pattern: 'trunk-flex' },
                    // Multi / Stations
                    { name: 'Crossover Cable Station', bodyPart: 'Full Body' },
                    { name: 'Adjustable Cable Crossover Station', bodyPart: 'Full Body' },
                    { name: 'Multi-Power Station', bodyPart: 'Full Body' },
                    { name: 'Smith Machine', bodyPart: 'Full Body' },
                    { name: 'Pulley Universal', bodyPart: 'Full Body' },
                    { name: 'Pulley Explosive', bodyPart: 'Full Body' },
                    { name: '4-Station Tower', bodyPart: 'Full Body' },
                    { name: '5-Station Tower', bodyPart: 'Full Body' },
                    { name: 'Duplex Station', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Pure Kraft',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Seated Chest Press Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Chest Press Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Chest Crossover Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Lying Inner Chest Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: 'Lat Pulldown Dual', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row Dual', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Low Row Dual', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'High Row Dual', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Power Row Dual', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'T-Bar Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Bent Over Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: '55° Rowing Machine', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back', pattern: 'vertical-pull' },
                    // Shoulders
                    { name: 'Shoulder Press Dual', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Shoulder Lateral Raise Dual', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Reverse Fly / Rear Delt Dual', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    { name: 'Viking Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Neck Press', bodyPart: 'Shoulders' },
                    { name: 'Standing Multi-Joint', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Biceps Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Biceps Overhead', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Machine', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Dip Dual', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Overhead Triceps', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    // Legs
                    { name: '45° Linear Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: '45° Pivot Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Press Dual', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Inverse Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Booty Booster Special', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Glutes Kick Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: '55° Standing Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Donkey Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Standing Abduction', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Abduction 3D', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Tibia Dorsi Flexion', bodyPart: 'Legs', pattern: 'calf' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Rotating Abdominal Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Ab Swing', bodyPart: 'Core', pattern: 'trunk-flex' },
                    { name: 'Lying Abdominal', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Pure Kraft Strong',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Bench Press Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Chest Press Dual', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press Dual', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
            {
                name: 'Innovation',
                type: 'Selectorized',
                machines: [
                    { name: 'Curler', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Pec Fly / Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder & Lat Pull', bodyPart: 'Shoulders' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Glutes Machine', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Multi Extension Machine', bodyPart: 'Full Body' },
                    { name: 'Adduction & Abduction', bodyPart: 'Legs' },
                    { name: 'Abdominal & Back', bodyPart: 'Core' },
                    { name: 'Leg Extension & Leg Curl', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Dual',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
            {
                name: 'Cable Art',
                type: 'Cable',
                machines: [
                    { name: 'No.1 Shoulder & Back', bodyPart: 'Back' },
                    { name: 'No.2 Latissimus & Trapezius', bodyPart: 'Back' },
                    { name: 'No.3 Chest & Shoulder', bodyPart: 'Chest' },
                    { name: 'No.4 Biceps & Triceps', bodyPart: 'Arms' },
                    { name: 'No.5 Upper Body', bodyPart: 'Full Body' },
                    { name: 'No.6 Legs', bodyPart: 'Legs' },
                ],
            },
            {
                name: '80Classics',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Fly', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Crossover Machine', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Chin/Dip Assist', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Reverse Fly / Rear Delt', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    // Arms
                    { name: 'Bicep Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Tricep Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    // Legs
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Calf', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Adductor', bodyPart: 'Legs', pattern: 'adduction' },
                    { name: 'Radial Glutes', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    // Arms
                    { name: 'Standing Scott Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    // Core
                    { name: 'Ab Crunch', bodyPart: 'Core', pattern: 'trunk-flex' },
                    // Multi / Stations
                    { name: 'Cable Crossover Station', bodyPart: 'Full Body' },
                    { name: '4-Station Tower', bodyPart: 'Full Body' },
                    { name: 'Lat Pulley', bodyPart: 'Full Body' },
                    { name: 'Long Pulley', bodyPart: 'Full Body' },
                ],
            },
            {
                name: '80Athletics',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Standing Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'FTM Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Bent Over Lateral Raise', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    { name: 'Triceps Dip', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Sissy Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Reverse Hyper Extension', bodyPart: 'Back', pattern: 'hip-dominant' },
                    { name: 'FTM Deadlift Machine', bodyPart: 'Back', pattern: 'hip-dominant' },
                    { name: 'FTM Push & Pull Machine', bodyPart: 'Full Body' },
                    { name: 'Glute Booster Rack', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Power Rack Cable', bodyPart: 'Full Body' },
                    { name: 'Jammer Arms', bodyPart: 'Full Body' },
                    { name: 'Gripper', bodyPart: 'Arms' },
                ],
            },
            {
                name: '80Classics BW',
                type: 'Bodyweight',
                machines: [
                    { name: 'Abdominal Flexor', bodyPart: 'Core', pattern: 'trunk-flex' },
                ],
            },
            {
                name: 'Outdoor',
                type: 'Bodyweight',
                machines: [
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Butterfly', bodyPart: 'Chest' },
                    { name: 'Back Pull', bodyPart: 'Back' },
                    { name: 'Standing Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Standing Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Standing Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Standing Triceps Dip', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Standing Multi-Joint', bodyPart: 'Full Body' },
                    { name: 'Squat Machine', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
        ],
    },

    // =========================================================================
    // GYMLECO (Sweden)
    // =========================================================================
    {
        brand: 'Gymleco',
        lines: [
            {
                name: 'General',
                type: 'Plate-Loaded',
                machines: [
                    // Chest
                    { name: 'Incline Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Seated Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Bench Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Deck', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Decline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Standing Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Press/Chest Flyes', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    // Back
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Lateral Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'High Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Hip & Back Extension', bodyPart: 'Back', pattern: 'hip-dominant' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Shoulder Rotation', bodyPart: 'Shoulders' },
                    { name: 'Upright Row', bodyPart: 'Shoulders', pattern: 'lateral-delt' },
                    { name: 'Viking Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hack Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Press/Hack Combo', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Belt Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Hip Thrust', bodyPart: 'Legs', pattern: 'hip-dominant' },
                    { name: 'Standing Abductor', bodyPart: 'Legs', pattern: 'abduction' },
                    { name: 'Donkey Calf Raise', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Tibia Dorsi Flexion', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Glute Kickback', bodyPart: 'Legs', pattern: 'hip-dominant' },
                ],
            },
            {
                name: 'General',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Incline Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Seated Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pec Deck', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Wide Chest Standing', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Pullover', bodyPart: 'Chest' },
                    // Back
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Lateral Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Low Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Chin/Dip Multi', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Shoulder Rotation Seated', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Rotation Standing', bodyPart: 'Shoulders' },
                    { name: 'Rear Deltoid/Pec Deck', bodyPart: 'Shoulders' },
                    { name: 'Rear Deltoid Shoulder', bodyPart: 'Shoulders', pattern: 'rear-delt' },
                    // Arms
                    { name: 'Biceps Curl', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Triceps Extension', bodyPart: 'Arms', pattern: 'elbow-ext' },
                    { name: 'Biceps/Triceps Combo', bodyPart: 'Arms' },
                    { name: 'Forearm Machine', bodyPart: 'Arms', pattern: 'elbow-flex' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension/Leg Curl Combo', bodyPart: 'Legs' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Standing Calf Press', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Seated Calf Press 45°', bodyPart: 'Legs', pattern: 'calf' },
                    { name: 'Adductor/Abductor', bodyPart: 'Legs' },
                    // Core
                    { name: 'Seated Abs', bodyPart: 'Core', pattern: 'trunk-flex' },
                    // Multi
                    { name: 'Dips Press/Shoulder Pull', bodyPart: 'Full Body' },
                ],
            },
        ],
    },

    // =========================================================================
    // CONCEPT2 (Cardio)
    // =========================================================================
    {
        brand: 'Concept2',
        lines: [
            {
                name: 'Cardio',
                type: 'Cardio',
                machines: [
                    { name: 'Model D Rower', bodyPart: 'Cardio', pattern: 'cardio' },
                    { name: 'Model E Rower', bodyPart: 'Cardio', pattern: 'cardio' },
                    { name: 'SkiErg', bodyPart: 'Cardio', pattern: 'cardio' },
                    { name: 'BikeErg', bodyPart: 'Cardio', pattern: 'cardio' },
                ],
            },
        ],
    },

    // =========================================================================
    // ELEIKO (Olympic Lifting)
    // =========================================================================
    {
        brand: 'Eleiko',
        lines: [
            {
                name: 'Barbells',
                type: 'Barbell',
                machines: [
                    { name: 'IWF Competition Bar', bodyPart: 'Multi-Use' },
                    { name: 'IPF Powerlifting Bar', bodyPart: 'Multi-Use' },
                    { name: 'Training Bar', bodyPart: 'Multi-Use' },
                    { name: 'XF Bar', bodyPart: 'Multi-Use' },
                ],
            },
        ],
    },

    // =========================================================================
    // PRIME FITNESS
    // =========================================================================
    {
        brand: 'Prime Fitness',
        lines: [
            {
                name: 'Plate-Loaded',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Incline Press', bodyPart: 'Chest', pattern: 'horizontal-push' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders', pattern: 'vertical-push' },
                    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },
                    { name: 'Seated Row', bodyPart: 'Back', pattern: 'horizontal-pull' },
                    { name: 'Leg Press', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Extension', bodyPart: 'Legs', pattern: 'knee-dominant' },
                    { name: 'Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs', pattern: 'knee-dominant' },
                ],
            },
        ],
    },
];

/**
 * Get all brand names from the catalog.
 */
export function getCatalogBrands() {
    return EQUIPMENT_CATALOG.map(b => b.brand);
}

/**
 * Get all lines for a given brand.
 */
export function getCatalogLines(brand) {
    const entry = EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brand.toLowerCase());
    return entry ? entry.lines.map(l => ({ name: l.name, type: l.type, count: l.machines.length })) : [];
}

/**
 * Get all machines for a given brand + line.
 */
export function getCatalogMachines(brand, line) {
    const entry = EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brand.toLowerCase());
    if (!entry) return [];
    const lineEntry = entry.lines.find(l => l.name.toLowerCase() === line.toLowerCase());
    return lineEntry ? lineEntry.machines : [];
}

/**
 * Search the catalog by keyword (matches brand, line, or machine name).
 */
export function searchCatalog(query) {
    const q = query.toLowerCase();
    const results = [];

    for (const brand of EQUIPMENT_CATALOG) {
        for (const line of brand.lines) {
            for (const machine of line.machines) {
                if (
                    brand.brand.toLowerCase().includes(q) ||
                    line.name.toLowerCase().includes(q) ||
                    machine.name.toLowerCase().includes(q)
                ) {
                    results.push({
                        brand: brand.brand,
                        line: line.name,
                        machine: machine.name,
                        type: machine.type || line.type,
                        bodyPart: machine.bodyPart,
                    });
                }
            }
        }
    }

    return results;
}
