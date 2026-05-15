// Equipment Library — sample data shared across directions
// Realistic enough to read as a real inventory; not exhaustive.

const EQ_DATA = {
  // Gyms the user has saved
  gyms: [
    {
      id: 'absolute',
      name: 'Absolute Recomp',
      city: 'Austin',
      lastVisit: '2 days ago',
      count: 47,
      isCurrent: true,
      coverage: { chest: 0.85, back: 0.9, legs: 0.75, shoulders: 0.6, arms: 0.8, core: 0.4 },
    },
    {
      id: 'vegas',
      name: 'Strip District Fitness',
      city: 'Las Vegas',
      lastVisit: '3 weeks ago',
      count: 22,
      coverage: { chest: 0.5, back: 0.4, legs: 0.6, shoulders: 0.3, arms: 0.4, core: 0.2 },
    },
    {
      id: 'home',
      name: 'Home garage',
      city: '',
      lastVisit: 'Sunday',
      count: 8,
      coverage: { chest: 0.4, back: 0.3, legs: 0.5, shoulders: 0.2, arms: 0.5, core: 0.6 },
    },
    {
      id: 'hotel',
      name: 'Marriott Pittsburgh',
      city: 'Pittsburgh · travel',
      lastVisit: 'Last Oct',
      count: 12,
      coverage: { chest: 0.4, back: 0.3, legs: 0.4, shoulders: 0.3, arms: 0.5, core: 0.3 },
    },
  ],

  // Brands and lines (a subset of the 21 brands x 1300 machines)
  brands: [
    { id: 'panatta', name: 'Panatta', country: 'IT', lines: ['Fit Evo', 'Freeweight', 'HP Rotor'] },
    { id: 'newtech', name: 'Newtech', country: 'IT', lines: ['Origin', 'Liberty', 'Plate-Loaded'] },
    { id: 'hammer', name: 'Hammer Strength', country: 'US', lines: ['Plate-Loaded', 'Select'] },
    { id: 'rogue', name: 'Rogue Fitness', country: 'US', lines: ['Monster', 'Echo'] },
    { id: 'precor', name: 'Precor', country: 'US', lines: ['Discovery', 'Vitality'] },
    { id: 'cybex', name: 'Cybex', country: 'US', lines: ['Eagle NX', 'VR3'] },
    { id: 'nautilus', name: 'Nautilus', country: 'US', lines: ['Inspiration', 'Impact'] },
    { id: 'lifefit', name: 'Life Fitness', country: 'US', lines: ['Signature', 'Insignia'] },
  ],

  // Equipment items — used in lists. type matches EQ_TOKENS.equip keys.
  items: [
    // Chest
    { id: '1', name: 'Incline Chest Press 2',  brand: 'Newtech',          line: 'Origin',        type: 'plateLoaded',  bp: 'chest', exercises: ['Incline Press', 'Close-grip Press'], lastUsed: 'Tue', gyms: ['absolute'] },
    { id: '2', name: 'Iso-Lateral Bench',      brand: 'Hammer Strength',  line: 'Plate-Loaded',  type: 'plateLoaded',  bp: 'chest', exercises: ['Bench Press', 'Incline Press'], lastUsed: '6d',  gyms: ['absolute', 'vegas'] },
    { id: '3', name: 'Pec Deck',               brand: 'Cybex',            line: 'Eagle NX',      type: 'selectorized', bp: 'chest', exercises: ['Chest Fly'], lastUsed: '2 wk', gyms: ['absolute'] },
    { id: '4', name: 'Cable Crossover',        brand: 'Life Fitness',     line: 'Signature',     type: 'cable',        bp: 'chest', exercises: ['Cable Fly', 'Crossover'], lastUsed: '4d', gyms: ['absolute', 'home'] },
    // Back
    { id: '5', name: 'Lat Pulldown',           brand: 'Panatta',          line: 'Fit Evo',       type: 'cable',        bp: 'back',  exercises: ['Lat Pulldown', 'Close-grip Pulldown'], lastUsed: 'Mon', gyms: ['absolute', 'vegas'] },
    { id: '6', name: 'Iso-Row',                brand: 'Hammer Strength',  line: 'Plate-Loaded',  type: 'plateLoaded',  bp: 'back',  exercises: ['Row', 'Wide-grip Row'], lastUsed: '6d', gyms: ['absolute'] },
    { id: '7', name: 'Seated Cable Row',       brand: 'Newtech',          line: 'Liberty',       type: 'cable',        bp: 'back',  exercises: ['Seated Row'], lastUsed: '3 wk', gyms: ['absolute'] },
    { id: '8', name: 'Pullup Tower',           brand: 'Rogue Fitness',    line: 'Monster',       type: 'bodyweight',   bp: 'back',  exercises: ['Pull-up', 'Chin-up'], lastUsed: 'Sun', gyms: ['absolute', 'home'] },
    // Legs
    { id: '9',  name: 'Hack Squat',            brand: 'Panatta',          line: 'Fit Evo',       type: 'plateLoaded',  bp: 'legs',  exercises: ['Hack Squat'], lastUsed: 'Fri', gyms: ['absolute', 'vegas'] },
    { id: '10', name: 'Leg Press 45°',         brand: 'Cybex',            line: 'Eagle NX',      type: 'plateLoaded',  bp: 'legs',  exercises: ['Leg Press'], lastUsed: 'Fri', gyms: ['absolute'] },
    { id: '11', name: 'Leg Extension',         brand: 'Nautilus',         line: 'Inspiration',   type: 'selectorized', bp: 'legs',  exercises: ['Leg Extension'], lastUsed: 'Fri', gyms: ['absolute', 'vegas'] },
    { id: '12', name: 'Lying Leg Curl',        brand: 'Nautilus',         line: 'Inspiration',   type: 'selectorized', bp: 'legs',  exercises: ['Leg Curl'], lastUsed: 'Fri', gyms: ['absolute'] },
    { id: '13', name: 'Power Rack',            brand: 'Rogue Fitness',    line: 'Monster',       type: 'rack',         bp: 'legs',  exercises: ['Back Squat', 'Front Squat', 'Deadlift'], lastUsed: 'Tue', gyms: ['absolute', 'home'] },
    // Shoulders
    { id: '14', name: 'Shoulder Press',        brand: 'Hammer Strength',  line: 'Plate-Loaded',  type: 'plateLoaded',  bp: 'shoulders', exercises: ['Shoulder Press'], lastUsed: '5d', gyms: ['absolute'] },
    { id: '15', name: 'Lateral Raise',         brand: 'Panatta',          line: 'HP Rotor',      type: 'selectorized', bp: 'shoulders', exercises: ['Lateral Raise'], lastUsed: '8d', gyms: ['absolute'] },
    // Arms
    { id: '16', name: 'Preacher Curl',         brand: 'Panatta',          line: 'Freeweight',    type: 'bench',        bp: 'arms', exercises: ['Preacher Curl'], lastUsed: '4d', gyms: ['absolute', 'home'] },
    { id: '17', name: 'Tricep Pushdown',       brand: 'Life Fitness',     line: 'Signature',     type: 'cable',        bp: 'arms', exercises: ['Pushdown'], lastUsed: '4d', gyms: ['absolute'] },
    // Free weights
    { id: '18', name: 'Dumbbell rack 5–120 lb', brand: 'Rogue Fitness',   line: 'Echo',          type: 'dumbbell',     bp: 'arms', exercises: ['Many'], lastUsed: 'Mon', gyms: ['absolute', 'home'] },
    { id: '19', name: 'Olympic barbell',       brand: 'Rogue Fitness',    line: 'Monster',       type: 'barbell',      bp: 'legs', exercises: ['Back Squat', 'Deadlift', 'Bench Press'], lastUsed: 'Tue', gyms: ['absolute', 'home'] },
    // Cardio
    { id: '20', name: 'Stairmaster Gauntlet',  brand: 'Precor',           line: 'Discovery',     type: 'cardio',       bp: 'cardio', exercises: ['Stairs'], lastUsed: '2 wk', gyms: ['absolute', 'hotel'] },
  ],

  // History orphans — names not yet linked to library items
  orphans: [
    { id: 'o1', name: 'Flat Bench',          context: 'Bench Press · 14 sessions',  suggestion: 'Iso-Lateral Bench (Hammer Strength)' },
    { id: 'o2', name: 'Pulldown machine',    context: 'Lat Pulldown · 9 sessions',  suggestion: 'Lat Pulldown (Panatta)' },
    { id: 'o3', name: 'New cable thing',     context: 'Pushdown · 3 sessions',      suggestion: null },
    { id: 'o4', name: 'Squat rack #4',       context: 'Back Squat · 22 sessions',   suggestion: 'Power Rack (Rogue Fitness)' },
    { id: 'o5', name: 'Mystery Machine',     context: 'Row · 1 session',            suggestion: null },
  ],

  // Body parts for chips
  bodyParts: ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'],
};

Object.assign(window, { EQ_DATA });
