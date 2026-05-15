# Equipment System v2 — Global Catalog + Gym Inventory + Exercise Mapping

## Overview

Evolve the static equipment catalog into a live Firestore-backed system where:
- A global catalog is readable by all users, editable by admin (Kevin)
- Users can quickly tag which equipment exists at each of their gyms
- Equipment maps to exercises it supports (admin-curated over time)
- The "gym view" lets you walk around and rapidly inventory a location

---

## Data Model

### Global Catalog (admin-owned)

```
equipmentCatalog/{brandSlug}
  name: "Newtech"
  lines: [
    {
      name: "M-Torture",
      type: "Plate-Loaded",
      machines: [
        {
          id: "newtech-m-torture-chest-press",
          name: "Chest Press",
          bodyPart: "Chest",
          exercises: ["barbell-bench-press", "machine-chest-press"],
          variants: [],          // optional: "Wide", "Narrow", etc.
          imageUrl: null         // future: photo from manufacturer
        }
      ]
    }
  ]
```

**Access rules:**
- All authenticated users: read
- Admin (Kevin's UID): write
- No user can modify the global catalog except admin

**Why brand-level docs?** Keeps reads efficient — loading one brand pulls its full tree. The current catalog is ~21 brands, so 21 docs max. Firestore 1MB doc limit is plenty for even the largest brand (~200 machines = ~50KB).

### User's Gym Inventory

```
users/{uid}/locations/{locationId}
  name: "Absolute Recomp"
  address: "..."
  coordinates: { lat, lng }
  equipment: [                    // NEW field — array of refs
    {
      catalogRef: "newtech/m-torture/chest-press",   // path into global catalog
      nickname: "The good chest press",              // optional user label
      notes: "Near the back wall",                   // optional
      addedAt: "2026-05-14T..."
    }
  ]
```

**Why on the location doc (not a subcollection)?**
- Typical gym has 30-80 machines — fits easily in one doc
- Single read to get full gym inventory
- Atomic updates when adding/removing equipment
- No pagination needed at this scale

**Alternative considered:** Separate `gymEquipment/{id}` subcollection. Better if gyms had 500+ items or needed individual ACLs. Overkill here.

### Exercise ↔ Equipment Mapping

Lives on the catalog machine (see `exercises` array above). Each entry is an exercise ID from the exercise library.

**Mapping types:**
- `primary`: The machine's intended use (Pec Dec → Pec Fly)
- `secondary`: Valid alternative uses (Cable Crossover → Face Pull, Tricep Pushdown, etc.)

```
machines: [
  {
    id: "newtech-onhim-pec-dec-fly",
    name: "Pec Dec Fly (with Reverse)",
    bodyPart: "Chest",
    exercises: {
      primary: ["machine-pec-fly", "reverse-pec-fly"],
      secondary: []
    }
  }
]
```

**Build strategy:** Start with `primary` only. Populate gradually — Kevin curates via Cowork sessions. Secondary comes later as the exercise library matures.

---

## UX: Gym View ("I'm walking around the gym")

### Entry Points

1. **Equipment Library page** → "My gyms" tab (new)
2. **Location card** in settings → tap → gym detail view
3. **During active workout** → location header shows gym name → tap for inventory

### Gym Detail Screen

```
┌─────────────────────────────┐
│ ← Absolute Recomp      [+] │  ← back + quick-add button
├─────────────────────────────┤
│ 🔍 Search equipment...      │  ← filters current inventory
├─────────────────────────────┤
│                             │
│ CHEST (4)                   │  ← grouped by bodyPart
│ ┌─────────────────────────┐ │
│ │ Newtech Chest Press     │ │
│ │ M-Torture · Plate-Loaded│ │
│ │ "The good chest press"  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Newtech Incline Press   │ │
│ │ M-Torture · Plate-Loaded│ │
│ └─────────────────────────┘ │
│                             │
│ BACK (6)                    │
│ ...                         │
│                             │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ 34 machines · Last updated  │
│ 3 days ago                  │
└─────────────────────────────┘
```

### Quick-Add Flow (the "walk around" mode)

Tapping [+] opens a bottom sheet optimized for speed:

```
┌─────────────────────────────┐
│ Add equipment               │
│ at Absolute Recomp          │
├─────────────────────────────┤
│ 🔍 Search catalog...        │  ← type "chest" or "newtech" or "m-torture"
├─────────────────────────────┤
│ Recent brands:              │
│ [Newtech] [gym80] [Arsenal] │  ← chips for brands you've added before
├─────────────────────────────┤
│                             │
│ Newtech › M-Torture         │  ← drill: brand → line → machine
│  ☑ Chest Press              │  ← already at this gym (checked)
│  ☐ Incline Chest Press      │  ← tap to add
│  ☐ Wide Chest Press         │
│  ☐ Decline Press            │
│                             │
│ Newtech › OnHim             │
│  ☐ Chest Press (Rotary)     │
│  ☐ Pec Dec Fly              │
│                             │
├─────────────────────────────┤
│ [Done]                      │  ← closes sheet, saves
└─────────────────────────────┘
```

**Key UX decisions:**
- **Checkbox-style multi-select** — tap, tap, tap as you walk. No confirm per item.
- **Already-added items show as checked** — prevents duplicates, lets you "uncheck" to remove
- **Search is global across brand + line + machine name** — "lat pull" finds all lat pulldowns across all brands
- **Recent brands float to top** — if you're at a Newtech gym, you'll mostly be adding Newtech
- **Batch save on Done** — one Firestore write for all additions

### Custom Equipment (not in catalog)

At the bottom of search results when no match:

```
│ Can't find it?              │
│ [Add custom equipment]      │  ← opens mini form: name, type, bodyPart
```

Custom equipment saves to `users/{uid}/equipment` (existing collection) AND gets tagged to the current location. Kevin can later promote popular custom entries to the global catalog.

---

## Migration Path

### Phase 1: Seed Firestore from static catalog

1. Write a one-time migration script that reads `equipment-catalog.js` and writes to `equipmentCatalog/{brandSlug}` docs
2. Keep the static JS file as fallback for offline/initial load
3. App loads from Firestore on auth, falls back to static if offline

### Phase 2: Gym inventory UI

1. Add `equipment` array field to location docs
2. Build gym detail view (read-only list of what's there)
3. Build quick-add sheet (the walk-around flow)
4. Wire up search across the catalog

### Phase 3: Exercise mapping

1. Add `exercises` field to catalog machines (start empty)
2. Kevin populates via Cowork sessions ("map Newtech machines to exercises")
3. UI shows "exercises for this machine" on gym detail view
4. Exercise library shows "machines for this exercise" (reverse lookup)

### Phase 4: Smart features (future)

- "What can I do at this gym?" → bodyPart filter on gym inventory → linked exercises
- AI Coach context: pass gym equipment list as context for plan generation
- "Suggest a workout using equipment at [gym]" 
- Equipment-based workout templates (auto-generated from gym inventory)

---

## Firestore Security Rules

```javascript
// Global catalog — all users read, admin write
match /equipmentCatalog/{brandId} {
  allow read: if request.auth != null;
  allow write: if request.auth.uid == 'KEVIN_UID';
}

// User locations (existing + new equipment field)
match /users/{userId}/locations/{locationId} {
  allow read, write: if request.auth.uid == userId;
}
```

---

## Open Questions

1. **Catalog update notifications** — When Kevin adds new machines to the global catalog, should users see a "new equipment available" indicator? Or just silently available in search?

2. **Community contributions** — Should users be able to "suggest" additions to the global catalog (goes into a review queue for Kevin)? Or keep it simple — Kevin manages it, users add custom for themselves.

3. **Equipment photos** — Worth storing manufacturer images? Would make the walk-around flow faster ("oh I recognize that machine"). Could link to manufacturer URLs initially.

4. **Sharing gym inventories** — If two users go to the same gym, should they see each other's inventory? Could enable a "community gym" concept where the first person to inventory a gym shares it with others there. (This connects to the Phase 19 community gym DB in the roadmap.)

5. **Offline support** — The quick-add flow should work offline (you might be in a gym basement with bad signal). Cache the catalog locally, queue writes.

---

## Scope for First Implementation

**In scope:**
- Firestore catalog seeding from static file
- Gym detail view (list equipment at a location)
- Quick-add sheet with search + multi-select
- Basic bodyPart grouping in gym view

**Out of scope (later):**
- Exercise mapping UI (Kevin does this via Cowork for now)
- AI Coach integration
- Community/shared gyms
- Equipment photos
- Offline queue
