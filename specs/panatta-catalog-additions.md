# Panatta Catalog Additions — Definitive Product List

**Date:** 2026-04-21  
**Source:** panattasport.com official product pages (scraped via Chrome)  
**File to update:** `js/core/data/equipment-catalog.js`

This spec lists every machine from Panatta's website that is **missing from the current catalog**. Benches, racks, platforms, and accessories are excluded — only trainable machines that would appear in workout logs.

---

## Fit Evo (Selectorized) — 96 products on site, 27 in catalog

### Currently in catalog (27 machines)
Chest Press, Vertical Chest Press, Inclined Chest Press, Pectoral Machine, Shoulder Press, Lateral Raise, Lat Pulldown, Rowing Machine, Low Row, Pullover Machine, Lower Back, Curling Machine, Standing Total Arms, Triceps Machine, Dips Press, Leg Extension, Seated Leg Curl, Leg Press, Hack Squat, Gluteus Machine, Hip Abductor, Hip Adductor, Calf Machine, Multipurpose Press, Abdominal Crunch, Torsion Machine, Multi Press

### Machines to ADD

**Naming note:** Panatta uses "Pulley Row" on their site — our catalog has "Rowing Machine" which is the same thing. "Lateral Deltoids" = our "Lateral Raise". "Deltoid Press" = our "Shoulder Press". Keep existing names and add the new distinct machines below.

#### Chest (3 new)
```javascript
{ name: 'Vertical Chest Press Circular', bodyPart: 'Chest' },
{ name: 'Inclined Chest Press Circular', bodyPart: 'Chest' },
{ name: 'Total Press', bodyPart: 'Chest' },              // 1FE032, NEW product
```

#### Back (7 new)
```javascript
{ name: 'Lat Pulldown Circular', bodyPart: 'Back' },       // 1FE002
{ name: 'Lat Pulldown Convergent', bodyPart: 'Back' },     // 1FE007
{ name: 'Lat Pulldown Double Stack', bodyPart: 'Back' },   // 1FE101
{ name: 'High Row Convergent', bodyPart: 'Back' },         // 1FE006
{ name: 'Pulley Row Double Stack', bodyPart: 'Back' },     // 1FE103
{ name: 'Rowing Machine Circular', bodyPart: 'Back' },     // 1FE004A
{ name: 'Total Back', bodyPart: 'Back' },                  // 1FE008, NEW product
```

#### Shoulders (2 new)
```javascript
{ name: 'Deltoid Press', bodyPart: 'Shoulders' },          // 1FE025 (distinct from Shoulder Press)
{ name: 'Deltoid Press Circular', bodyPart: 'Shoulders' }, // 1FE024
```

#### Arms (10 new)
```javascript
{ name: 'French Press Machine', bodyPart: 'Arms' },        // 1FE153
{ name: 'Alternate Arm Extension', bodyPart: 'Arms' },     // 1FE057
{ name: 'Alternate Arm Extension 90', bodyPart: 'Arms' },  // 1FE357
{ name: 'Alternate Pronating Triceps', bodyPart: 'Arms' }, // 1FE557, NEW
{ name: 'Alternate Arm Curl', bodyPart: 'Arms' },          // 1FE056
{ name: 'Alternate Arm Curl 120', bodyPart: 'Arms' },      // 1FE356
{ name: 'Alternate Arm Curl -45', bodyPart: 'Arms' },      // 1FE456
{ name: 'Alternate Supinating Biceps', bodyPart: 'Arms' }, // 1FE556, NEW
{ name: 'Alternate Preacher Curl', bodyPart: 'Arms' },     // 1FE052
{ name: 'Alternate Standing Total Arms', bodyPart: 'Arms' }, // 1FE155
```

#### Legs (8 new)
```javascript
{ name: 'Leg Curling', bodyPart: 'Legs' },                 // 1FE082 (prone/lying, different from seated)
{ name: 'Standing Leg Curling', bodyPart: 'Legs' },        // 1FE084
{ name: 'Dual System Horizontal Leg Press', bodyPart: 'Legs' }, // 1FE095
{ name: 'Master Gluteus Plus', bodyPart: 'Legs' },         // 1FE094A ← Kevin's request
{ name: 'Hip Thrust', bodyPart: 'Legs' },                  // 1FE097
{ name: 'Standing Abductor Machine', bodyPart: 'Legs' },   // 1FE096
{ name: 'Adductor/Abductor Machine', bodyPart: 'Legs' },   // 1FE093
{ name: 'Multi Hip', bodyPart: 'Legs' },                   // 1FE090
{ name: 'Power Runner', bodyPart: 'Legs' },                // 1FE098
```

#### Core (1 new)
```javascript
{ name: 'Upper Abdominal', bodyPart: 'Core' },             // 1FE065
```

#### Shoulders/Chest (1 new)
```javascript
{ name: 'Standing Multi Flight', bodyPart: 'Shoulders' },  // 1FE028
{ name: 'Peck Back', bodyPart: 'Shoulders' },              // 1FE117
{ name: 'Rotary Cuff', bodyPart: 'Shoulders' },            // 1FE027
```

#### Multi-Use (5 new)
```javascript
{ name: 'Jungle Machine', bodyPart: 'Multi-Use' },         // 1FE115
{ name: 'Cable Crossover', bodyPart: 'Multi-Use' },        // 1FE111
{ name: 'Adjustable Cable Crossover', bodyPart: 'Multi-Use' }, // 1FE125
{ name: 'Smith Machine', bodyPart: 'Multi-Use' },          // 1FE113B
{ name: '4-Station Multi Gym', bodyPart: 'Multi-Use' },    // 1FE112
{ name: 'Standing Hip Thrust', bodyPart: 'Legs' },         // 1FE197, NEW
```

**Total Fit Evo additions: ~40 machines**

---

## FreeWeight Special (Plate-Loaded) — 77 products on site, 15 in catalog

### Currently in catalog (15 machines)
Chest Press, Incline Chest Press, Shoulder Press, Seated Row, Super Rowing, Super Pullover Machine, Lat Pulldown, T-Bar Row, Leg Press 45°, Hack Squat, Leg Extension, Leg Curl, Standing Calf Raise, Biceps Curl, Triceps Dip

### Machines to ADD

#### Chest (9 new)
```javascript
{ name: 'Super Vertical Chest Press', bodyPart: 'Chest' },       // 1FW036
{ name: 'Super Inclined Chest Press', bodyPart: 'Chest' },       // 1FW035
{ name: 'Super Declined Chest Press', bodyPart: 'Chest' },       // 1FW041
{ name: 'Super Horizontal Bench Press', bodyPart: 'Chest' },     // 1FW037
{ name: 'Super Inclined Bench Press', bodyPart: 'Chest' },       // 1FW033
{ name: 'Super Middle Chest Flight Machine', bodyPart: 'Chest' },// 1FW043
{ name: 'Super Upper Chest Flight Machine', bodyPart: 'Chest' }, // 1FW038
{ name: 'Super Lower Chest Flight Machine', bodyPart: 'Chest' }, // 1FW044
{ name: 'Super Horizontal Multi Press', bodyPart: 'Chest' },     // 1FW042
{ name: 'Super Vertical Multi Press', bodyPart: 'Chest' },       // 1FW045, NEW
```

#### Back (9 new)
```javascript
{ name: 'Super Lat Machine Convergent', bodyPart: 'Back' },      // 1FW001
{ name: 'Super Lat Pulldown Circular', bodyPart: 'Back' },       // 1FW101
{ name: 'Super High Row', bodyPart: 'Back' },                    // 1FW003
{ name: 'Super Power Row', bodyPart: 'Back' },                   // 1FW102
{ name: 'Super Low Row', bodyPart: 'Back' },                     // 1FW002
{ name: 'Super Rowing Circular', bodyPart: 'Back' },             // 1FW204
{ name: 'Super Dorsy Bar', bodyPart: 'Back' },                   // 1FW005
{ name: 'Front Dorsy Bar', bodyPart: 'Back' },                   // 1FW105
{ name: 'Pullover Machine', bodyPart: 'Back' },                  // 1FW139 (non-Super variant)
```

#### Shoulders (5 new)
```javascript
{ name: 'Super Deltoid Press', bodyPart: 'Shoulders' },          // 1FW025
{ name: 'Lateral Deltoids', bodyPart: 'Shoulders' },             // 1FW027
{ name: 'Back Deltoids', bodyPart: 'Shoulders' },                // 1FW026
{ name: 'Super Shrug Machine', bodyPart: 'Shoulders' },          // 1FW010
{ name: 'Viking Press and Calf', bodyPart: 'Shoulders' },        // 1FW029
{ name: 'Super Peck Back', bodyPart: 'Shoulders' },              // 1FW117, NEW
```

#### Arms (8 new)
```javascript
{ name: 'Super French Press Machine', bodyPart: 'Arms' },        // 1FW053
{ name: 'Triceps Machine', bodyPart: 'Arms' },                   // 1FW352
{ name: 'Alternate Triceps Machine', bodyPart: 'Arms' },         // 1FW252
{ name: 'Three Angles Triceps Machine', bodyPart: 'Arms' },      // 1FW452, NEW
{ name: 'Curling Machine', bodyPart: 'Arms' },                   // 1FW351
{ name: 'Alternate Curling Machine', bodyPart: 'Arms' },         // 1FW251
{ name: 'Four Angle Biceps Machine', bodyPart: 'Arms' },         // 1FW551, NEW
{ name: 'Alternate Preacher Curl Machine', bodyPart: 'Arms' },   // 1FW054, NEW
```

#### Legs (18 new)
```javascript
{ name: 'Super Leg Press Bridge', bodyPart: 'Legs' },            // 1FW085
{ name: 'Super Horizontal Leg Press Dual System', bodyPart: 'Legs' }, // 1FW100
{ name: 'Super Leg Press 45° Dual System', bodyPart: 'Legs' },   // 1FW090
{ name: 'Super Vertical Leg Press', bodyPart: 'Legs' },          // 1FW093
{ name: 'Vertical Leg Press', bodyPart: 'Legs' },                // 1FW193
{ name: 'Super Squat Machine', bodyPart: 'Legs' },               // 1FW091
{ name: 'Super Power Squat', bodyPart: 'Legs' },                 // 1FW084
{ name: 'Super Pendulum Squat', bodyPart: 'Legs' },              // 1FW080
{ name: 'Belt Squat', bodyPart: 'Legs' },                        // 1FW095
{ name: 'Super Calf Hack', bodyPart: 'Legs' },                   // 1FW092
{ name: 'Super Seated Calf', bodyPart: 'Legs' },                 // 1FW088
{ name: 'Donkey Calf', bodyPart: 'Legs' },                       // 1FW089
{ name: 'Super Lunge Machine', bodyPart: 'Legs' },               // 1FW079, NEW
{ name: 'Power Runner', bodyPart: 'Legs' },                      // 1FW098
{ name: 'Hip Thrust', bodyPart: 'Legs' },                        // 1FW097
{ name: 'Standing Abductor', bodyPart: 'Legs' },                 // 1FW099
{ name: '3D Abductor', bodyPart: 'Legs' },                       // 1FW199, NEW
{ name: 'Alternate Leg Extension', bodyPart: 'Legs' },           // 1FW281
{ name: 'Alternate Leg Curling', bodyPart: 'Legs' },             // 1FW082
{ name: 'Seated Leg Curling', bodyPart: 'Legs' },                // 1FW183
{ name: 'Kneeling Leg Curling', bodyPart: 'Legs' },              // 1FW094
{ name: 'Reverse Hyperextension', bodyPart: 'Legs' },            // 1FW096
```

#### Core (1 new)
```javascript
{ name: 'Total Core Crunch Machine', bodyPart: 'Core' },         // 1FW065, NEW
```

#### Multi-Use (2 new)
```javascript
{ name: 'Dips Press Dual System', bodyPart: 'Multi-Use' },       // 1FW040
{ name: 'Dips Press', bodyPart: 'Multi-Use' },                   // 1FW140
```

**Total FreeWeight Special additions: ~52 machines**

---

## Monolith (Selectorized) — 47 products on site, 10 in catalog

### Currently in catalog (10 machines)
Chest Press, Shoulder Press, Lat Pulldown, Seated Row, Leg Extension, Leg Curl, Leg Press, Biceps Curl, Triceps Extension, Abdominal Crunch

### Naming mismatches to fix
- Catalog "Chest Press" → Site has "Vertical Chest Press Circular" and "Inclined Chest Press Circular" (no generic "Chest Press")
- Catalog "Shoulder Press" → Site has "Deltoid Press Circular" (no generic "Shoulder Press")
- Catalog "Seated Row" → Site has "Pulley Row" (same machine)
- Catalog "Biceps Curl" → Site has "Curling Machine"
- Catalog "Triceps Extension" → Site has "Triceps Machine"

**Recommendation:** Rename existing entries to match Panatta's actual product names, then add the missing ones.

### Rename existing entries
```
'Chest Press' → remove (doesn't exist as standalone — split into the two circular presses below)
'Shoulder Press' → 'Deltoid Press Circular' (bodyPart: 'Shoulders')
'Seated Row' → 'Pulley Row' (bodyPart: 'Back')
'Biceps Curl' → 'Curling Machine' (bodyPart: 'Arms')
'Triceps Extension' → 'Triceps Machine' (bodyPart: 'Arms')
```

### Machines to ADD

#### Chest (3 new)
```javascript
{ name: 'Vertical Chest Press Circular', bodyPart: 'Chest' },
{ name: 'Inclined Chest Press Circular', bodyPart: 'Chest' },
{ name: 'Pectoral Machine', bodyPart: 'Chest' },
```

#### Back (5 new)
```javascript
{ name: 'Lat Pulldown Circular', bodyPart: 'Back' },
{ name: 'Lat Pulldown Convergent', bodyPart: 'Back' },
{ name: 'High Row Convergent', bodyPart: 'Back' },
{ name: 'Rowing Machine Circular', bodyPart: 'Back' },
{ name: 'Pullover Machine', bodyPart: 'Back' },
{ name: 'Lower Back', bodyPart: 'Back' },
```

#### Shoulders (1 new)
```javascript
{ name: 'Lateral Deltoid', bodyPart: 'Shoulders' },
```

#### Arms (4 new)
```javascript
{ name: 'Dips Press', bodyPart: 'Arms' },
{ name: 'French Press Machine', bodyPart: 'Arms' },
{ name: 'Alternate Arm Extension', bodyPart: 'Arms' },
{ name: 'Alternate Arm Curl', bodyPart: 'Arms' },
```

#### Legs (10 new)
```javascript
{ name: 'Seated Leg Curling', bodyPart: 'Legs' },
{ name: 'Abductor Machine', bodyPart: 'Legs' },
{ name: 'Adductor Machine', bodyPart: 'Legs' },
{ name: 'Dual Adductor Abductor Machine', bodyPart: 'Legs' },
{ name: 'Master Gluteus Plus', bodyPart: 'Legs' },
{ name: 'Gluteus Machine', bodyPart: 'Legs' },
{ name: 'Hip Thrust', bodyPart: 'Legs' },
{ name: 'Calf Hack Machine', bodyPart: 'Legs' },
{ name: 'Multi Hip', bodyPart: 'Legs' },
{ name: 'Standing Abductor', bodyPart: 'Legs' },
```

#### Multi-Use (5 new)
```javascript
{ name: 'Standing Multi Flight', bodyPart: 'Shoulders' },
{ name: 'Standing Total Arms', bodyPart: 'Arms' },
{ name: 'Peck Back', bodyPart: 'Shoulders' },
{ name: 'Jungle Machine', bodyPart: 'Multi-Use' },
{ name: 'Cable Crossover', bodyPart: 'Multi-Use' },
{ name: 'Adjustable Cable Crossover', bodyPart: 'Multi-Use' },
```

**Total Monolith additions: ~28 machines + 5 renames**

---

## SEC (Selectorized) — 51 products on site, 10 in catalog

### Currently in catalog (10 machines)
Chest Press, Shoulder Press, Lat Pulldown, Rowing Machine, Leg Extension, Leg Curl, Leg Press, Abdominal Crunch, Lower Back, Biceps Curl

### Naming mismatches to fix
- Catalog "Chest Press" → Site has "Vertical Chest Convergent" + "Inclined Chest Press" (no generic)
- Catalog "Shoulder Press" → Site has "Deltoid Press Convergent"
- Catalog "Rowing Machine" → matches site's "Rowing Machine" ✓
- Catalog "Leg Curl" → Site has "Leg Curling" (same thing)
- Catalog "Biceps Curl" → Site has "Curling Machine"

**Recommendation:** Keep existing generic names but add the specific variants.

### Machines to ADD

#### Chest (2 new)
```javascript
{ name: 'Vertical Chest Convergent', bodyPart: 'Chest' },  // 1SC034
{ name: 'Inclined Chest Press', bodyPart: 'Chest' },       // 1SC037
{ name: 'Pectoral Machine', bodyPart: 'Chest' },           // 1SC035
```

#### Back (1 new)
```javascript
{ name: 'Pulley Row', bodyPart: 'Back' },                  // 1SC003
```

#### Arms (1 new)
```javascript
{ name: 'Triceps Machine', bodyPart: 'Arms' },             // 1SC053
```

#### Core (1 new)
```javascript
{ name: 'Upper Abdominal', bodyPart: 'Core' },             // 1SC065
```

#### Legs (5 new)
```javascript
{ name: 'Seated Leg Curling', bodyPart: 'Legs' },          // 1SC083
{ name: 'Abductor Machine', bodyPart: 'Legs' },            // 1SC086
{ name: 'Adductor Machine', bodyPart: 'Legs' },            // 1SC087
{ name: 'Adductor/Abductor Machine', bodyPart: 'Legs' },   // 1SC093
{ name: 'Calf Machine', bodyPart: 'Legs' },                // 1SC089
{ name: 'Multi Hip', bodyPart: 'Legs' },                   // 1SC090
```

#### Shoulders (1 new)
```javascript
{ name: 'Peck Back', bodyPart: 'Shoulders' },              // 1SC117
```

#### Multi-Use (3 new)
```javascript
{ name: 'Jungle Machine', bodyPart: 'Multi-Use' },         // 1SC115
{ name: 'Cable Crossover', bodyPart: 'Multi-Use' },        // 1SC111
{ name: 'Adjustable Cable Crossover', bodyPart: 'Multi-Use' }, // 1SC120
```

**Total SEC additions: ~15 machines**

---

## FreeWeight HP (Plate-Loaded) — 19 products on site, 8 in catalog

### Important finding
The FreeWeight HP line on panattasport.com contains **only benches, racks, and platforms** (Jammer, Combo Twist, Squat Lunge, Power Tower, Olympic benches, Power Platform, etc.). There are **no selectorized or plate-loaded machines** like Chest Press, Shoulder Press, Lat Pulldown, etc.

The 8 machines currently in the catalog (Chest Press, Incline Chest Press, Shoulder Press, Lat Pulldown, Row, Leg Press, Leg Extension, Leg Curl) **do not appear on the Panatta website for FreeWeight HP**. These may have been discontinued, renamed, or moved to a different line.

**Recommendation:** Verify with Kevin whether he has FreeWeight HP machines at his gym. If not, consider removing or flagging these entries. They may be legacy entries from an older catalog.

### Machines to ADD (benches/racks only — may not be relevant)
```javascript
{ name: 'Jammer', bodyPart: 'Multi-Use', type: 'Plate-Loaded' },   // 1HP534
{ name: 'Combo Twist', bodyPart: 'Core', type: 'Plate-Loaded' },   // 1HP506
{ name: 'Squat Lunge', bodyPart: 'Legs', type: 'Plate-Loaded' },   // 1HP590
```

---

## Summary

| Line | On Site | In Catalog | To Add | New Total |
|------|---------|------------|--------|-----------|
| Fit Evo | 96 (53 machines + 43 benches/accessories) | 27 | ~40 | ~67 |
| FreeWeight Special | 77 (52 machines + 25 benches/racks) | 15 | ~52 | ~67 |
| Monolith | 47 (34 machines + 13 benches/racks) | 10 | ~28 + 5 renames | ~38 |
| SEC | 51 (33 machines + 18 benches/racks) | 10 | ~15 | ~25 |
| FreeWeight HP | 19 (all benches/racks) | 8 | 0-3 | 8-11 |
| **Total** | **290** | **70** | **~135** | **~205** |

## Implementation Order

1. **Fit Evo additions** — Kevin's primary machines (Master Gluteus Plus, Hip Thrust, Multi Hip, Power Runner, Peck Back, Standing Multi Flight, etc.)
2. **FreeWeight Special additions** — Major expansion (Super line machines)
3. **Monolith renames + additions** — Fix naming mismatches, add missing machines
4. **SEC additions** — Smaller expansion
5. **FreeWeight HP review** — Verify if current entries are correct

## Source URLs

All data scraped from official Panatta pages on 2026-04-21:
- Fit Evo: https://www.panattasport.com/en/fit-evo/ (pages 1-6)
- FreeWeight Special: https://www.panattasport.com/en/free-weight-special/ (pages 1-5)
- Monolith: https://www.panattasport.com/en/monolith/ (pages 1-3)
- SEC: https://www.panattasport.com/en/sec/ (pages 1-3)
- FreeWeight HP: https://www.panattasport.com/en/freeweight-hp/ (pages 1-2)
