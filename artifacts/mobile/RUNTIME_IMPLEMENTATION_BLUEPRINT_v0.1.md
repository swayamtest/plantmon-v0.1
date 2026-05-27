# RUNTIME IMPLEMENTATION BLUEPRINT v0.1
## PLANTMON — Authoritative Implementation Reference

**Generated from:** direct inspection of all source files  
**As of:** Phase 2.1 complete (v0.2.0-alpha)  
**Scope:** Actual implemented state — not the PRD, not the schema freeze aspirations  
**Purpose:** Authoritative reference for Phase 2.2 identity resolution, dataset synchronization, scheduler migration, and Supabase production migration

---

## CRITICAL PREAMBLE — LOCAL vs SUPABASE DIVERGENCE

The most important fact about the current system:

> **The Phase 2.1 schema exists ONLY in local SQL files. The live Supabase database has NOT been migrated. The runtime code has NOT been updated to use Phase 2.1 fields.**

Three distinct states exist simultaneously:

| Layer | State |
|---|---|
| Local SQL schema files | Phase 2.1 complete (9 tables, canonical architecture) |
| TypeScript types | Phase 2.1 complete (all new fields defined, backward-compat unions) |
| Live Supabase DB | v0.1 only (6 tables, legacy schema, no canonical columns) |
| Runtime application code | v0.1 only (ilike lookup, static scheduler, free-text species) |

Any query that references Phase 2.1 columns (canonical_species_id, user_entered_name, plant_profile, etc.) against the live DB will fail with PostgREST column-not-found errors.

---

## SECTION 1 — CURRENT DATABASE ARCHITECTURE

### 1.1 State of the Live Supabase Database

**Tables that EXIST in live Supabase (v0.1 schema):**

| Table | Exists in Supabase | Exists in Local SQL |
|---|---|---|
| plant_care_profiles | ✅ YES (v0.1 columns only) | ✅ YES (Phase 2.1 expanded) |
| plants | ✅ YES (v0.1 columns only) | ✅ YES (Phase 2.1 expanded) |
| care_tasks | ✅ YES (v0.1 columns only) | ✅ YES (Phase 2.1 expanded) |
| care_logs | ✅ YES (v0.1 columns only) | ✅ YES (Phase 2.1 expanded) |
| journal_entries | ✅ YES (v0.1 columns only) | ✅ YES (Phase 2.1 expanded) |
| health_logs | ✅ YES (v0.1 columns only) | ✅ YES (Phase 2.1 expanded) |
| canonical_species | ❌ NOT IN SUPABASE | ✅ YES (local only) |
| plant_aliases | ❌ NOT IN SUPABASE | ✅ YES (local only) |
| collapse_mappings | ❌ NOT IN SUPABASE | ✅ YES (local only) |

---

### 1.2 canonical_species — LOCAL SCHEMA ONLY

**Status:** Defined in `supabase-setup.sql` and `supabase-migration-v2.sql`. Does NOT exist in live Supabase DB.

```
canonical_species
├── canonical_species_id  TEXT     PK          — immutable; format PLANT_0001
├── species_name          TEXT     NOT NULL    — display-oriented; may evolve
├── primary_archetype     TEXT     NULLABLE    — metadata only; NOT an inheritance system
├── mainstream_priority   INTEGER  NULLABLE    — onboarding weighting
├── india_relevance       INTEGER  NULLABLE    — localization weighting
├── inventory_version     TEXT     NULLABLE    — dataset tracking
├── identity_status       TEXT     NOT NULL    DEFAULT 'active'
│                                              CHECK ('active','deprecated','review_required')
├── review_notes          TEXT     NULLABLE
└── created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Indexes:** `canonical_species_name_idx`, `canonical_species_priority_idx (mainstream_priority DESC, india_relevance DESC)`  
**RLS:** authenticated SELECT only  
**Data:** 0 rows — table does not exist in live DB; no seed data defined yet  

---

### 1.3 plant_aliases — LOCAL SCHEMA ONLY

**Status:** Defined in `supabase-setup.sql` and `supabase-migration-v2.sql`. Does NOT exist in live Supabase DB.

```
plant_aliases
├── id                     UUID    PK  DEFAULT gen_random_uuid()
├── alias_name             TEXT    NOT NULL
├── canonical_species_name TEXT    NOT NULL
├── canonical_species_id   TEXT    NOT NULL  FK → canonical_species(canonical_species_id) ON DELETE CASCADE
├── alias_type             TEXT    NOT NULL  CHECK ('common_name','cultivar_name','regional_name','nursery_name','beginner_name')
├── language_region        TEXT    NULLABLE
├── search_priority        INTEGER NOT NULL  DEFAULT 0
├── alias_confidence       FLOAT   NOT NULL  DEFAULT 1.0  CHECK (0 ≤ x ≤ 1)
├── review_notes           TEXT    NULLABLE
└── created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Indexes:** `plant_aliases_name_idx`, `plant_aliases_species_id_idx`, `plant_aliases_priority_idx (search_priority DESC)`  
**RLS:** authenticated SELECT only  
**Data:** 0 rows  

---

### 1.4 collapse_mappings — LOCAL SCHEMA ONLY

**Status:** Defined in `supabase-setup.sql` and `supabase-migration-v2.sql`. Does NOT exist in live Supabase DB.

```
collapse_mappings
├── id                           UUID   PK  DEFAULT gen_random_uuid()
├── collapsed_species_name       TEXT   NOT NULL
├── canonical_species_name       TEXT   NOT NULL
├── canonical_species_id         TEXT   NOT NULL  FK → canonical_species ON DELETE CASCADE
├── collapse_reason              TEXT   NULLABLE
├── operational_similarity       FLOAT  NULLABLE  CHECK (0 ≤ x ≤ 1)
├── consumer_recognition_overlap FLOAT  NULLABLE  CHECK (0 ≤ x ≤ 1)
├── collapse_confidence          FLOAT  NULLABLE  CHECK (0 ≤ x ≤ 1)
├── review_notes                 TEXT   NULLABLE
└── created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Indexes:** `collapse_mappings_collapsed_name_idx`, `collapse_mappings_species_id_idx`  
**RLS:** authenticated SELECT only  
**Data:** 0 rows  

---

### 1.5 plant_care_profiles — EXISTS IN SUPABASE (v0.1 COLUMNS ONLY)

**Live Supabase columns (v0.1):**

```
plant_care_profiles [LIVE IN SUPABASE — v0.1 COLUMNS ONLY]
├── id                         UUID     PK  DEFAULT gen_random_uuid()
├── species_name               TEXT     NOT NULL UNIQUE   ← PRIMARY LOOKUP KEY (ilike)
├── watering_frequency_days    INTEGER  NOT NULL DEFAULT 7
├── fertilizing_frequency_days INTEGER  NULLABLE
├── light_requirement          TEXT     NULLABLE CHECK ('low','medium','bright_indirect','full_sun')
├── humidity_preference        TEXT     NULLABLE CHECK ('low','medium','high')
├── difficulty_level           TEXT     NULLABLE CHECK ('easy','medium','hard')
├── notes                      TEXT     NULLABLE
└── created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Phase 2.1 columns defined locally but NOT in live Supabase:**

```
[PENDING MIGRATION — not in live DB]
├── canonical_species_id            TEXT    NULLABLE  FK → canonical_species ON DELETE SET NULL
├── watering_frequency_spring       INTEGER NULLABLE
├── watering_frequency_summer       INTEGER NULLABLE
├── watering_frequency_autumn       INTEGER NULLABLE
├── watering_frequency_winter       INTEGER NULLABLE
├── fertilizing_frequency_spring    INTEGER NULLABLE
├── fertilizing_frequency_summer    INTEGER NULLABLE
├── fertilizing_frequency_autumn    INTEGER NULLABLE
├── fertilizing_frequency_winter    INTEGER NULLABLE
├── watering_method                 TEXT    NULLABLE CHECK (6 values)
├── watering_method_description     TEXT    NULLABLE
├── fertilizing_method              TEXT    NULLABLE CHECK (6 values)
├── fertilizing_method_description  TEXT    NULLABLE
├── repotting_method                TEXT    NULLABLE CHECK (5 values)
├── repotting_signs                 TEXT    NULLABLE
├── repotting_method_description    TEXT    NULLABLE
├── repotting_frequency_months      INTEGER NULLABLE
├── plant_profile                   TEXT    NULLABLE
├── seasonal_adjustments            TEXT    NULLABLE
├── care_alerts                     TEXT    NULLABLE
├── placement_guidance              TEXT    NULLABLE
└── suggested_location              TEXT    NULLABLE
```

**Live enum values vs local schema:**

| Column | Live Supabase CHECK | Local Schema CHECK |
|---|---|---|
| light_requirement | `'low','medium','bright_indirect','full_sun'` | `'low_light','medium_indirect','bright_indirect','direct_sun'` |
| difficulty_level | `'easy','medium','hard'` | `'beginner','intermediate','advanced'` |

**Indexes (live):** `plant_care_profiles_species_idx`  
**Indexes (pending):** `plant_care_profiles_canonical_id_idx`  
**RLS:** authenticated SELECT only  
**Seed rows in live DB:** 46 rows (v0.1 enum values — `'easy'`/`'medium'`/`'hard'`/`'low'`/`'medium'`/`'full_sun'`)  
**Seed rows in local setup.sql:** 46 rows (Phase 2.1 enum values — `'beginner'`/`'intermediate'`/`'advanced'`/`'low_light'`/`'medium_indirect'`/`'direct_sun'`)  
**ENUM DRIFT RISK:** The local schema and live DB use different CHECK values for light_requirement and difficulty_level. The migration SQL uses DROP CONSTRAINT + ADD with expanded values.

---

### 1.6 plants — EXISTS IN SUPABASE (v0.1 COLUMNS ONLY)

**Live Supabase columns (v0.1):**

```
plants [LIVE IN SUPABASE — v0.1 COLUMNS ONLY]
├── id                   UUID    PK  DEFAULT gen_random_uuid()
├── user_id              UUID    NOT NULL  FK → auth.users(id) ON DELETE CASCADE
├── display_name         TEXT    NOT NULL          ← maps to schema freeze doc's 'plant_name'
├── species_name         TEXT    NULLABLE          ← free-text legacy identity
├── botanical_name       TEXT    NULLABLE
├── room_location        TEXT    NULLABLE
├── notes                TEXT    NULLABLE
├── image_url            TEXT    NULLABLE
├── light_conditions     TEXT    NULLABLE          ← free-text; not a governed enum
├── humidity_preferences TEXT    NULLABLE          ← free-text
├── watering_preferences TEXT    NULLABLE          ← free-text
├── purchase_date        DATE    NULLABLE
├── acquired_from        TEXT    NULLABLE
├── created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
└── updated_at           TIMESTAMPTZ NULLABLE      ← auto-updated by trigger
```

**Trigger (live):** `plants_updated_at` BEFORE UPDATE → calls `update_updated_at()`  
**Indexes (live):** `plants_user_id_idx`

**Phase 2.1 columns defined locally but NOT in live Supabase:**

```
[PENDING MIGRATION — not in live DB]
├── canonical_species_id      TEXT  NULLABLE  FK → canonical_species ON DELETE SET NULL
├── user_entered_name         TEXT  NULLABLE
├── canonical_species_name    TEXT  NULLABLE
└── species_resolution_method TEXT  NULLABLE  CHECK (6 values)
```

**Indexes (pending):** `plants_canonical_id_idx`  
**COLUMN NAME MISMATCH:** The schema freeze doc calls this `plant_name`. The DB column and all application code uses `display_name`. This mismatch is intentional and preserved for backward compat.

---

### 1.7 care_tasks — EXISTS IN SUPABASE (v0.1 COLUMNS ONLY)

**Live Supabase columns:**

```
care_tasks [LIVE IN SUPABASE]
├── id                UUID     PK  DEFAULT gen_random_uuid()
├── plant_id          UUID     NOT NULL  FK → plants(id) ON DELETE CASCADE
├── task_type         TEXT     NOT NULL  CHECK ('watering','fertilizing','misting','pruning','repotting')
├── frequency_days    INTEGER  NULLABLE  CHECK (> 0)
├── last_completed_at TIMESTAMPTZ NULLABLE
├── next_due_at       TIMESTAMPTZ NULLABLE
├── notes             TEXT     NULLABLE
├── active_status     BOOLEAN  NOT NULL DEFAULT TRUE
└── created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**IMPORTANT — task_type drift:** Live DB check is `('watering','fertilizing','misting','pruning','repotting')`. Local schema adds `'cleaning'` and keeps `'repotting'`. Migration expands constraint to include both.  
**IMPORTANT — no status column:** `CareTaskStatus` enum (`pending/completed/skipped/overdue`) is defined in TypeScript but there is NO corresponding `status` column on care_tasks. The DB uses `active_status BOOLEAN` only.  
**Indexes (live):** `care_tasks_plant_id_idx`, `care_tasks_next_due_idx WHERE active_status = TRUE`  
**Phase 2.1 column pending:** `canonical_species_id TEXT NULLABLE FK → canonical_species`

---

### 1.8 care_logs — EXISTS IN SUPABASE (v0.1 COLUMNS ONLY)

```
care_logs [LIVE IN SUPABASE]
├── id           UUID     PK  DEFAULT gen_random_uuid()
├── plant_id     UUID     NOT NULL  FK → plants(id) ON DELETE CASCADE
├── task_type    TEXT     NOT NULL  CHECK ('watering','fertilizing','misting','pruning','repotting')
├── completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
├── notes        TEXT     NULLABLE
└── image_url    TEXT     NULLABLE
```

**Append-only contract:** No UPDATE RLS policy defined. Rows are never modified after insert (enforced by RLS).  
**Indexes (live):** `care_logs_plant_id_idx`, `care_logs_completed_at_idx (plant_id, completed_at DESC)`  
**Phase 2.1 column pending:** `canonical_species_id TEXT NULLABLE FK → canonical_species`

---

### 1.9 journal_entries — EXISTS IN SUPABASE

```
journal_entries [LIVE IN SUPABASE]
├── id         UUID     PK  DEFAULT gen_random_uuid()
├── plant_id   UUID     NOT NULL  FK → plants(id) ON DELETE CASCADE
├── title      TEXT     NULLABLE
├── notes      TEXT     NULLABLE
├── image_url  TEXT     NULLABLE
└── created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Phase 2.1 column pending:** `canonical_species_id TEXT NULLABLE`  
**Frontend usage:** No screen currently creates or displays journal entries. Table exists in DB and types, but no UI component accesses it.

---

### 1.10 health_logs — EXISTS IN SUPABASE

```
health_logs [LIVE IN SUPABASE]
├── id           UUID     PK  DEFAULT gen_random_uuid()
├── plant_id     UUID     NOT NULL  FK → plants(id) ON DELETE CASCADE
├── health_score SMALLINT NOT NULL  CHECK (1–5)  — 1=Critical 2=Poor 3=Stable 4=Healthy 5=Thriving
├── issue_type   TEXT     NULLABLE
├── severity     TEXT     NULLABLE
├── notes        TEXT     NULLABLE
├── image_url    TEXT     NULLABLE
└── created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Phase 2.1 column pending:** `canonical_species_id TEXT NULLABLE`  
**Frontend usage:** No screen currently creates or displays health logs. Table exists in DB and types, but no UI component accesses it.

---

## SECTION 2 — ACTIVE RUNTIME IDENTITY ARCHITECTURE

### 2.1 Onboarding Resolution Flow — ACTUAL IMPLEMENTED STATE

```
User types plant name in PlantForm
         ↓
PlantForm.handleSubmit()
         ↓
  PlantInput {
    display_name: text (required)
    species_name: text (optional, free-text)
    room_location: text (optional)
    notes: text (optional)
  }
  ← NO canonical resolution
  ← NO alias lookup
  ← NO user_entered_name captured
  ← NO canonical_species_id set
  ← NO species_resolution_method set
         ↓
useCreatePlant.mutationFn()
         ↓
supabase.from('plants').insert({ ...input, user_id })
         ↓
plants row created with:
  display_name: SET
  species_name: SET (free-text)
  canonical_species_id: NULL
  user_entered_name: NULL
  canonical_species_name: NULL
  species_resolution_method: NULL
```

**Status: PARTIALLY IMPLEMENTED**  
- Layer 1 (display_name) → IMPLEMENTED  
- Layer 2 (user_entered_name) → DEFINED IN TYPES, NOT POPULATED BY FORM  
- Layer 3 (canonical_species_id) → DEFINED IN TYPES, NEVER POPULATED  
- Layer 4 (behavioral intelligence) → DEFINED IN TYPES, NEVER QUERIED  

---

### 2.2 Species Name Usage — ACTUAL BEHAVIOR

`species_name` is used in exactly ONE place in the runtime:

```
careProfiles.ts:lookupCareProfile(speciesName: string | null | undefined)
  → supabase.from('plant_care_profiles')
       .select('*')
       .ilike('species_name', `%${term}%`)
       .order('species_name')
       .limit(1)
       .maybeSingle()
```

This is called by `generateDefaultCareTasks()` after plant creation with the value from `plants.species_name`.

- Case-insensitive partial match on `plant_care_profiles.species_name`
- Returns first alphabetical match, not best match
- Input is the user's raw free-text from the species field
- If no match → watering defaults to 7 days

---

### 2.3 canonical_species_id Usage — ACTUAL BEHAVIOR

```
canonical_species_id is NEVER USED in any runtime code.
```

Specifically:
- `lib/careProfiles.ts` — does not reference canonical_species_id anywhere
- `hooks/usePlants.ts` — does not reference canonical_species_id anywhere
- All screens — do not reference canonical_species_id anywhere
- No query ever joins to canonical_species
- No query ever filters by canonical_species_id
- No insert ever populates canonical_species_id on any table

---

### 2.4 Alias Lookup Behavior — ACTUAL BEHAVIOR

```
Alias lookup: NOT IMPLEMENTED
plant_aliases table: does not exist in live DB
No alias resolution code exists in the runtime
```

---

### 2.5 Collapse Mapping Behavior — ACTUAL BEHAVIOR

```
Collapse mapping: NOT IMPLEMENTED
collapse_mappings table: does not exist in live DB
No collapse resolution code exists in the runtime
```

---

### 2.6 Fallback Behaviors — ACTUAL BEHAVIOR

| Scenario | Fallback |
|---|---|
| No species_name entered | lookupCareProfile returns null → watering every 7 days |
| species_name provided, no ilike match | lookupCareProfile returns null → watering every 7 days |
| species_name provided, match found | uses `watering_frequency_days` from profile; adds fertilizing task if `fertilizing_frequency_days` set |
| Watering task already exists at creation | `generateDefaultCareTasks` returns early (dedup guard) |
| Watering task missing when `useWaterPlant` fires | creates a new watering task without frequency_days |

---

### 2.7 Unresolved TODOs (identity layer)

1. `useCreatePlant` select after insert: `.select("id, species_name")` — only fetches 2 columns. If Phase 2.2 needs `canonical_species_id` after insert, this must be updated.
2. `PlantForm` has no `user_entered_name` field — the raw onboarding input is discarded.
3. No species search/autocomplete — the species field is a plain free-text `TextInput`.
4. `CareTaskStatus` type defined but no corresponding DB column. `active_status BOOLEAN` is the only status tracking.

---

## SECTION 3 — CURRENT SCHEDULER ARCHITECTURE

### 3.1 Task Generation Logic — FULLY DOCUMENTED

**Entry point:** `lib/careProfiles.ts:generateDefaultCareTasks(plantId, speciesName)`  
**Called by:** `hooks/usePlants.ts:useCreatePlant.mutationFn` immediately after plant row insert

```
generateDefaultCareTasks(plantId, speciesName):
  1. Guard: check for existing active watering task → return early if found
  2. lookupCareProfile(speciesName) → ilike match on plant_care_profiles.species_name
  3. waterFreq = profile?.watering_frequency_days ?? 7
  4. Build tasks array:
     - watering task: {plant_id, task_type:'watering', frequency_days:waterFreq,
                       next_due_at: now + waterFreq days, active_status:true}
     - if profile?.fertilizing_frequency_days:
         + fertilizing task: same shape with fertFreq
  5. supabase.from('care_tasks').insert(tasks)
```

**Fields NOT populated on care_tasks during generation:**
- `canonical_species_id` → NULL
- `last_completed_at` → NULL
- `notes` → NULL
- `active_status` → true (only true tasks created)

**Task types never auto-generated:** `misting`, `pruning`, `cleaning`, `repotting`

---

### 3.2 Care Task Inheritance

```
plant creation → generateDefaultCareTasks → reads plant_care_profiles.watering_frequency_days
```

- No inheritance from canonical_species
- No runtime profile lookup at schedule time (only at creation time)
- If care profile is seeded after plant creation, existing plants are NOT retroactively updated
- Static: frequency_days is fixed at creation, never recalculated

---

### 3.3 Watering Sync Behavior

**`useWaterPlant` mutation flow:**

```
1. INSERT into care_logs: { plant_id, task_type:'watering', completed_at:now }
2. SELECT from care_tasks: { id, frequency_days } WHERE plant_id AND task_type='watering'
3a. If task EXISTS:
     nextDue = frequency_days ? now + frequency_days * 86400s : null
     UPDATE care_tasks: { last_completed_at:now, next_due_at:nextDue }
3b. If task NOT EXISTS:
     INSERT care_tasks: { plant_id, task_type:'watering', last_completed_at:now }
     (NO frequency_days, NO next_due_at set)
4. Invalidate ['plants'] TanStack Query cache
```

**Key limitation:** `canonical_species_id` never populated on care_logs inserts. History is permanently unlinked from canonical identity.

---

### 3.4 Seasonal Logic Support

```
Seasonal scheduling: NOT IMPLEMENTED

Seasonal frequency columns defined in local schema:
  watering_frequency_spring/summer/autumn/winter
  fertilizing_frequency_spring/summer/autumn/winter

Runtime usage: ZERO
  - These columns are never queried
  - No season detection logic exists
  - Scheduler reads ONLY watering_frequency_days (static legacy field)
```

---

### 3.5 Repotting Logic Status

```
Repotting tasks: NOT IMPLEMENTED

Current state:
  - 'repotting' is a valid task_type in care_tasks CHECK constraint (legacy)
  - No repotting task is ever auto-generated
  - No repotting_tasks table exists (planned for later phase)
  - No repotting frequency/reminders in UI
```

---

### 3.6 Current Scheduler Limitations

1. **Static scheduling only:** `next_due_at = now + frequency_days * ms`. Never recalculates based on current season.
2. **Profile is not re-read:** Scheduler reads profile once (at creation). Profile updates do not propagate to existing tasks.
3. **canonical_species_id never used:** All care task operations are plant_id-scoped only, never canonical_species_id-scoped.
4. **No task status tracking:** `CareTaskStatus` enum exists in types but has no DB column. `active_status BOOLEAN` is the only state.
5. **No overdue detection:** next_due_at is stored but never read by a backend process. "Overdue" state is computed client-side in `needsWatering(plant)`.
6. **Only watering is "smart":** Fertilizing tasks are created but never surfaced in UI. Watering is the only task type with UI affordances.

---

## SECTION 4 — ACTIVE RUNTIME TYPES & ENUMS

### 4.1 Enum Governance Status

All enums are defined in `artifacts/mobile/types/canonical.ts`.  
**Governance rule:** Any new enum value requires updating `types/canonical.ts` + `supabase-setup.sql` + the migration SQL.

---

### 4.2 TaskType

```typescript
// Canonical (Phase 2.1) — used in new code
type TaskType = 'watering' | 'fertilizing' | 'misting' | 'pruning' | 'cleaning';

// Legacy — coexists during migration; 'repotting' still in live DB check constraint
type TaskTypeLegacy = TaskType | 'repotting';
```

**Runtime usage:** `TaskType` imported in `careProfiles.ts` for the tasks array type annotation. At runtime only `'watering'` and `'fertilizing'` are ever inserted. `'cleaning'` is canonical but never generated or surfaced. `'repotting'` is in the DB constraint but never generated.

---

### 4.3 LightRequirement

```typescript
// Canonical (Phase 2.1)
type LightRequirement = 'low_light' | 'medium_indirect' | 'bright_indirect' | 'direct_sun';

// Legacy v0.1 (still in live Supabase CHECK constraint)
type LightRequirementLegacy = 'low' | 'medium' | 'full_sun';

// Union used by hooks reading from live DB during migration
type LightRequirementAny = LightRequirement | LightRequirementLegacy;
```

**Live DB state:** check constraint uses legacy values. Local setup.sql uses canonical values. Seeds in live DB use legacy values.  
**IMPORTANT:** `'bright_indirect'` appears in BOTH canonical and legacy — it was not renamed.

---

### 4.4 DifficultyLevel

```typescript
// Canonical (Phase 2.1)
type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

// Legacy v0.1 (still in live DB; 'medium' was a legacy difficulty value)
type DifficultyLevelLegacy = 'easy' | 'hard';  // 'medium' dropped — was ambiguous with humidity

// Union for migration
type DifficultyLevelAny = DifficultyLevel | DifficultyLevelLegacy;
```

**NOTE:** `'medium'` was used as a difficulty_level value in the v0.1 seed data but it conflicts with `humidity_preference`. The union type does NOT include `'medium'` for DifficultyLevelLegacy to avoid ambiguity. The live DB has 'medium' rows in difficulty_level — these will need a data migration.

---

### 4.5 HumidityPreference

```typescript
type HumidityPreference = 'low' | 'medium' | 'high';
```

**No change from v0.1.** Values consistent across local schema and live DB.

---

### 4.6 SpeciesResolutionMethod

```typescript
type SpeciesResolutionMethod =
  | 'direct_species_match'
  | 'alias_match'
  | 'collapse_mapping_match'
  | 'fuzzy_match'
  | 'manual_override'
  | 'unresolved';
```

**Status:** Defined. No runtime code currently populates `species_resolution_method`. Column does not exist in live Supabase DB.

---

### 4.7 WateringMethod

```typescript
type WateringMethod =
  | 'soak_and_drain' | 'consistent_moisture' | 'infrequent_deep_watering'
  | 'bottom_water' | 'mist_and_airflow' | 'submersion_soak';
```

**Status:** Defined. `watering_method` column not in live DB. No seed data for this field. No UI renders watering method.

---

### 4.8 FertilizingMethod

```typescript
type FertilizingMethod =
  | 'diluted_liquid_feed' | 'slow_release_granules' | 'compost_topdress'
  | 'orchid_fertilizer' | 'low_nutrient_requirement' | 'foliar_feed';
```

**Status:** Defined. `fertilizing_method` column not in live DB. No seed data. No UI renders fertilizing method.

---

### 4.9 RepottingMethod

```typescript
type RepottingMethod =
  | 'upgrade_pot_size' | 'refresh_substrate' | 'bark_refresh'
  | 'root_division' | 'minimal_disturbance';
```

**Status:** Defined. `repotting_method` column not in live DB. No seed data. No UI.

---

### 4.10 CareTaskStatus

```typescript
type CareTaskStatus = 'pending' | 'completed' | 'skipped' | 'overdue';
```

**CRITICAL GAP:** This type is defined but there is NO `status` column on `care_tasks` in either the local schema or live DB. The DB uses `active_status BOOLEAN`. This type currently has no DB backing. Any future use of `CareTaskStatus` will require adding a `status TEXT` column to `care_tasks`.

---

### 4.11 IdentityStatus

```typescript
type IdentityStatus = 'active' | 'deprecated' | 'review_required';
```

**Status:** Used by `canonical_species.identity_status`. Column exists in local schema only (table not in live DB).

---

### 4.12 AliasType

```typescript
type AliasType = 'common_name' | 'cultivar_name' | 'regional_name' | 'nursery_name' | 'beginner_name';
```

**Status:** Used by `plant_aliases.alias_type`. Table not in live DB.

---

## SECTION 5 — CURRENT SEED / DATA STATE

### 5.1 plant_care_profiles

| Metric | Value |
|---|---|
| Rows in live Supabase | 46 |
| Enum values in live rows | LEGACY: `'easy'/'medium'/'hard'/'low'/'medium'/'full_sun'` |
| Rows in local setup.sql | 46 |
| Enum values in local seed | CANONICAL: `'beginner'/'intermediate'/'advanced'/'low_light'/'medium_indirect'/'direct_sun'` |
| `canonical_species_id` populated | 0 rows (column doesn't exist in live DB) |
| Seasonal frequency fields populated | 0 rows (columns don't exist in live DB) |
| Method fields populated | 0 rows (columns don't exist in live DB) |
| Semantic fields populated | 0 rows (columns don't exist in live DB) |

**Species coverage in seed (46 profiles):**  
Sansevieria trifasciata, Zamioculcas zamiifolia, Aloe vera, Crassula ovata, Haworthiopsis attenuata, Echeveria, Sedum, Gasteria, Hoya kerrii, Cereus jamacaru, Echinopsis, Opuntia, Gymnocalycium, Epipremnum aureum, Philodendron hederaceum, Chlorophytum comosum, Monstera deliciosa, Monstera adansonii, Scindapsus pictus, Aglaonema, Dracaena marginata, Dracaena fragrans, Aspidistra elatior, Tradescantia zebrina, Peperomia obtusifolia, Peperomia caperata, Hoya carnosa, Spathiphyllum, Pothos, Ficus elastica, Ficus lyrata, Strelitzia reginae, Anthurium andraeanum, Phalaenopsis, Calathea orbifolia, Calathea zebrina, Maranta leuconeura, Ctenanthe, Croton codiaeum, Alocasia, Caladium, Nephrolepis exaltata, Adiantum, Ocimum basilicum, Mentha, Rosmarinus officinalis

---

### 5.2 canonical_species

| Metric | Value |
|---|---|
| Rows in live Supabase | 0 (table does not exist) |
| Rows local | 0 (no seed data defined) |
| canonical_species_id format | PLANT_0001 (defined in schema freeze; no data exists) |

---

### 5.3 plant_aliases

| Metric | Value |
|---|---|
| Rows in live Supabase | 0 (table does not exist) |
| Rows local | 0 (no seed data defined) |

---

### 5.4 collapse_mappings

| Metric | Value |
|---|---|
| Rows in live Supabase | 0 (table does not exist) |
| Rows local | 0 (no seed data defined) |

---

### 5.5 User Data (plants, care_tasks, care_logs)

These tables exist in live Supabase and contain real user-created data.  
- All `canonical_species_id` values: NULL (column pending migration)  
- All `species_resolution_method` values: NULL (column pending migration)  
- All `user_entered_name` values: NULL (column pending migration)  
- `species_name` values: free-text as entered by users; may or may not match any plant_care_profiles row  

---

## SECTION 6 — CURRENT FRONTEND RUNTIME BEHAVIOR

### 6.1 App Architecture

```
_layout.tsx (root)
├── SafeAreaProvider
├── ErrorBoundary
├── QueryClientProvider (TanStack Query — staleTime: 30s, retry: 1)
├── AuthProvider (Supabase session listener)
└── GestureHandlerRootView
    └── Stack (expo-router)
        ├── index.tsx           → auth gate (redirect based on session)
        ├── (auth)/login.tsx    → email+password sign in
        ├── (auth)/signup.tsx   → email+password sign up
        ├── (tabs)/index.tsx    → home dashboard (plant list)
        ├── (tabs)/profile.tsx  → user profile (sign out)
        ├── plant/new.tsx       → create plant (modal presentation)
        └── plant/[id].tsx      → plant detail + edit + delete
```

---

### 6.2 Onboarding UX Flow — ACTUAL

```
(auth)/login.tsx or signup.tsx
  → Supabase email+password auth
  → session established → redirect to /(tabs)
  → NO canonical species resolution at auth time
  → NO profile setup step
  → NO onboarding wizard
```

---

### 6.3 Plant Creation Flow — ACTUAL

```
(tabs)/index.tsx → "+" button → push('/plant/new') (modal)
  ↓
plant/new.tsx renders <PlantForm />
  Fields shown to user:
    - PLANT NAME * (→ display_name)
    - SPECIES (→ species_name, free text, optional)
    - LOCATION (→ room_location, optional)
    - NOTES (→ notes, optional)
  Fields NOT shown:
    - user_entered_name (not collected)
    - canonical_species_id (not resolved)
    - botanical_name, image_url, light_conditions, etc.
  ↓
handleSubmit → useCreatePlant.mutateAsync(input)
  ↓
usePlants.ts:
  1. INSERT plants: { display_name, species_name, room_location, notes, user_id }
  2. SELECT: .select("id, species_name")   ← only these 2 fields returned
  3. generateDefaultCareTasks(created.id, created.species_name)
  4. SELECT plants.*, care_tasks(*)
  ↓
router.back()
```

---

### 6.4 display_name Usage — ACTUAL

`display_name` is used in every place where the plant's name is shown:
- `PlantCard`: `plant.display_name` for the card title
- `PlantDetail`: header title, hero card plant name, delete confirmation alert
- `PlantForm`: pre-filled from `initialValues?.display_name`
- `usePlants.ts:PLANT_SELECT`: `"*, care_tasks(*)"` — selects all columns including display_name

---

### 6.5 species_name Usage — ACTUAL

`species_name` is used in:
- `PlantCard`: rendered below display_name as italic subtitle (if truthy)
- `PlantDetail`: rendered below plant name (if truthy)
- `PlantForm`: editable free-text field labeled "SPECIES"
- `useCreatePlant`: passed to `generateDefaultCareTasks` for care profile lookup
- `careProfiles.ts:lookupCareProfile`: ilike search target on `plant_care_profiles.species_name`

---

### 6.6 canonical_species_id Usage in Frontend — ACTUAL

```
canonical_species_id: NEVER used in any screen, component, or hook.
```

---

### 6.7 Scheduler Interactions in Frontend

`needsWatering(plant)` and `getDaysUntilWatering(plant)` (from `types/plant.ts`):

```typescript
// These are pure client-side computations over care_tasks data
getWateringTask(plant) → plant.care_tasks?.find(t => t.task_type === 'watering')
getDaysUntilWatering(plant) → Math.ceil((next_due_at - now) / 86400000)
needsWatering(plant) → getDaysUntilWatering(plant) === 0
```

**WateringStatus dashboard widget:** Counts plants by urgent/soon/ok using these functions.  
**Filter chips (home screen):** "Water today" = needsWatering, "Due soon" = days 1–2

---

### 6.8 Fallback Compatibility Logic

- If `plant.care_tasks` is undefined/empty → `getDaysUntilWatering` returns 0 → shows "Log watering"
- If `species_name` is null/empty at creation → 7-day watering default
- If ilike lookup finds no match → 7-day watering default
- Plants created without species_name still get a watering task

---

## SECTION 7 — CURRENT SUPABASE STATE

### 7.1 Migrations Applied

| Migration | Status |
|---|---|
| `supabase-setup.sql` v0.1 (original 6-table schema) | APPLIED — this is the live state |
| `supabase-migration-v2.sql` (Phase 2.1 additive) | NOT APPLIED — local file only |

---

### 7.2 Schema Drift Risks

| Risk | Severity | Detail |
|---|---|---|
| 9 columns missing from plants in live DB | CRITICAL | canonical_species_id, user_entered_name, canonical_species_name, species_resolution_method |
| 24 columns missing from plant_care_profiles in live DB | HIGH | all seasonal, method, semantic, placement columns |
| 3 tables missing entirely from live DB | CRITICAL | canonical_species, plant_aliases, collapse_mappings |
| light_requirement CHECK mismatch | MEDIUM | live DB: old values; local schema: new values; migration SQL expands constraint |
| difficulty_level CHECK mismatch | MEDIUM | same as above; 'medium' difficulty data in live DB is ambiguous |
| task_type missing 'cleaning' in live DB | LOW | migration SQL expands constraint |

---

### 7.3 FK Integrity Risks at Migration Time

When `supabase-migration-v2.sql` runs:
- `ALTER TABLE plants ADD COLUMN canonical_species_id TEXT REFERENCES canonical_species(canonical_species_id)` — requires `canonical_species` table to exist first. Migration creates it first. ✅
- `ALTER TABLE plant_care_profiles ADD COLUMN canonical_species_id TEXT REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` — same. ✅
- All canonical_species_id FKs are NULLABLE → existing rows unaffected ✅

---

### 7.4 Runtime Compatibility Risks

Currently ZERO runtime risk because:
- No application code references Phase 2.1 columns
- All queries use `*` or explicit legacy column names
- The app will continue functioning normally before and after the migration runs

**Post-migration risk:** If Phase 2.2 code is deployed before the Supabase migration runs, any query referencing canonical_species_id or plant_aliases will fail with PostgREST "column/table does not exist" errors.

---

## SECTION 8 — RUNTIME TECHNICAL DEBT & RISKS

### 8.1 Incomplete Runtime Flows

| Flow | Status | Impact |
|---|---|---|
| Species alias resolution | NOT IMPLEMENTED | Users cannot find plants by common name |
| Canonical identity assignment at creation | NOT IMPLEMENTED | All plants remain unresolved |
| Seasonal scheduler | NOT IMPLEMENTED | All scheduling is static flat-frequency |
| species_resolution_method tracking | NOT IMPLEMENTED | No onboarding analytics possible |
| user_entered_name capture | NOT IMPLEMENTED | Raw onboarding input lost at creation |
| Semantic intelligence rendering | NOT IMPLEMENTED | plant_profile/seasonal_adjustments/care_alerts never displayed |
| Fertilizing task UI | NOT IMPLEMENTED | Fertilizing tasks created but never surfaced |
| Journal entries UI | NOT IMPLEMENTED | Table exists, no screens |
| Health logs UI | NOT IMPLEMENTED | Table exists, no screens |
| repotting_tasks table | NOT IMPLEMENTED | Repotting as lifecycle maintenance not modeled |

---

### 8.2 Schema Inconsistencies

1. **`CareTaskStatus` type vs DB:** Type defines `pending/completed/skipped/overdue` but no DB column. `active_status BOOLEAN` is the only state.
2. **`difficulty_level` 'medium' in live seeds:** Used as difficulty value but conflicts with the humidity enum. These 46 rows need a data migration.
3. **`display_name` vs `plant_name`:** Column name diverges from schema freeze doc. All application code uses `display_name`. Not fixable without breaking changes.
4. **`useCreatePlant` select:** `.select("id, species_name")` — narrow select will not return Phase 2.1 canonical fields after insert. Must be updated to `.select(PLANT_SELECT)` before Phase 2.2.

---

### 8.3 Outdated Assumptions in Runtime Code

1. `careProfiles.ts` assumes species resolution = ilike on `plant_care_profiles.species_name`. Post-Phase 2.2, this should resolve through aliases → canonical_species_id → plant_care_profiles.canonical_species_id.
2. `generateDefaultCareTasks` uses `watering_frequency_days` (static). Post-scheduler migration, it should use seasonal frequencies.
3. `usePlants.ts:useWaterPlant` inserts a `care_log` row without `canonical_species_id`. After migration, this should be populated from `plant.canonical_species_id`.

---

### 8.4 Runtime Safety Risks

| Risk | Severity |
|---|---|
| Deploying Phase 2.2 code before running Supabase migration | CRITICAL — PostgREST errors |
| Running setup.sql (full reset) on live DB | CRITICAL — destroys all user data |
| Enum value mismatch between live seeds and local schema | MEDIUM — queries filtering by enum value may miss rows |
| ilike match returning wrong profile if species_name is ambiguous | LOW — returns first alphabetical, not best match |

---

## SECTION 9 — SYNCHRONIZATION READINESS ASSESSMENT

### 9.1 canonical_species inventory synchronization

**Readiness: BLOCKED**

Blockers:
- No canonical_species seed data defined (no PLANT_0001 IDs assigned yet)
- canonical_species table does not exist in Supabase
- Must run `supabase-migration-v2.sql` first
- Must define the canonical ID dataset before any FK relationships can be established

Dependencies before unblocking:
1. Define canonical_species rows with PLANT_0001+ IDs
2. Run supabase-migration-v2.sql on live DB
3. Validate table creation
4. Then seed canonical_species

---

### 9.2 plant_aliases synchronization

**Readiness: BLOCKED**

Blockers:
- No alias seed data defined
- plant_aliases table does not exist in Supabase
- canonical_species must be seeded first (FK dependency)

Dependencies: canonical_species sync must complete first.

---

### 9.3 collapse_mappings synchronization

**Readiness: BLOCKED**

Same blockers as plant_aliases. canonical_species must exist first.

---

### 9.4 plant_care_profiles synchronization

**Readiness: PARTIAL**

What's ready:
- 46 profiles already in live Supabase (legacy enum values, no Phase 2.1 fields)
- Local setup.sql has updated seed with canonical enum values
- Migration SQL expands CHECK constraints safely

What's missing:
- Phase 2.1 columns (canonical_species_id, seasonal freqs, methods, semantic fields) not in live DB
- canonical_species_id values not assigned to any profile
- Seasonal/method/semantic data not authored for any species
- light_requirement and difficulty_level seeds must be updated to canonical values

To unblock full sync:
1. Run supabase-migration-v2.sql
2. Seed canonical_species
3. Assign canonical_species_id to all 46 existing profiles
4. Author seasonal frequencies + method data + semantic intelligence fields per species

---

### 9.5 Pass 2.2 runtime activation

**Readiness: BLOCKED**

Phase 2.2 requires:
- canonical_species table in live DB with data ← NOT DONE
- plant_aliases table in live DB with data ← NOT DONE
- Identity resolution code (lookupCareProfile must be replaced with alias pipeline) ← NOT WRITTEN
- PlantForm must capture user_entered_name and trigger resolution ← NOT WRITTEN
- useCreatePlant must persist canonical_species_id ← NOT WRITTEN

Prerequisite order:
1. Run supabase-migration-v2.sql
2. Seed canonical_species + plant_aliases + collapse_mappings
3. Assign canonical_species_id to all plant_care_profiles
4. Implement identity resolution runtime code
5. Update PlantForm to use resolution pipeline
6. Update useCreatePlant to persist results

---

### 9.6 Scheduler migration

**Readiness: BLOCKED**

Requires:
- Seasonal frequency data in plant_care_profiles (not authored)
- Season detection logic (not written)
- Scheduler to read seasonal fields instead of watering_frequency_days (not written)
- canonical_species_id on plants to be populated (not implemented in onboarding)

---

### 9.7 Supabase production migration

**Readiness: PARTIAL — CAN RUN NOW WITH SAFETY**

`supabase-migration-v2.sql` is safe to run at any time:
- All new columns are nullable → zero row breakage
- All new tables are independent additions → no FK violations
- Expanded CHECK constraints remain backward-compatible
- No existing columns removed or modified
- App continues to function before and after

**Recommendation:** Run migration immediately to unblock all downstream Phase 2.2 work.

---

## APPENDIX — FILE MAP

```
artifacts/mobile/
├── app/
│   ├── index.tsx                     ← auth gate; redirects to tabs or auth
│   ├── _layout.tsx                   ← root: QueryClient, AuthProvider, fonts, ErrorBoundary
│   ├── (auth)/login.tsx              ← email+password sign in
│   ├── (auth)/signup.tsx             ← email+password sign up
│   ├── (tabs)/index.tsx              ← home dashboard; plant list; watering filters
│   ├── (tabs)/profile.tsx            ← sign out
│   ├── plant/new.tsx                 ← plant creation (modal)
│   └── plant/[id].tsx                ← plant detail, edit, delete, water
├── components/
│   ├── PlantCard.tsx                 ← list card; watering badge; inline water button
│   ├── PlantForm.tsx                 ← create/edit form (display_name, species_name, room, notes)
│   ├── WateringStatus.tsx            ← dashboard urgency widget
│   ├── ErrorBoundary.tsx             ← React error boundary wrapper
│   └── ErrorFallback.tsx             ← fallback UI on uncaught errors
├── contexts/
│   └── AuthContext.tsx               ← Supabase session, signIn, signUp, signOut
├── hooks/
│   └── usePlants.ts                  ← usePlants, usePlant, useCreatePlant, useUpdatePlant,
│                                        useDeletePlant, useWaterPlant
├── lib/
│   ├── supabase.ts                   ← createClient; auto-detects swapped env vars
│   └── careProfiles.ts               ← lookupCareProfile (ilike), generateDefaultCareTasks
├── types/
│   ├── canonical.ts                  ← [Phase 2.1] all enums + CanonicalSpecies + PlantAlias + CollapseMapping
│   └── plant.ts                      ← Plant, PlantCareProfile, CareTask, CareLog, JournalEntry, HealthLog, PlantInput
├── supabase-setup.sql                ← [Phase 2.1] full fresh-install schema (9 tables + 46 seeds)
└── supabase-migration-v2.sql         ← [Phase 2.1] additive migration — safe to run on live DB
```

---

*Document integrity: all data derived from direct source file inspection. No inferences from PRD or schema freeze aspirations — only from implemented runtime code.*
