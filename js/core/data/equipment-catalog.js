/**
 * Equipment Catalog — Pre-populated reference database of major gym equipment brands.
 *
 * Structure: Brand → Line → Machines[]
 * Each machine has: name (function), type, defaultBodyPart
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
                    { name: 'Iso-Lateral Bench Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Incline Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Decline Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Super Incline Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Chest/Back', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Iso-Lateral Row', bodyPart: 'Back' },
                    { name: 'Iso-Lateral High Row', bodyPart: 'Back' },
                    { name: 'Iso-Lateral Low Row', bodyPart: 'Back' },
                    { name: 'Iso-Lateral D.Y. Row', bodyPart: 'Back' },
                    { name: 'Iso-Lateral Front Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Iso-Lateral Wide Pulldown', bodyPart: 'Back' },
                    { name: 'Iso-Lateral Leg Extension', bodyPart: 'Legs' },
                    { name: 'Iso-Lateral Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Linear Leg Press', bodyPart: 'Legs' },
                    { name: 'V-Squat', bodyPart: 'Legs' },
                    { name: 'Pendulum-X Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs' },
                    { name: 'Glute Drive', bodyPart: 'Legs' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Fly', bodyPart: 'Chest' },
                    { name: 'Pectoral Fly/Rear Deltoid', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Fixed Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Assist Dip Chin', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs' },
                    { name: 'Hip Abduction', bodyPart: 'Legs' },
                    { name: 'Hip Adduction', bodyPart: 'Legs' },
                    { name: 'Hip and Glute', bodyPart: 'Legs' },
                    { name: 'Standing Calf', bodyPart: 'Legs' },
                    { name: 'Horizontal Calf', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'MTS',
                type: 'Selectorized',
                machines: [
                    { name: 'Iso-Lateral Chest Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Incline Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Decline Press', bodyPart: 'Chest' },
                    { name: 'Iso-Lateral Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Iso-Lateral Row', bodyPart: 'Back' },
                    { name: 'Iso-Lateral High Row', bodyPart: 'Back' },
                    { name: 'Iso-Lateral Front Pulldown', bodyPart: 'Back' },
                    { name: 'Iso-Lateral Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Iso-Lateral Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Iso-Lateral Leg Extension', bodyPart: 'Legs' },
                    { name: 'Iso-Lateral Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'HD Elite',
                type: 'Rack',
                machines: [
                    { name: 'Power Rack', bodyPart: 'Multi-Use' },
                    { name: 'Half Rack', bodyPart: 'Multi-Use' },
                    { name: 'Combo Rack', bodyPart: 'Multi-Use' },
                    { name: 'Olympic Flat Bench', bodyPart: 'Chest', type: 'Bench' },
                    { name: 'Olympic Incline Bench', bodyPart: 'Chest', type: 'Bench' },
                    { name: 'Olympic Decline Bench', bodyPart: 'Chest', type: 'Bench' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Vertical Chest Press Circular', bodyPart: 'Chest' },
                    { name: 'Inclined Chest Press', bodyPart: 'Chest' },
                    { name: 'Inclined Chest Press Circular', bodyPart: 'Chest' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    { name: 'Total Press', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Deltoid Press', bodyPart: 'Shoulders' },
                    { name: 'Deltoid Press Circular', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lateral Deltoids', bodyPart: 'Shoulders' },
                    { name: 'Standing Multi Flight', bodyPart: 'Shoulders' },
                    { name: 'Peck Back', bodyPart: 'Shoulders' },
                    { name: 'Rotary Cuff', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Lat Pulldown Circular', bodyPart: 'Back' },
                    { name: 'Lat Pulldown Convergent', bodyPart: 'Back' },
                    { name: 'Lat Pulldown Double Stack', bodyPart: 'Back' },
                    { name: 'High Row Convergent', bodyPart: 'Back' },
                    { name: 'Pulley Row', bodyPart: 'Back' },
                    { name: 'Pulley Row Double Stack', bodyPart: 'Back' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Rowing Machine Circular', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Pullover Machine', bodyPart: 'Back' },
                    { name: 'Total Back', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back' },
                    // Arms
                    { name: 'Curling Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Curl', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Curl 120', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Curl -45', bodyPart: 'Arms' },
                    { name: 'Alternate Supinating Biceps', bodyPart: 'Arms' },
                    { name: 'Alternate Preacher Curl', bodyPart: 'Arms' },
                    { name: 'Standing Total Arms', bodyPart: 'Arms' },
                    { name: 'Alternate Standing Total Arms', bodyPart: 'Arms' },
                    { name: 'Triceps Machine', bodyPart: 'Arms' },
                    { name: 'French Press Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Extension', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Extension 90', bodyPart: 'Arms' },
                    { name: 'Alternate Pronating Triceps', bodyPart: 'Arms' },
                    { name: 'Dips Press', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curling', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Leg Curling', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Dual System Horizontal Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Gluteus Machine', bodyPart: 'Legs' },
                    { name: 'Master Gluteus Plus', bodyPart: 'Legs' },
                    { name: 'Hip Abductor', bodyPart: 'Legs' },
                    { name: 'Hip Adductor', bodyPart: 'Legs' },
                    { name: 'Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Adductor Machine', bodyPart: 'Legs' },
                    { name: 'Adductor/Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Standing Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Calf Machine', bodyPart: 'Legs' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Upper Abdominal', bodyPart: 'Core' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Vertical Chest Convergent', bodyPart: 'Chest' },
                    { name: 'Inclined Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Deltoid Press Convergent', bodyPart: 'Shoulders' },
                    { name: 'Peck Back', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Pulley Row', bodyPart: 'Back' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back' },
                    // Arms
                    { name: 'Curling Machine', bodyPart: 'Arms' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Machine', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curling', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Adductor Machine', bodyPart: 'Legs' },
                    { name: 'Adductor/Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Calf Machine', bodyPart: 'Legs' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Upper Abdominal', bodyPart: 'Core' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Super Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Super Inclined Chest Press', bodyPart: 'Chest' },
                    { name: 'Super Declined Chest Press', bodyPart: 'Chest' },
                    { name: 'Super Horizontal Bench Press', bodyPart: 'Chest' },
                    { name: 'Super Inclined Bench Press', bodyPart: 'Chest' },
                    { name: 'Super Horizontal Multi Press', bodyPart: 'Chest' },
                    { name: 'Super Vertical Multi Press', bodyPart: 'Chest' },
                    { name: 'Super Middle Chest Flight Machine', bodyPart: 'Chest' },
                    { name: 'Super Upper Chest Flight Machine', bodyPart: 'Chest' },
                    { name: 'Super Lower Chest Flight Machine', bodyPart: 'Chest' },
                    { name: 'Dips Press', bodyPart: 'Chest' },
                    { name: 'Dips Press Dual System', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Super Deltoid Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Deltoids', bodyPart: 'Shoulders' },
                    { name: 'Back Deltoids', bodyPart: 'Shoulders' },
                    { name: 'Super Shrug Machine', bodyPart: 'Shoulders' },
                    { name: 'Viking Press and Calf', bodyPart: 'Shoulders' },
                    { name: 'Super Peck Back', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Super Rowing', bodyPart: 'Back' },
                    { name: 'Super Rowing Circular', bodyPart: 'Back' },
                    { name: 'Super Pullover Machine', bodyPart: 'Back' },
                    { name: 'Pullover Machine', bodyPart: 'Back' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Super Lat Machine Convergent', bodyPart: 'Back' },
                    { name: 'Super Lat Pulldown Circular', bodyPart: 'Back' },
                    { name: 'Super High Row', bodyPart: 'Back' },
                    { name: 'Super Power Row', bodyPart: 'Back' },
                    { name: 'Super Low Row', bodyPart: 'Back' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Super Dorsy Bar', bodyPart: 'Back' },
                    { name: 'Front Dorsy Bar', bodyPart: 'Back' },
                    // Arms
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Curling Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Curling Machine', bodyPart: 'Arms' },
                    { name: 'Four Angle Biceps Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Preacher Curl Machine', bodyPart: 'Arms' },
                    { name: 'Triceps Dip', bodyPart: 'Arms' },
                    { name: 'Triceps Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Triceps Machine', bodyPart: 'Arms' },
                    { name: 'Three Angles Triceps Machine', bodyPart: 'Arms' },
                    { name: 'Super French Press Machine', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Press 45°', bodyPart: 'Legs' },
                    { name: 'Super Leg Press 45° Dual System', bodyPart: 'Legs' },
                    { name: 'Super Leg Press Bridge', bodyPart: 'Legs' },
                    { name: 'Super Horizontal Leg Press Dual System', bodyPart: 'Legs' },
                    { name: 'Super Vertical Leg Press', bodyPart: 'Legs' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Super Hack Squat', bodyPart: 'Legs' },
                    { name: 'Super Squat Machine', bodyPart: 'Legs' },
                    { name: 'Super Power Squat', bodyPart: 'Legs' },
                    { name: 'Super Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Super Lunge Machine', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Alternate Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Alternate Leg Curling', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curling', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curling', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Super Calf Hack', bodyPart: 'Legs' },
                    { name: 'Super Seated Calf', bodyPart: 'Legs' },
                    { name: 'Donkey Calf', bodyPart: 'Legs' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs' },
                    { name: '3D Abductor', bodyPart: 'Legs' },
                    { name: 'Reverse Hyperextension', bodyPart: 'Legs' },
                    // Core
                    { name: 'Total Core Crunch Machine', bodyPart: 'Core' },
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
                    { name: 'Combo Twist', bodyPart: 'Core' },
                    { name: 'Squat Lunge', bodyPart: 'Legs' },
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
                    { name: 'Vertical Chest Press Circular', bodyPart: 'Chest' },
                    { name: 'Inclined Chest Press Circular', bodyPart: 'Chest' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Deltoid Press Circular', bodyPart: 'Shoulders' },
                    { name: 'Lateral Deltoid', bodyPart: 'Shoulders' },
                    { name: 'Standing Multi Flight', bodyPart: 'Shoulders' },
                    { name: 'Peck Back', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Lat Pulldown Circular', bodyPart: 'Back' },
                    { name: 'Lat Pulldown Convergent', bodyPart: 'Back' },
                    { name: 'High Row Convergent', bodyPart: 'Back' },
                    { name: 'Pulley Row', bodyPart: 'Back' },
                    { name: 'Rowing Machine Circular', bodyPart: 'Back' },
                    { name: 'Pullover Machine', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back' },
                    // Arms
                    { name: 'Curling Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Curl', bodyPart: 'Arms' },
                    { name: 'Standing Total Arms', bodyPart: 'Arms' },
                    { name: 'Triceps Machine', bodyPart: 'Arms' },
                    { name: 'French Press Machine', bodyPart: 'Arms' },
                    { name: 'Alternate Arm Extension', bodyPart: 'Arms' },
                    { name: 'Dips Press', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curling', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curling', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Adductor Machine', bodyPart: 'Legs' },
                    { name: 'Dual Adductor Abductor Machine', bodyPart: 'Legs' },
                    { name: 'Master Gluteus Plus', bodyPart: 'Legs' },
                    { name: 'Gluteus Machine', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Calf Hack Machine', bodyPart: 'Legs' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Fly', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hip Abduction', bodyPart: 'Legs' },
                    { name: 'Hip Adduction', bodyPart: 'Legs' },
                    { name: 'Calf Raise', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Cable Motion Row', bodyPart: 'Back' },
                    { name: 'Cable Motion Chest Press', bodyPart: 'Chest' },
                ],
            },
            {
                name: 'Insignia Series',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Glute', bodyPart: 'Legs' },
                    { name: 'Hip Abduction/Adduction', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Overhead Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Row', bodyPart: 'Back' },
                    { name: 'Pulldown', bodyPart: 'Back' },
                    { name: 'Rear Delt/Fly', bodyPart: 'Shoulders' },
                    { name: 'Arm Curl', bodyPart: 'Arms' },
                    { name: 'Arm Extension', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Glute', bodyPart: 'Legs' },
                    { name: 'Hip Abduction/Adduction', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Prestige',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Machine', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Arm Curl', bodyPart: 'Arms' },
                    { name: 'Arm Extension', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Abductor', bodyPart: 'Legs' },
                    { name: 'Adductor', bodyPart: 'Legs' },
                    { name: 'Glute Machine', bodyPart: 'Legs' },
                    { name: 'Calf Machine', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Rotary Torso', bodyPart: 'Core' },
                    { name: 'Total Abdominal', bodyPart: 'Core' },
                    { name: 'Delts Machine', bodyPart: 'Shoulders' },
                ],
            },
            {
                name: 'Selection 700',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Machine', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Leg Extension/Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Abductor/Adductor', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Pure Strength',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Biostrength',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Machine', bodyPart: 'Back' },
                    { name: 'Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Squat', bodyPart: 'Legs' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Deltoid Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Vertical Row', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Triceps Dip', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Glute Machine', bodyPart: 'Legs' },
                    { name: 'Hip Abductor/Adductor', bodyPart: 'Legs' },
                    { name: 'Dual Adjustable Pulley', bodyPart: 'Multi-Use', type: 'Cable' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Impact',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
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
                    { name: 'Vertical Bench Press', bodyPart: 'Chest' },
                    { name: 'Supine Bench Press', bodyPart: 'Chest' },
                    { name: 'Incline Bench Press', bodyPart: 'Chest' },
                    { name: 'Vertical Decline Bench Press', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Incline Lever Row', bodyPart: 'Back' },
                    { name: 'High Row', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Back Extension Bench', bodyPart: 'Back' },
                    // Arms
                    { name: 'Elevated Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Standing Arm Curl', bodyPart: 'Arms' },
                    { name: 'Preacher Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms' },
                    // Legs
                    { name: '45-Degree Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Reclining Leg Extension', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Calf', bodyPart: 'Legs' },
                    { name: 'Seated Calf', bodyPart: 'Legs' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Glute Trainer', bodyPart: 'Legs' },
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
                    { name: 'Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly / Rear Delt', bodyPart: 'Chest' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Independent Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Dependent Arm Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hip Adductor', bodyPart: 'Legs' },
                    { name: 'Hip Abductor', bodyPart: 'Legs' },
                    { name: 'Calf Extension', bodyPart: 'Legs' },
                    { name: 'Glute', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Rotary Torso', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Aura',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Fly', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Rear Delt / Pec Fly', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Arm Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Tricep Extension', bodyPart: 'Arms' },
                    { name: 'Dip / Chin Assist', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hip Adductor', bodyPart: 'Legs' },
                    { name: 'Hip Abductor', bodyPart: 'Legs' },
                    { name: 'Rotary Hip', bodyPart: 'Legs' },
                    { name: 'Calf Press', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Rotary Torso', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Versa',
                type: 'Selectorized',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly / Rear Delt', bodyPart: 'Chest' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Multi Press', bodyPart: 'Shoulders' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back' },
                    { name: 'Lat Pulldown / Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Bicep Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Bicep / Tricep', bodyPart: 'Arms' },
                    { name: 'Chin / Dip Assist', bodyPart: 'Arms' },
                    { name: 'Leg Press / Calf Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Extension / Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hip Abductor / Adductor', bodyPart: 'Legs' },
                    { name: 'Glute', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core' },
                    { name: 'Ab / Low Back', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Go',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Seated Triceps Press', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Breaker Bench',
                type: 'Bench',
                machines: [
                    { name: 'Flat Bench', bodyPart: 'Chest' },
                    { name: 'Incline Bench', bodyPart: 'Chest' },
                    { name: 'Decline Bench', bodyPart: 'Chest' },
                    { name: 'Military Press Bench', bodyPart: 'Shoulders' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Incline Lever Row', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    { name: 'Angled Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Squat Machine', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Calf Raise', bodyPart: 'Legs' },
                    { name: 'Smith Machine', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Resolute',
                type: 'Selectorized',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Rear Delt Pec Fly', bodyPart: 'Shoulders' },
                    { name: 'Diverging Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Diverging Seated Row', bodyPart: 'Back' },
                    { name: 'Diverging Low Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Calf Extension', bodyPart: 'Legs' },
                    { name: 'Inner Thigh', bodyPart: 'Legs' },
                    { name: 'Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Inner / Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Glute Extension', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core' },
                    { name: 'Rotary Torso', bodyPart: 'Core' },
                    { name: 'Dual Adjustable Pulley', bodyPart: 'Full Body' },
                    { name: 'FTS Glide', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Vitality',
                type: 'Selectorized',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Rear Delt / Pec Fly', bodyPart: 'Shoulders' },
                    { name: 'Multi-Press', bodyPart: 'Shoulders' },
                    { name: 'Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Pulldown / Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Biceps Curl / Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Leg Press / Calf Extension', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Curl / Leg Extension', bodyPart: 'Legs' },
                    { name: 'Inner / Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core' },
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
                    { name: 'Seated Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'ISO Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Decline Chest Press', bodyPart: 'Chest' },
                    { name: 'ISO Decline Chest Press', bodyPart: 'Chest' },
                    { name: 'ISO Bench Press Pro', bodyPart: 'Chest' },
                    { name: 'Crossover Flat Chest Press', bodyPart: 'Chest' },
                    { name: 'Crossover Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Dec Fly Pro', bodyPart: 'Chest' },
                    { name: 'Incline Pec Dec Fly', bodyPart: 'Chest' },
                    { name: 'Multi Flat Chest Fly', bodyPart: 'Chest' },
                    { name: 'Max Pivot Press', bodyPart: 'Chest' },
                    // Shoulders
                    { name: 'Supine Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Multi Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Military Shoulder Press Pro', bodyPart: 'Shoulders' },
                    { name: 'Crossover Multi Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Seated Rear Deltoid', bodyPart: 'Shoulders' },
                    { name: 'Standing Lateral Raise & Fly', bodyPart: 'Shoulders' },
                    { name: 'Seated Lateral Raise & Press', bodyPart: 'Shoulders' },
                    { name: 'Viking Press', bodyPart: 'Shoulders' },
                    // Back
                    { name: 'Classic Wide Pulldown', bodyPart: 'Back' },
                    { name: 'Crossover Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Multi Front Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Classic Pullover', bodyPart: 'Back' },
                    { name: 'ISO Lateral Row', bodyPart: 'Back' },
                    { name: 'Seated Middle Row', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Crossover Seated Row', bodyPart: 'Back' },
                    { name: 'ISO Low Row', bodyPart: 'Back' },
                    { name: 'Multi Low Row & Deadlift', bodyPart: 'Back' },
                    { name: 'Multi High Row', bodyPart: 'Back' },
                    { name: 'Max Multi Front Row', bodyPart: 'Back' },
                    { name: 'Supported Angle Row', bodyPart: 'Back' },
                    { name: 'Pad Support Row', bodyPart: 'Back' },
                    { name: 'Reverse Hyper', bodyPart: 'Back' },
                    // Arms
                    { name: 'ISO Multi Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Preacher Multi Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Seated Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Triceps Overhead Extension', bodyPart: 'Arms' },
                    { name: 'Standing Tricep Extension & Dip', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Horizontal Multi Leg Press', bodyPart: 'Legs' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs' },
                    { name: '70-Degree Leg Press', bodyPart: 'Legs' },
                    { name: 'Power Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'ISO Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'ISO Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat Pro', bodyPart: 'Legs' },
                    { name: 'Power Squat', bodyPart: 'Legs' },
                    { name: 'Power Squat & Calf', bodyPart: 'Legs' },
                    { name: '3D Safety Squat', bodyPart: 'Legs' },
                    { name: 'Double Track Squat', bodyPart: 'Legs' },
                    { name: 'Reverse Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Multi Lunge', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Rotating Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Hip Press', bodyPart: 'Legs' },
                    { name: 'Max Glute Kickback Pro', bodyPart: 'Legs' },
                    { name: 'Multi Reverse Glute Ham', bodyPart: 'Legs' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    { name: 'MAX 3D Abductor', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs' },
                    { name: 'Multi Deadlift & Shrug', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    // Multi
                    { name: 'ISO Smith', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Evolution',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Decline Chest Press & Pec Dec Superset', bodyPart: 'Chest' },
                    { name: 'Decline Pec Dec Fly', bodyPart: 'Chest' },
                    { name: 'Ultra ISO Chest Press', bodyPart: 'Chest' },
                    { name: 'Ultra ISO Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Ultra ISO Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'ISO Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Internal/External Rotation', bodyPart: 'Shoulders' },
                    { name: 'Seated Lateral Raise & Press Superset', bodyPart: 'Shoulders' },
                    { name: 'High Row & Low Row Superset', bodyPart: 'Back' },
                    { name: 'Multi Double Back Superset', bodyPart: 'Back' },
                    { name: 'Seated Dual Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Cable Row', bodyPart: 'Back' },
                    { name: 'Ultra ISO Seated Row', bodyPart: 'Back' },
                    { name: 'Preacher Multi Biceps Curl', bodyPart: 'Arms' },
                    { name: 'ISO Multi Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Standing Multi Rotary Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Max Standing Biceps', bodyPart: 'Arms' },
                    { name: 'Lying Tricep Extension', bodyPart: 'Arms' },
                    { name: 'ISO Tricep Extension', bodyPart: 'Arms' },
                    { name: 'Tricep Overhead Extension & Dip Superset', bodyPart: 'Arms' },
                    { name: 'Leg Press & Extension Superset', bodyPart: 'Legs' },
                    { name: 'Classic Power Leg Extension', bodyPart: 'Legs' },
                    { name: 'Max Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing ISO Multi Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Max Lower Abs', bodyPart: 'Core' },
                    { name: 'Angle Smith', bodyPart: 'Full Body' },
                    { name: 'Standing Lateral Raise & Fly', bodyPart: 'Shoulders' },
                    { name: 'Pec Dec Fly Pro', bodyPart: 'Chest' },
                ],
            },
            {
                name: 'Glutemax',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Glute Ham', bodyPart: 'Legs' },
                    { name: 'Hip Adduction / Abduction Combo', bodyPart: 'Legs' },
                    { name: 'Reverse Hyper', bodyPart: 'Legs' },
                    { name: 'Power Runner', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Squat Station Pro', bodyPart: 'Legs' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'MAX 3D Abductor', bodyPart: 'Legs' },
                    { name: 'Multi Reverse Glute Ham', bodyPart: 'Legs' },
                    { name: 'Rotating Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Multi Hip', bodyPart: 'Legs' },
                    { name: 'Glute Isolator Pro', bodyPart: 'Legs' },
                    { name: 'Arc Glute Kickback', bodyPart: 'Legs' },
                    { name: 'Hip Press', bodyPart: 'Legs' },
                    { name: 'Hip Thrust Rack', bodyPart: 'Legs' },
                    { name: 'Multi Lunge', bodyPart: 'Legs' },
                    { name: 'Power Squat', bodyPart: 'Legs' },
                    { name: 'Max Glute Kickback Pro', bodyPart: 'Legs' },
                    { name: 'Max Lunge Pro', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Elite',
                type: 'Selectorized',
                machines: [
                    { name: 'Seated Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Deck Fly with Reverse', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Arm Curl Biceps', bodyPart: 'Arms' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    { name: 'Chin-Up / Dip Assist', bodyPart: 'Arms' },
                    { name: 'Forearm Trainer', bodyPart: 'Arms' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Hip Adduction / Abduction Combo', bodyPart: 'Legs' },
                    { name: 'Glute Ham', bodyPart: 'Legs' },
                    { name: 'Abdominal', bodyPart: 'Core' },
                    { name: 'Rotary Torso', bodyPart: 'Core' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Mid Row', bodyPart: 'Back' },
                    { name: 'Low Back Extension', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Calf Raise', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
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
                    { name: 'Squat Stand', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Barbells',
                type: 'Barbell',
                machines: [
                    { name: 'Ohio Power Bar', bodyPart: 'Multi-Use' },
                    { name: 'Ohio Bar', bodyPart: 'Multi-Use' },
                    { name: 'Ohio Deadlift Bar', bodyPart: 'Back' },
                    { name: 'Bella Bar', bodyPart: 'Multi-Use' },
                    { name: 'EZ Curl Bar', bodyPart: 'Arms' },
                    { name: 'Safety Squat Bar', bodyPart: 'Legs' },
                    { name: 'Trap Bar', bodyPart: 'Multi-Use' },
                ],
            },
            {
                name: 'Benches',
                type: 'Bench',
                machines: [
                    { name: 'Flat Utility Bench', bodyPart: 'Multi-Use' },
                    { name: 'Adjustable Bench', bodyPart: 'Multi-Use' },
                    { name: 'Decline Bench', bodyPart: 'Chest' },
                    { name: 'Competition Bench', bodyPart: 'Chest' },
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
                    { name: 'Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Standing Chest Press', bodyPart: 'Chest' },
                    { name: 'ISO Flat Press', bodyPart: 'Chest' },
                    { name: 'ISO Incline Press', bodyPart: 'Chest' },
                    { name: 'Incline Fly', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lever Row', bodyPart: 'Back' },
                    { name: 'ISO Multi Row', bodyPart: 'Back' },
                    { name: 'Vertical Row', bodyPart: 'Back' },
                    { name: 'T Bar Row', bodyPart: 'Back' },
                    { name: 'Multi Grip Pulldown/High Row', bodyPart: 'Back' },
                    { name: 'ISO Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Linear Smith Row', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'ISO Conv Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Viking Press', bodyPart: 'Shoulders' },
                    { name: 'Linear Smith Shoulder Press', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Tricep Kickback/Dip', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Power Squat', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Linear Hack Squat', bodyPart: 'Legs' },
                    { name: 'Hip Hack Press', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Bilateral Leg Press', bodyPart: 'Legs' },
                    { name: 'Horizontal Leg Press', bodyPart: 'Legs' },
                    { name: 'Linear Leg Press', bodyPart: 'Legs' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension / Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Glute Bridge', bodyPart: 'Legs' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs' },
                    // Multi
                    { name: 'Multi Flex', bodyPart: 'Full Body' },
                    { name: 'Posterior Chain Developer', bodyPart: 'Back' },
                ],
            },
            {
                name: 'Forge-X',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Wide Chest Press', bodyPart: 'Chest' },
                    { name: 'Upright Decline Fly', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Scorpion High Row', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Diverging Row', bodyPart: 'Back' },
                    { name: 'Seated ISO Bicep Curl', bodyPart: 'Arms' },
                    { name: 'Seated Tricep Extension', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Pivot Leg Press', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'M-1',
                type: 'Selectorized',
                machines: [
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Lat Pullover', bodyPart: 'Back' },
                    { name: 'Pec Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Bicep Curl', bodyPart: 'Arms' },
                    { name: 'Overhead Tricep Extension', bodyPart: 'Arms' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Seated Leg Extension', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs' },
                    { name: 'Inner/Outer Thigh', bodyPart: 'Legs' },
                    { name: 'Glute Isolator', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Donkey Calf Raise', bodyPart: 'Legs' },
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
                    { name: 'Olympic Flat Bench', bodyPart: 'Chest' },
                    { name: 'Olympic Incline Bench', bodyPart: 'Chest' },
                    { name: 'Olympic Decline Bench', bodyPart: 'Chest' },
                    { name: 'Olympic Military Bench', bodyPart: 'Shoulders' },
                    { name: 'Competition Flat Bench', bodyPart: 'Chest' },
                    { name: 'Adjustable Lumbar Incline Bench', bodyPart: 'Chest' },
                    { name: 'Multi Adjustable Bench', bodyPart: 'Full Body' },
                    { name: 'Flat Bench', bodyPart: 'Full Body' },
                    { name: 'Adjustable Decline Bench', bodyPart: 'Full Body' },
                    // Stations
                    { name: 'Standing Preacher Curl Bench', bodyPart: 'Arms' },
                    { name: 'Bent-Over Row Bench', bodyPart: 'Back' },
                    { name: 'Dumbbell/Row Kickback Bench', bodyPart: 'Back' },
                    { name: '45 Degree Back Extension', bodyPart: 'Back' },
                    { name: 'Glute/Ham Developer', bodyPart: 'Legs' },
                    { name: 'Sissy Squat Stand', bodyPart: 'Legs' },
                    { name: 'Vertical Knee Raise/Dip Station', bodyPart: 'Core' },
                    { name: 'Push Pull Sled', bodyPart: 'Full Body' },
                    { name: 'Deadlift Jack', bodyPart: 'Full Body' },
                    { name: 'Squat Box', bodyPart: 'Legs' },
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
                    { name: 'Wide Chest Press', bodyPart: 'Chest' },
                    { name: 'Wide Chest Press 2', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press 2', bodyPart: 'Chest' },
                    { name: 'Seated Chest Press (Rotary)', bodyPart: 'Chest' },
                    { name: 'Chest & Decline Combo', bodyPart: 'Chest' },
                    { name: 'Chest & Decline Combo 2', bodyPart: 'Chest' },
                    { name: 'Pec Dec Fly', bodyPart: 'Chest' },
                    { name: 'Pec Dec Fly with Reverse', bodyPart: 'Chest' },
                    { name: 'Torque Pec Dec Fly', bodyPart: 'Chest' },
                    // Back
                    { name: '2 Way Row', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Standing & Seated Row Combo', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Low Row (Rotary)', bodyPart: 'Back' },
                    { name: 'Bentover Row', bodyPart: 'Back' },
                    { name: 'Front Row', bodyPart: 'Back' },
                    { name: 'High Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Linear T-Bar Row', bodyPart: 'Back' },
                    { name: 'Vertical Pulldown', bodyPart: 'Back' },
                    { name: 'Wide Pulldown Front', bodyPart: 'Back' },
                    { name: 'Wide Pulldown Rear', bodyPart: 'Back' },
                    { name: 'Wide Pulldown Rear 2', bodyPart: 'Back' },
                    { name: 'Plate Loaded Lat Pulldown', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Overhead Extension', bodyPart: 'Arms' },
                    { name: 'Arm Curl', bodyPart: 'Arms' },
                    { name: 'Plate Loaded Arm Curl', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Hack Squat Premium', bodyPart: 'Legs' },
                    { name: 'Hack Press', bodyPart: 'Legs' },
                    { name: 'V-Squat', bodyPart: 'Legs' },
                    { name: 'Drop Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Power Leg Press', bodyPart: 'Legs' },
                    { name: 'Power Leg Press Premium', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Squat & Calf Raise', bodyPart: 'Legs' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs' },
                    { name: 'Glute Kickback', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Hip Thrust (Rotary)', bodyPart: 'Legs' },
                    { name: 'Glute Ham', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'OnHim',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Chest Press (Rotary)', bodyPart: 'Chest' },
                    { name: 'Pec Dec Fly (with Reverse)', bodyPart: 'Chest' },
                    { name: 'Standing Fly Chest & Back', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown (High Pulley)', bodyPart: 'Back' },
                    { name: 'Advance Pro Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Seated Row (Inward)', bodyPart: 'Back' },
                    { name: 'Seated Row (Outward)', bodyPart: 'Back' },
                    { name: 'Reverse Hyper', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Seated Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Single Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Arm Curl', bodyPart: 'Arms' },
                    { name: 'Seated Dip', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Glute Kickback', bodyPart: 'Legs' },
                    { name: 'Kneeling Hip Raise', bodyPart: 'Legs' },
                    { name: 'Hip Adduction/Abduction Combo', bodyPart: 'Legs' },
                    { name: 'Hip Abduction (Single Move)', bodyPart: 'Legs' },
                    { name: 'Chin-Up/Dip Assist', bodyPart: 'Full Body' },
                    // Core
                    { name: 'Rotary Torso', bodyPart: 'Core' },
                    // Cable
                    { name: 'Adjustable Low Pulley', bodyPart: 'Full Body' },
                    { name: 'Multi Low Cable', bodyPart: 'Full Body' },
                ],
            },
            {
                name: 'Plate',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Flat Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Decline Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Multi Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs' },
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
                    { name: 'Squat Rack', bodyPart: 'Legs' },
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
                    { name: 'Olympic Bench', bodyPart: 'Chest' },
                    { name: 'Olympic Incline Bench', bodyPart: 'Chest' },
                    { name: 'Olympic Decline Bench', bodyPart: 'Chest' },
                    { name: 'MV Olympic Bench', bodyPart: 'Chest' },
                    { name: 'Adjustable Incline Bench', bodyPart: 'Full Body' },
                    { name: 'Adjustable Incline Bench Pro', bodyPart: 'Full Body' },
                    { name: 'Adjustable Decline Bench', bodyPart: 'Full Body' },
                    { name: 'Flat Bench', bodyPart: 'Full Body' },
                    { name: 'Utility Bench', bodyPart: 'Full Body' },
                    { name: 'Hip Thrust Bench', bodyPart: 'Legs' },
                    { name: 'Preacher Curl Bench (Rotary)', bodyPart: 'Arms' },
                    { name: 'Preacher Curl Bench (Stand)', bodyPart: 'Arms' },
                    { name: 'Bentover Support Bench', bodyPart: 'Back' },
                    { name: 'Sit Up', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Functional',
                type: 'Bodyweight',
                machines: [
                    { name: 'Roman Chair (45-90 Adjustable)', bodyPart: 'Back' },
                    { name: '90 Degree Roman Chair (GHD)', bodyPart: 'Back' },
                    { name: 'Moving Leg Raise', bodyPart: 'Core' },
                    { name: 'Dip & Leg Raise', bodyPart: 'Arms' },
                    { name: 'Twist Double', bodyPart: 'Core' },
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
                    { name: 'Plate-Loaded Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Flat/Decline Pro', bodyPart: 'Chest' },
                    { name: 'Leverage Chest Press', bodyPart: 'Chest' },
                    // Back
                    { name: 'Plate-Loaded Row', bodyPart: 'Back' },
                    { name: 'ISO-Lateral Row', bodyPart: 'Back' },
                    { name: '45 Degree Linear Iso Row Pro', bodyPart: 'Back' },
                    { name: '45 Degree Linear Row', bodyPart: 'Back' },
                    { name: 'T-Bar Linear Row', bodyPart: 'Back' },
                    { name: 'Seated Linear Row', bodyPart: 'Back' },
                    { name: 'Seated Smith Row', bodyPart: 'Back' },
                    { name: 'Plate-Loaded Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Leverage Pulldown', bodyPart: 'Back' },
                    { name: 'Lat Pulldown/Low Row 2-in-1', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Plate-Loaded Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Shoulder/Incline Pro', bodyPart: 'Shoulders' },
                    // Legs
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'True Squat Pro', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Swimming Squat', bodyPart: 'Legs' },
                    { name: 'Multi Squat (V Squat)', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension/Leg Curl 2-in-1', bodyPart: 'Legs' },
                    { name: 'Seated Calf Raise', bodyPart: 'Legs' },
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
                    { name: 'Seated Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Converging Chest Press', bodyPart: 'Chest' },
                    { name: 'Decline/Flat Converging Bench Press', bodyPart: 'Chest' },
                    { name: 'Lying Converging Bench Press', bodyPart: 'Chest' },
                    { name: 'Pec/Rear Delt Fly Combo', bodyPart: 'Chest' },
                    { name: 'Vertical Pec Fly', bodyPart: 'Chest' },
                    { name: 'Pullover', bodyPart: 'Chest' },
                    { name: 'Multi-Press', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Incline T-Bar Row', bodyPart: 'Back' },
                    { name: 'Incline Row', bodyPart: 'Back' },
                    { name: 'Diverging Row', bodyPart: 'Back' },
                    { name: 'Vertical Row', bodyPart: 'Back' },
                    { name: 'Assisted Chin/Dip', bodyPart: 'Back' },
                    { name: 'Incline Hyper Extension', bodyPart: 'Back' },
                    { name: 'Reverse Hyper Extension', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Converging Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Standing Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Seated Side/Rear Deltoid', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Horizontal Curl', bodyPart: 'Arms' },
                    { name: 'Biceps Isolator', bodyPart: 'Arms' },
                    { name: 'Seated Preacher Curl', bodyPart: 'Arms' },
                    { name: 'Overhead Triceps', bodyPart: 'Arms' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Incline Triceps Pushdown', bodyPart: 'Arms' },
                    { name: 'French Press', bodyPart: 'Arms' },
                    { name: 'Biceps-Triceps Combo', bodyPart: 'Arms' },
                    { name: 'Multi-Forearm', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Extension/Leg Curl Combo', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: '40 Degree Leg Press', bodyPart: 'Legs' },
                    { name: 'Horizontal Leg Press', bodyPart: 'Legs' },
                    { name: 'Pivot Press', bodyPart: 'Legs' },
                    { name: 'Glute Machine', bodyPart: 'Legs' },
                    { name: 'Total Hip', bodyPart: 'Legs' },
                    { name: 'Adductor/Abductor Combo', bodyPart: 'Legs' },
                    { name: 'Sissy Squat', bodyPart: 'Legs' },
                    // Calves
                    { name: 'Standing Calf', bodyPart: 'Legs' },
                    { name: 'Seated Calf', bodyPart: 'Legs' },
                    { name: 'Incline Calf Raise', bodyPart: 'Legs' },
                    { name: 'Tibia Dorsi Flexion', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Rotation', bodyPart: 'Core' },
                    { name: 'Dual Seated Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Power',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Shrug and Deadlift Machine', bodyPart: 'Back' },
                    { name: 'Unilateral Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Front Pulldown', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Seal Row', bodyPart: 'Back' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Viking Press', bodyPart: 'Shoulders' },
                    { name: 'Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Decline Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Flat Pec Fly', bodyPart: 'Chest' },
                    { name: 'Incline Pec Fly', bodyPart: 'Chest' },
                    { name: 'Preacher Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms' },
                    { name: 'Power Squat Pro', bodyPart: 'Legs' },
                    { name: 'Hack Squat Pro', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat Pro', bodyPart: 'Legs' },
                    { name: 'Unilateral Leg Press Pro', bodyPart: 'Legs' },
                    { name: 'Vertical Leg Press', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Hip Thruster Pro', bodyPart: 'Legs' },
                    { name: 'Glute Abductor', bodyPart: 'Legs' },
                    { name: 'Glute and Ham Developer', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Natural Motion',
                type: 'Cable',
                machines: [
                    { name: 'Functional Training System', bodyPart: 'Full Body' },
                    { name: 'Dynamic Functional Training System', bodyPart: 'Full Body' },
                    { name: 'Unilateral Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Unilateral Low Row', bodyPart: 'Back' },
                ],
            },
            {
                name: 'Bench',
                type: 'Bench',
                machines: [
                    { name: 'Utility Bench', bodyPart: 'Full Body' },
                    { name: 'Adjustable Sit Up Bench', bodyPart: 'Core' },
                    { name: 'Standing Preacher Curl', bodyPart: 'Arms' },
                    { name: 'Adjustable Single Leg Squat Stand', bodyPart: 'Legs' },
                    { name: 'Standing Leg Raise', bodyPart: 'Core' },
                    { name: 'Flat Dumbbell Bench with Pivots', bodyPart: 'Chest' },
                    { name: 'Incline Dumbbell Bench with Pivots', bodyPart: 'Chest' },
                    { name: 'Decline Dumbbell Bench with Pivots', bodyPart: 'Chest' },
                    { name: 'Olympic Incline Bench Press', bodyPart: 'Chest' },
                    { name: 'Poliquin Seated Preacher Curl', bodyPart: 'Arms' },
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
                    { name: 'Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder/Incline', bodyPart: 'Shoulders' },
                    { name: '3-Way Row', bodyPart: 'Back' },
                    { name: 'Lat Combo Pull', bodyPart: 'Back' },
                    { name: 'Power Squat Pro', bodyPart: 'Legs' },
                    { name: 'Power Squat Pro XT', bodyPart: 'Legs' },
                    { name: 'Seated Squat Pro', bodyPart: 'Legs' },
                    { name: 'Hip Press', bodyPart: 'Legs' },
                    { name: 'Reverse Glute-Ham', bodyPart: 'Legs' },
                    { name: 'Prone Leg Curl', bodyPart: 'Legs' },
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
                    { name: 'Seated Chest Press', bodyPart: 'Chest' },
                    { name: 'Inner Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly', bodyPart: 'Chest' },
                    { name: 'Pec Fly with Pads', bodyPart: 'Chest' },
                    { name: 'Chest Crossover', bodyPart: 'Chest' },
                    { name: 'Standing Chest Crossover', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Iso Lat', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Seated Row without Chest Support', bodyPart: 'Back' },
                    { name: 'Incline Row Combo', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back' },
                    { name: 'Chin/Dip Assist', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back' },
                    { name: '45° Back Extension', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Standing Shoulder Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Reverse Fly / Rear Delt', bodyPart: 'Shoulders' },
                    { name: 'Neck Press', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Bicep Curl', bodyPart: 'Arms' },
                    { name: 'Horizontal Biceps', bodyPart: 'Arms' },
                    { name: 'Seated Preacher Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Overhead', bodyPart: 'Arms' },
                    { name: 'Dip Machine', bodyPart: 'Arms' },
                    { name: 'Forearms Machine', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Seated Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Lying Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Donkey Calf Raise', bodyPart: 'Legs' },
                    { name: 'Abductor', bodyPart: 'Legs' },
                    { name: 'Adductor', bodyPart: 'Legs' },
                    { name: 'Radial Gluteus', bodyPart: 'Legs' },
                    { name: 'Kneeling Glutes Kick', bodyPart: 'Legs' },
                    { name: 'Bootymizer', bodyPart: 'Legs' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal', bodyPart: 'Core' },
                    { name: 'Total Ab', bodyPart: 'Core' },
                    { name: 'Ab Crunch', bodyPart: 'Core' },
                    { name: 'Lying Abdominal', bodyPart: 'Core' },
                    { name: 'Twister Machine', bodyPart: 'Core' },
                    { name: 'Leg Raise', bodyPart: 'Core' },
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
                    { name: 'Seated Chest Press Dual', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press Dual', bodyPart: 'Chest' },
                    { name: 'Decline Chest Press Dual', bodyPart: 'Chest' },
                    { name: 'Pec Fly Dual', bodyPart: 'Chest' },
                    { name: 'Chest Crossover Dual', bodyPart: 'Chest' },
                    { name: 'Lying Inner Chest Dual', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown Dual', bodyPart: 'Back' },
                    { name: 'Seated Row Dual', bodyPart: 'Back' },
                    { name: 'Low Row Dual', bodyPart: 'Back' },
                    { name: 'High Row Dual', bodyPart: 'Back' },
                    { name: 'Power Row Dual', bodyPart: 'Back' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Bent Over Row', bodyPart: 'Back' },
                    { name: '55° Rowing Machine', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press Dual', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Lateral Raise Dual', bodyPart: 'Shoulders' },
                    { name: 'Reverse Fly / Rear Delt Dual', bodyPart: 'Shoulders' },
                    { name: 'Viking Press', bodyPart: 'Shoulders' },
                    { name: 'Neck Press', bodyPart: 'Shoulders' },
                    { name: 'Standing Multi-Joint', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Biceps Machine', bodyPart: 'Arms' },
                    { name: 'Biceps Overhead', bodyPart: 'Arms' },
                    { name: 'Triceps Machine', bodyPart: 'Arms' },
                    { name: 'Triceps Dip Dual', bodyPart: 'Arms' },
                    { name: 'Overhead Triceps', bodyPart: 'Arms' },
                    // Legs
                    { name: '45° Linear Leg Press', bodyPart: 'Legs' },
                    { name: '45° Pivot Leg Press', bodyPart: 'Legs' },
                    { name: 'Seated Leg Press Dual', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs' },
                    { name: 'Inverse Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Booty Booster Special', bodyPart: 'Legs' },
                    { name: 'Glutes Kick Machine', bodyPart: 'Legs' },
                    { name: '55° Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Donkey Calf', bodyPart: 'Legs' },
                    { name: 'Standing Abduction', bodyPart: 'Legs' },
                    { name: 'Abduction 3D', bodyPart: 'Legs' },
                    { name: 'Tibia Dorsi Flexion', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Rotating Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Ab Swing', bodyPart: 'Core' },
                    { name: 'Lying Abdominal', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Pure Kraft Strong',
                type: 'Plate-Loaded',
                machines: [
                    { name: 'Bench Press Dual', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press Dual', bodyPart: 'Chest' },
                    { name: 'Decline Chest Press Dual', bodyPart: 'Chest' },
                    { name: 'Shoulder Press Dual', bodyPart: 'Shoulders' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Innovation',
                type: 'Selectorized',
                machines: [
                    { name: 'Curler', bodyPart: 'Arms' },
                    { name: 'Pec Fly / Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder & Lat Pull', bodyPart: 'Shoulders' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Glutes Machine', bodyPart: 'Legs' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly', bodyPart: 'Chest' },
                    { name: 'Crossover Machine', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Chin/Dip Assist', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Reverse Fly / Rear Delt', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Bicep Curl', bodyPart: 'Arms' },
                    { name: 'Tricep Extension', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Calf', bodyPart: 'Legs' },
                    { name: 'Abductor', bodyPart: 'Legs' },
                    { name: 'Adductor', bodyPart: 'Legs' },
                    { name: 'Radial Glutes', bodyPart: 'Legs' },
                    // Arms
                    { name: 'Standing Scott Curl', bodyPart: 'Arms' },
                    // Core
                    { name: 'Ab Crunch', bodyPart: 'Core' },
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
                    { name: 'Standing Chest Press', bodyPart: 'Chest' },
                    { name: 'FTM Incline Press', bodyPart: 'Chest' },
                    { name: 'Bent Over Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Triceps Dip', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Sissy Squat', bodyPart: 'Legs' },
                    { name: 'Reverse Hyper Extension', bodyPart: 'Back' },
                    { name: 'FTM Deadlift Machine', bodyPart: 'Back' },
                    { name: 'FTM Push & Pull Machine', bodyPart: 'Full Body' },
                    { name: 'Glute Booster Rack', bodyPart: 'Legs' },
                    { name: 'Power Rack Cable', bodyPart: 'Full Body' },
                    { name: 'Jammer Arms', bodyPart: 'Full Body' },
                    { name: 'Gripper', bodyPart: 'Arms' },
                ],
            },
            {
                name: '80Classics BW',
                type: 'Bodyweight',
                machines: [
                    { name: 'Abdominal Flexor', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Outdoor',
                type: 'Bodyweight',
                machines: [
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Butterfly', bodyPart: 'Chest' },
                    { name: 'Back Pull', bodyPart: 'Back' },
                    { name: 'Standing Chest Press', bodyPart: 'Chest' },
                    { name: 'Standing Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Standing Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Standing Triceps Dip', bodyPart: 'Arms' },
                    { name: 'Standing Multi-Joint', bodyPart: 'Full Body' },
                    { name: 'Squat Machine', bodyPart: 'Legs' },
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
                    { name: 'Incline Bench Press', bodyPart: 'Chest' },
                    { name: 'Seated Chest Press', bodyPart: 'Chest' },
                    { name: 'Bench Press', bodyPart: 'Chest' },
                    { name: 'Pec Deck', bodyPart: 'Chest' },
                    { name: 'Decline Chest Press', bodyPart: 'Chest' },
                    { name: 'Standing Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press/Chest Flyes', bodyPart: 'Chest' },
                    // Back
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Lateral Pulldown', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'High Row', bodyPart: 'Back' },
                    { name: 'Hip & Back Extension', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Rotation', bodyPart: 'Shoulders' },
                    { name: 'Upright Row', bodyPart: 'Shoulders' },
                    { name: 'Viking Press', bodyPart: 'Shoulders' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Leg Press/Hack Combo', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Standing Abductor', bodyPart: 'Legs' },
                    { name: 'Donkey Calf Raise', bodyPart: 'Legs' },
                    { name: 'Tibia Dorsi Flexion', bodyPart: 'Legs' },
                    { name: 'Glute Kickback', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'General',
                type: 'Selectorized',
                machines: [
                    // Chest
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Seated Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Deck', bodyPart: 'Chest' },
                    { name: 'Wide Chest Standing', bodyPart: 'Chest' },
                    { name: 'Pullover', bodyPart: 'Chest' },
                    // Back
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Lateral Pulldown', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Chin/Dip Multi', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Rotation Seated', bodyPart: 'Shoulders' },
                    { name: 'Shoulder Rotation Standing', bodyPart: 'Shoulders' },
                    { name: 'Rear Deltoid/Pec Deck', bodyPart: 'Shoulders' },
                    { name: 'Rear Deltoid Shoulder', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Pushdown', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Biceps/Triceps Combo', bodyPart: 'Arms' },
                    { name: 'Forearm Machine', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension/Leg Curl Combo', bodyPart: 'Legs' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs' },
                    { name: 'Standing Calf Press', bodyPart: 'Legs' },
                    { name: 'Seated Calf Press 45°', bodyPart: 'Legs' },
                    { name: 'Adductor/Abductor', bodyPart: 'Legs' },
                    // Core
                    { name: 'Seated Abs', bodyPart: 'Core' },
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
                    { name: 'Model D Rower', bodyPart: 'Cardio' },
                    { name: 'Model E Rower', bodyPart: 'Cardio' },
                    { name: 'SkiErg', bodyPart: 'Cardio' },
                    { name: 'BikeErg', bodyPart: 'Cardio' },
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
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
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
