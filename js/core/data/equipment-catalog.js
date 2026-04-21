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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
    // PANATTA
    // =========================================================================
    {
        brand: 'Panatta',
        lines: [
            {
                name: 'Fit Evo',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Vertical Chest Press', bodyPart: 'Chest' },
                    { name: 'Inclined Chest Press', bodyPart: 'Chest' },
                    { name: 'Pectoral Machine', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Pullover Machine', bodyPart: 'Back' },
                    { name: 'Lower Back', bodyPart: 'Back' },
                    { name: 'Curling Machine', bodyPart: 'Arms' },
                    { name: 'Standing Total Arms', bodyPart: 'Arms' },
                    { name: 'Triceps Machine', bodyPart: 'Arms' },
                    { name: 'Dips Press', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Gluteus Machine', bodyPart: 'Legs' },
                    { name: 'Hip Abductor', bodyPart: 'Legs' },
                    { name: 'Hip Adductor', bodyPart: 'Legs' },
                    { name: 'Calf Machine', bodyPart: 'Legs' },
                    { name: 'Multipurpose Press', bodyPart: 'Multi-Use' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Torsion Machine', bodyPart: 'Core' },
                    { name: 'Multi Press', bodyPart: 'Multi-Use' },
                ],
            },
            {
                name: 'SEC',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Rowing Machine', bodyPart: 'Back' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                    { name: 'Lower Back', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                ],
            },
            {
                name: 'FreeWeight Special',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Super Rowing', bodyPart: 'Back' },
                    { name: 'Super Pullover Machine', bodyPart: 'Back' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Leg Press 45°', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Standing Calf Raise', bodyPart: 'Legs' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Dip', bodyPart: 'Arms' },
                ],
            },
            {
                name: 'FreeWeight HP',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Monolith',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Incline Lever Row', bodyPart: 'Back' },
                    { name: 'High Row', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Standing Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Glute Drive', bodyPart: 'Legs' },
                ],
            },
            {
                name: 'Ultra',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly/Rear Delt', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Extension', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hip Abduction/Adduction', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Aura',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
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
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Biceps Curl', bodyPart: 'Arms' },
                    { name: 'Triceps Press', bodyPart: 'Arms' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Calf Extension', bodyPart: 'Legs' },
                    { name: 'Abdominal Crunch', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Resolute',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
                machines: [
                    // Chest
                    { name: 'Wide Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Chest Press', bodyPart: 'Chest' },
                    { name: 'Seated Chest Press (Rotary)', bodyPart: 'Chest' },
                    { name: 'Chest & Decline Combo', bodyPart: 'Chest' },
                    { name: 'Pec Dec Fly with Reverse', bodyPart: 'Chest' },
                    { name: 'Torque Pec Dec Fly', bodyPart: 'Chest' },
                    // Back
                    { name: 'Two Way Row', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Low Row', bodyPart: 'Back' },
                    { name: 'Bentover Row', bodyPart: 'Back' },
                    { name: 'Front Row', bodyPart: 'Back' },
                    { name: 'High Row', bodyPart: 'Back' },
                    { name: 'Back Extension', bodyPart: 'Back' },
                    { name: 'Wide Pulldown Front', bodyPart: 'Back' },
                    { name: 'Wide Pulldown Rear', bodyPart: 'Back' },
                    { name: 'Plate Loaded Lat Pulldown', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lateral Raise', bodyPart: 'Shoulders' },
                    { name: 'Overhead Extension', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'V-Squat', bodyPart: 'Legs' },
                    { name: 'Drop Squat', bodyPart: 'Legs' },
                    { name: 'Power Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Kneeling Leg Curl', bodyPart: 'Legs' },
                    { name: 'Lying Leg Curl', bodyPart: 'Legs' },
                    { name: 'Squat & Calf Raise', bodyPart: 'Legs' },
                    { name: 'Glute Kickback', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Glute Ham', bodyPart: 'Legs' },
                    // Arms
                    { name: 'Arm Curl', bodyPart: 'Arms' },
                    { name: 'Plate Loaded Arm Curl', bodyPart: 'Arms' },
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
                name: 'Plate-Loaded',
                type: 'Machine',
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
                name: 'Multi-Use',
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
                machines: [
                    // Chest
                    { name: 'Seated Chest Press', bodyPart: 'Chest' },
                    { name: 'Inner Chest Press', bodyPart: 'Chest' },
                    { name: 'Butterfly', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Chin/Dip Assist', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    // Arms
                    { name: 'Triceps Vertical', bodyPart: 'Arms' },
                    { name: 'Triceps Horizontal', bodyPart: 'Arms' },
                    { name: 'Bicep Curl', bodyPart: 'Arms' },
                    // Legs
                    { name: 'Seated Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Seated Leg Curl', bodyPart: 'Legs' },
                    { name: 'Seated Calf Press', bodyPart: 'Legs' },
                    { name: 'Abductor', bodyPart: 'Legs' },
                    { name: 'Adductor', bodyPart: 'Legs' },
                    { name: 'Radial Gluteus', bodyPart: 'Legs' },
                    // Core
                    { name: 'Abdominal', bodyPart: 'Core' },
                ],
            },
            {
                name: 'Pure Kraft',
                type: 'Machine',
                machines: [
                    // Chest
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Incline Bench Press Dual', bodyPart: 'Chest' },
                    { name: 'Decline Chest Press', bodyPart: 'Chest' },
                    { name: 'Pec Fly', bodyPart: 'Chest' },
                    // Back
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'T-Bar Row', bodyPart: 'Back' },
                    { name: 'Pullover', bodyPart: 'Back' },
                    { name: 'Back Rowing Bench', bodyPart: 'Back' },
                    // Shoulders
                    { name: 'Shoulder Press Dual', bodyPart: 'Shoulders' },
                    // Legs
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Hack Squat', bodyPart: 'Legs' },
                    { name: 'Belt Squat', bodyPart: 'Legs' },
                    { name: 'Pendulum Squat', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Hip Thrust', bodyPart: 'Legs' },
                    { name: 'Calf Raise', bodyPart: 'Legs' },
                    { name: 'Glute Kickback', bodyPart: 'Legs' },
                ],
            },
            {
                name: '80Classics',
                type: 'Machine',
                machines: [
                    { name: 'Chest Press', bodyPart: 'Chest' },
                    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
                    { name: 'Lat Pulldown', bodyPart: 'Back' },
                    { name: 'Seated Row', bodyPart: 'Back' },
                    { name: 'Leg Press', bodyPart: 'Legs' },
                    { name: 'Leg Extension', bodyPart: 'Legs' },
                    { name: 'Leg Curl', bodyPart: 'Legs' },
                    { name: 'Bicep Curl', bodyPart: 'Arms' },
                    { name: 'Tricep Extension', bodyPart: 'Arms' },
                    { name: 'Abdominal', bodyPart: 'Core' },
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
                name: 'Plate-Loaded',
                type: 'Machine',
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
                name: 'Selectorized',
                type: 'Machine',
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
                type: 'Machine',
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
                type: 'Machine',
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
