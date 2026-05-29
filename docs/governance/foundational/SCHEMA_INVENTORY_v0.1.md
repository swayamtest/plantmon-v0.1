# Plant Manager — Runtime Schema Inventory
## Architecture Report · v0.1 · May 2026

> **Purpose:** Full visibility snapshot before schema freeze, migration planning, and Supabase normalization.
> **Scope:** Database schema, ORM definitions, Supabase structure, frontend contracts, data flows, enums, and identity resolution.
> **Status:** No refactoring was performed. This is a read-only audit.

---

## Table of Contents

1. [Database Schema Inventory](#1-database-schema-inventory)
2. [ORM / Model Definitions](#2-orm--model-definitions)
3. [Current Supabase Structure](#3-current-supabase-structure)
4. [Runtime Data Flow Mapping](#4-runtime-data-flow-mapping)
5. [Current Enum Systems](#5-current-enum-systems)
6. [Legacy / Deprecated Fields](#6-legacy--deprecated-fields)
7. [Frontend Data Contracts](#7-frontend-data-contracts)
8. [Current Search / Identity Flow](#8-current-search--identity-flow)

---

## 1. Database Schema Inventory

### 1.1 `plant_care_profiles`

Shared, species-level care defaults. Not user-scoped. Admin-seeded (46 species). Read-only for authenticated users.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `species_name` | `TEXT` | NOT NULL | — | UNIQUE |
| `watering_frequency_days` | `INTEGER` | NOT NULL | `7` | — |
| `fertilizing_frequency_days` | `INTEGER` | NULL | — | — |
| `light_requirement` | `TEXT` | NULL | — | CHECK IN `('low','medium','bright_indirect','full_sun')` |
| `humidity_preference` | `TEXT` | NULL | — | CHECK IN `('low','medium','high')` |
| `difficulty_level` | `TEXT` | NULL | — | CHECK IN `('easy','medium','hard')` |
| `notes` | `TEXT` | NULL | — | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

**Indexes:**
- `plant_care_profiles_species_idx` — B-tree on `(species_name)`

**Foreign Keys:** None (no user_id — shared reference table)

**Seed data:** 46 species across succulents, cacti, tropical foliage, ferns, herbs

---

### 1.2 `plants`

Core user inventory. Only `display_name` is required. All enrichment fields are optional (progressive UX design).

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `user_id` | `UUID` | NOT NULL | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `display_name` | `TEXT` | NOT NULL | — | — |
| `species_name` | `TEXT` | NULL | — | — |
| `botanical_name` | `TEXT` | NULL | — | — |
| `room_location` | `TEXT` | NULL | — | — |
| `notes` | `TEXT` | NULL | — | — |
| `image_url` | `TEXT` | NULL | — | — |
| `light_conditions` | `TEXT` | NULL | — | — |
| `humidity_preferences` | `TEXT` | NULL | — | — |
| `watering_preferences` | `TEXT` | NULL | — | — |
| `purchase_date` | `DATE` | NULL | — | — |
| `acquired_from` | `TEXT` | NULL | — | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |
| `updated_at` | `TIMESTAMPTZ` | NULL | — | Auto-updated by trigger |

**Indexes:**
- `plants_user_id_idx` — B-tree on `(user_id)`

**Triggers:**
- `plants_updated_at` — BEFORE UPDATE, sets `updated_at = NOW()`

**Foreign Keys:**
- `user_id` → `auth.users(id)` ON DELETE CASCADE

---

### 1.3 `care_tasks`

Recurring care schedule per plant. One row per task type per plant (enforced by application logic, not DB constraint). Supports future task types without schema changes.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `plant_id` | `UUID` | NOT NULL | — | FK → `plants(id)` ON DELETE CASCADE |
| `task_type` | `TEXT` | NOT NULL | — | CHECK IN `('watering','fertilizing','misting','pruning','repotting')` |
| `frequency_days` | `INTEGER` | NULL | — | CHECK `> 0` |
| `last_completed_at` | `TIMESTAMPTZ` | NULL | — | — |
| `next_due_at` | `TIMESTAMPTZ` | NULL | — | — |
| `notes` | `TEXT` | NULL | — | — |
| `active_status` | `BOOLEAN` | NOT NULL | `TRUE` | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

**Indexes:**
- `care_tasks_plant_id_idx` — B-tree on `(plant_id)`
- `care_tasks_next_due_idx` — Partial B-tree on `(next_due_at)` WHERE `active_status = TRUE`

**Foreign Keys:**
- `plant_id` → `plants(id)` ON DELETE CASCADE

**⚠️ Note:** No UNIQUE constraint on `(plant_id, task_type)`. Duplicate-task prevention is enforced purely by application code in `generateDefaultCareTasks()`.

---

### 1.4 `care_logs`

Immutable append-only history of completed care actions. Never updated after insert.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `plant_id` | `UUID` | NOT NULL | — | FK → `plants(id)` ON DELETE CASCADE |
| `task_type` | `TEXT` | NOT NULL | — | CHECK IN `('watering','fertilizing','misting','pruning','repotting')` |
| `completed_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |
| `notes` | `TEXT` | NULL | — | — |
| `image_url` | `TEXT` | NULL | — | — |

**Indexes:**
- `care_logs_plant_id_idx` — B-tree on `(plant_id)`
- `care_logs_completed_at_idx` — B-tree on `(plant_id, completed_at DESC)`

**Foreign Keys:**
- `plant_id` → `plants(id)` ON DELETE CASCADE

**⚠️ Note:** No UPDATE RLS policy (correct — logs are immutable). DELETE is allowed (cascade or manual cleanup).

---

### 1.5 `journal_entries`

Free-form per-plant notes. No schema for entry type — all entries are unstructured.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `plant_id` | `UUID` | NOT NULL | — | FK → `plants(id)` ON DELETE CASCADE |
| `title` | `TEXT` | NULL | — | — |
| `notes` | `TEXT` | NULL | — | — |
| `image_url` | `TEXT` | NULL | — | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

**Indexes:**
- `journal_entries_plant_id_idx` — B-tree on `(plant_id)`

**Foreign Keys:**
- `plant_id` → `plants(id)` ON DELETE CASCADE

**⚠️ Note:** No `updated_at` column. No immutability enforced — UPDATE RLS exists.

---

### 1.6 `health_logs`

Health score history. Score is 1–5 ordinal (not free-text). `issue_type` and `severity` are unstructured free-text.

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `plant_id` | `UUID` | NOT NULL | — | FK → `plants(id)` ON DELETE CASCADE |
| `health_score` | `SMALLINT` | NOT NULL | — | CHECK `BETWEEN 1 AND 5` |
| `issue_type` | `TEXT` | NULL | — | — |
| `severity` | `TEXT` | NULL | — | — |
| `notes` | `TEXT` | NULL | — | — |
| `image_url` | `TEXT` | NULL | — | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

**Indexes:**
- `health_logs_plant_id_idx` — B-tree on `(plant_id)`
- `health_logs_created_at_idx` — B-tree on `(plant_id, created_at DESC)`

**Foreign Keys:**
- `plant_id` → `plants(id)` ON DELETE CASCADE

---

## 2. ORM / Model Definitions

There is **no ORM layer** for the Supabase tables. The mobile app uses the Supabase JS client directly with the PostgREST API. Types are hand-maintained in `types/plant.ts`.

> The `lib/db` package (Drizzle ORM) exists in the monorepo but targets a separate Express API server (`artifacts/api-server`), not the mobile app's Supabase schema. It is not used by any mobile app queries.

### 2.1 TypeScript type definitions (`types/plant.ts`)

```typescript
// Enums (TypeScript union types — not DB enums)
type TaskType = 'watering' | 'fertilizing' | 'misting' | 'pruning' | 'repotting';
type LightRequirement = 'low' | 'medium' | 'bright_indirect' | 'full_sun';
type HumidityPreference = 'low' | 'medium' | 'high';
type DifficultyLevel = 'easy' | 'medium' | 'hard';

interface PlantCareProfile {
  id: string;
  species_name: string;
  watering_frequency_days: number;        // always present (DB default 7)
  fertilizing_frequency_days: number | null;
  light_requirement: LightRequirement | null;
  humidity_preference: HumidityPreference | null;
  difficulty_level: DifficultyLevel | null;
  notes: string | null;
  created_at: string;
}

interface CareTask {
  id: string;
  plant_id: string;
  task_type: TaskType;
  frequency_days: number | null;
  last_completed_at: string | null;
  next_due_at: string | null;
  notes: string | null;
  active_status: boolean;
  created_at: string;
}

interface CareLog {
  id: string;
  plant_id: string;
  task_type: TaskType;
  completed_at: string;
  notes: string | null;
  image_url: string | null;
}

interface JournalEntry {
  id: string;
  plant_id: string;
  title: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

interface HealthLog {
  id: string;
  plant_id: string;
  health_score: 1 | 2 | 3 | 4 | 5;
  issue_type: string | null;
  severity: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

interface Plant {
  id: string;
  user_id: string;
  display_name: string;                   // REQUIRED
  species_name: string | null;
  botanical_name: string | null;
  room_location: string | null;
  notes: string | null;
  image_url: string | null;
  light_conditions: string | null;
  humidity_preferences: string | null;
  watering_preferences: string | null;
  purchase_date: string | null;
  acquired_from: string | null;
  created_at: string;
  updated_at: string | null;
  care_tasks?: CareTask[];                // joined by usePlants / usePlant
}

interface PlantInput {
  display_name: string;                   // REQUIRED
  species_name?: string;
  botanical_name?: string;
  room_location?: string;
  notes?: string;
  image_url?: string;
  light_conditions?: string;
  watering_preferences?: string;
}
```

### 2.2 Relationships (inferred from queries)

```
plants (1) ──────< care_tasks (many)        JOIN: "*, care_tasks(*)"
plants (1) ──────< care_logs  (many)        Not currently joined in reads
plants (1) ──────< journal_entries (many)   Not currently joined in reads
plants (1) ──────< health_logs (many)       Not currently joined in reads
plant_care_profiles (0..1) ──── plants      Lookup-only, no FK, no JOIN
```

### 2.3 Cascade behavior

| Parent deleted | Child behavior |
|---|---|
| `auth.users` row | `plants` rows CASCADE deleted |
| `plants` row | `care_tasks`, `care_logs`, `journal_entries`, `health_logs` all CASCADE deleted |
| `plant_care_profiles` row | No effect (no FK relationship to plants) |

---

## 3. Current Supabase Structure

### 3.1 Tables in sync

All 6 tables are defined in `supabase-setup.sql` and must be manually applied via the Supabase SQL Editor (no migration tooling in use).

| Table | Synced | RLS | User-scoped |
|---|---|---|---|
| `plant_care_profiles` | Manual | ✅ Enabled | ❌ Shared |
| `plants` | Manual | ✅ Enabled | ✅ Yes |
| `care_tasks` | Manual | ✅ Enabled | ✅ Via plants |
| `care_logs` | Manual | ✅ Enabled | ✅ Via plants |
| `journal_entries` | Manual | ✅ Enabled | ✅ Via plants |
| `health_logs` | Manual | ✅ Enabled | ✅ Via plants |

### 3.2 Migration strategy

- **No migration tooling.** `supabase-setup.sql` is a full destructive reset (`DROP TABLE IF EXISTS … CASCADE` on all tables).
- Re-running the file destroys all existing data.
- There is no incremental migration history.

### 3.3 Auth assumptions

| Assumption | Value |
|---|---|
| Auth provider | Supabase email/password |
| Email confirmation | **DISABLED** (required for immediate signup flow) |
| Session persistence | `AsyncStorage` (device-local) |
| Token refresh | Automatic via Supabase JS client |
| Auth state | `AuthContext` → `session`, `user`, `loading` |
| Route guard | `(auth)/_layout.tsx` redirects authenticated users away from login/signup; `(tabs)/_layout.tsx` redirects unauthenticated users to `/login` |

### 3.4 RLS policies

**`plant_care_profiles`**
- `SELECT` — authenticated users only (`TO authenticated USING (true)`)
- No INSERT / UPDATE / DELETE policies (admin-only via service key)

**`plants`**
- `SELECT` — `auth.uid() = user_id`
- `INSERT` — `auth.uid() = user_id`
- `UPDATE` — `auth.uid() = user_id`
- `DELETE` — `auth.uid() = user_id`

**`care_tasks`, `care_logs`, `journal_entries`, `health_logs`**
- All policies use subquery pattern:
  `EXISTS (SELECT 1 FROM plants WHERE plants.id = <table>.plant_id AND plants.user_id = auth.uid())`
- `care_logs` has no UPDATE policy (immutability by omission)

### 3.5 Storage buckets

None. No Supabase Storage is configured. `image_url` fields in `plants`, `care_logs`, and `journal_entries` are plain `TEXT` columns — no upload infrastructure exists yet.

### 3.6 Database functions

One custom function:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
Used by the `plants_updated_at` trigger. No other custom functions.

### 3.7 Environment variable quirk

```typescript
// lib/supabase.ts — auto-detects swapped env vars
const a = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const b = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
const supabaseUrl      = a.startsWith("https://") ? a : b;
const supabaseAnonKey  = a.startsWith("https://") ? b : a;
```

**The two env vars are swapped** in the Replit Secrets UI:
- `EXPO_PUBLIC_SUPABASE_URL` contains the **anon key**
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` contains the **URL**

The client auto-corrects this at runtime. This must be preserved or corrected before any migration that reads these vars in a non-JS context.

---

## 4. Runtime Data Flow Mapping

### 4.1 Plant creation flow

```
PlantForm (display_name, species_name, room_location, notes)
  → useCreatePlant.mutateAsync(PlantInput)
    → supabase.from('plants').insert({ ...input, user_id })
      → returns { id, species_name }
    → generateDefaultCareTasks(id, species_name)
      → supabase.from('care_tasks').select  [guard: check existing watering task]
      → lookupCareProfile(species_name)
        → supabase.from('plant_care_profiles').select [ilike match]
      → supabase.from('care_tasks').insert([watering task, fertilizing task?])
    → supabase.from('plants').select("*, care_tasks(*)")  [re-fetch]
    → returns Plant
  → queryClient.invalidateQueries(['plants'])
  → router.back()

Tables written: plants, care_tasks
Tables read:    plant_care_profiles, care_tasks (guard check), plants
```

### 4.2 Home screen / plant list flow

```
HomeScreen
  → usePlants()
    → supabase.from('plants').select("*, care_tasks(*)")
      .order('created_at', { ascending: false })
    → Plant[]  (with care_tasks embedded)
  → local filter by: needsWatering() | getDaysUntilWatering() ≤ 2 | all
  → FlatList of PlantCard + WateringStatus
  → Pull-to-refresh calls refetch()

Tables read: plants, care_tasks (via JOIN)
Tables written: none
```

### 4.3 Plant detail / watering flow

```
PlantDetailScreen (id from URL param)
  → usePlant(id)
    → supabase.from('plants').select("*, care_tasks(*)").eq('id', id)
    → Plant (with care_tasks embedded)
  → waterPlant.mutateAsync(id)
    → supabase.from('care_logs').insert({ plant_id, task_type: 'watering', completed_at })
    → supabase.from('care_tasks').select('id, frequency_days') [existing watering task]
    → if exists: .update({ last_completed_at, next_due_at })
    → if not:    .insert({ plant_id, task_type: 'watering', last_completed_at })
    → queryClient.invalidateQueries(['plants'])

Tables written: care_logs, care_tasks
Tables read:    plants, care_tasks
```

### 4.4 Plant edit flow

```
PlantDetailScreen → setEditing(true)
  → PlantForm (pre-filled with plant data)
  → updatePlant.mutateAsync({ id, ...PlantInput })
    → supabase.from('plants').update({ ...input, updated_at })
      .eq('id', id).select("*, care_tasks(*)")
  → queryClient.invalidateQueries(['plants', 'plant'])

Tables written: plants
Tables read:    plants, care_tasks (via JOIN in return)
Note: species_name change does NOT re-generate care tasks
```

### 4.5 Plant delete flow

```
PlantDetailScreen → Alert confirm → deletePlant.mutateAsync(id)
  → supabase.from('plants').delete().eq('id', id)
  → CASCADE deletes: care_tasks, care_logs, journal_entries, health_logs
  → queryClient.invalidateQueries(['plants'])
  → router.back()

Tables written: plants (delete) + cascade to all 4 child tables
```

### 4.6 Onboarding dependencies

```
app/index.tsx (root redirect):
  if (!user): → /login
  if (user):  → /(tabs)/

app/(auth)/_layout.tsx:
  if (user && !loading): → /(tabs)/

app/(tabs)/_layout.tsx:
  if (!user && !loading): → /login

No onboarding wizard, tutorial, or first-run flow exists yet.
```

### 4.7 Search dependencies

**No search feature exists.** The home screen filter is client-side only (in-memory over the already-loaded plant list). No full-text search, no Supabase `textsearch`, no debounced query.

### 4.8 Care scheduling dependencies

| Function | Depends on |
|---|---|
| `generateDefaultCareTasks` | `plant_care_profiles` (read), `care_tasks` (read guard + write) |
| `useWaterPlant` | `care_logs` (write), `care_tasks` (read + write) |
| `getDaysUntilWatering` | `care_tasks.last_completed_at`, `care_tasks.frequency_days` |
| `needsWatering` | `getDaysUntilWatering` |

### 4.9 Notification dependencies

**No notifications exist.** No push token registration, no notification scheduling, no background tasks.

---

## 5. Current Enum Systems

### 5.1 Database-level check constraints (not true PostgreSQL ENUMs)

These are `TEXT` columns with `CHECK` constraints, not `CREATE TYPE ... AS ENUM`. They cannot be referenced by name elsewhere.

| Table | Column | Allowed values |
|---|---|---|
| `care_tasks` | `task_type` | `'watering'`, `'fertilizing'`, `'misting'`, `'pruning'`, `'repotting'` |
| `care_logs` | `task_type` | `'watering'`, `'fertilizing'`, `'misting'`, `'pruning'`, `'repotting'` |
| `plant_care_profiles` | `light_requirement` | `'low'`, `'medium'`, `'bright_indirect'`, `'full_sun'` |
| `plant_care_profiles` | `humidity_preference` | `'low'`, `'medium'`, `'high'` |
| `plant_care_profiles` | `difficulty_level` | `'easy'`, `'medium'`, `'hard'` |
| `health_logs` | `health_score` | `SMALLINT` BETWEEN 1 AND 5 |

### 5.2 TypeScript union types (frontend enums)

```typescript
type TaskType       = 'watering' | 'fertilizing' | 'misting' | 'pruning' | 'repotting';
type LightRequirement = 'low' | 'medium' | 'bright_indirect' | 'full_sun';
type HumidityPreference = 'low' | 'medium' | 'high';
type DifficultyLevel  = 'easy' | 'medium' | 'hard';
```

### 5.3 Frontend display enums (hardcoded in components)

**Home screen filter:**
```typescript
type FilterType = 'all' | 'today' | 'soon';
// 'today'  → needsWatering(plant) === true
// 'soon'   → getDaysUntilWatering(plant) > 0 && ≤ 2
```

**Health score display (types/plant.ts):**
```typescript
health_score: 1 | 2 | 3 | 4 | 5
// 1 = Critical, 2 = Poor, 3 = Stable, 4 = Healthy, 5 = Thriving
// (comment only — no display mapping component exists yet)
```

**Watering status display (plant/[id].tsx):**
```typescript
// urgent (daysLeft === 0):  "Needs watering today"
// daysLeft > 0:             "Water in N day(s)"
// no task:                  "No watering schedule set"
// chip: urgent              "Water now"
// chip: daysLeft === 1      "Tomorrow"
// chip: daysLeft > 1        "${daysLeft}d left"
// chip: no next_due         "Logged"
```

### 5.4 Care scheduling constants

```typescript
// lib/careProfiles.ts
const DEFAULT_WATERING_DAYS = 7;  // fallback when no species profile found
```

---

## 6. Legacy / Deprecated Fields

### 6.1 Unused columns (schema exists, no UI surface)

| Table | Column | Status | Notes |
|---|---|---|---|
| `plants` | `botanical_name` | **Defined, never written** | `PlantForm` has no input for it; `PlantInput` accepts it optionally but form omits it |
| `plants` | `image_url` | **Defined, never written** | No camera/upload UI; displayed nowhere |
| `plants` | `light_conditions` | **Defined, never written** | Free-text; no input in `PlantForm` |
| `plants` | `humidity_preferences` | **Defined, never written** | Free-text; no input in `PlantForm` |
| `plants` | `watering_preferences` | **Defined, never written** | Free-text; no input in `PlantForm` |
| `plants` | `purchase_date` | **Defined, never written** | Date field; no input anywhere |
| `plants` | `acquired_from` | **Defined, never written** | Free-text; no input anywhere |
| `care_tasks` | `notes` | **Defined, never written** | No UI to set task notes |
| `care_logs` | `notes` | **Defined, never written** | Watering action logs no notes |
| `care_logs` | `image_url` | **Defined, never written** | No photo-on-water feature |
| `journal_entries` | (entire table) | **Defined, never written or read** | No journal UI exists |
| `health_logs` | (entire table) | **Defined, never written or read** | No health tracking UI exists |

### 6.2 Schema/type mismatches

| Issue | Location | Detail |
|---|---|---|
| `room_location` in schema | `plants` table | Column exists |
| `room_location` in PlantInput | `types/plant.ts` | Field accepted |
| `room_location` in PlantForm | `components/PlantForm.tsx` | Input rendered — ✅ consistent |
| `botanical_name` in PlantInput | `types/plant.ts` | Accepted as optional |
| `botanical_name` in PlantForm | `components/PlantForm.tsx` | **No input rendered** — gap |

### 6.3 Application-layer gaps

| Gap | Impact |
|---|---|
| Editing a plant's `species_name` does **not** re-generate care tasks | Wrong schedule silently persists after species correction |
| No UNIQUE constraint on `(plant_id, task_type)` in `care_tasks` | Duplicate tasks possible if guard fails (e.g. concurrent creates) |
| `care_logs` has no UPDATE RLS policy (intentional) | Cannot correct a mistaken log entry |
| `plant_care_profiles.species_name` is exact-match only | "monstera" won't match "Monstera deliciosa"; relies on partial ilike |
| No common_names / alias system for species lookup | "Pothos" and "Epipremnum aureum" are separate profile rows |

---

## 7. Frontend Data Contracts

### 7.1 `PlantCard` component

**Reads from:** `Plant` (with `care_tasks`)

| Field | Required | Usage |
|---|---|---|
| `plant.id` | ✅ | `keyExtractor`, navigation to `/plant/[id]` |
| `plant.display_name` | ✅ | Card title |
| `plant.species_name` | ❌ | Subtitle (italic, shown if present) |
| `plant.room_location` | ❌ | Chip with map-pin icon |
| `plant.care_tasks` | ❌ | Passed to `getDaysUntilWatering`, `needsWatering` |
| `plant.care_tasks[].task_type` | — | Filter for `'watering'` task |
| `plant.care_tasks[].last_completed_at` | — | Days calculation |
| `plant.care_tasks[].frequency_days` | — | Days calculation |

**Breaking changes:** Removing `id`, `display_name`, or `care_tasks` from the query select would crash this component.

---

### 7.2 `WateringStatus` component

**Reads from:** `Plant[]`

| Field | Required | Usage |
|---|---|---|
| `plant.care_tasks` | ✅ | Counts plants needing water vs upcoming |
| `plant.care_tasks[].last_completed_at` | — | Drives `needsWatering()` |
| `plant.care_tasks[].frequency_days` | — | Drives `getDaysUntilWatering()` |

---

### 7.3 `PlantForm` component

**Writes to:** `PlantInput`

| Field | UI Input | Required | Notes |
|---|---|---|---|
| `display_name` | TextInput | ✅ | Validated non-empty |
| `species_name` | TextInput | ❌ | Drives care profile lookup on create |
| `room_location` | TextInput | ❌ | Free-text |
| `notes` | TextInput multiline | ❌ | Free-text |
| `botanical_name` | — | ❌ | **No input — accepted by type but not rendered** |
| `image_url` | — | ❌ | **No input** |
| `light_conditions` | — | ❌ | **No input** |
| `watering_preferences` | — | ❌ | **No input** |

---

### 7.4 `PlantDetailScreen` (`app/plant/[id].tsx`)

**Reads from:** `Plant` (with `care_tasks`)

| Field | Required | Usage |
|---|---|---|
| `plant.id` | ✅ | Delete, water, update mutations |
| `plant.display_name` | ✅ | Header title, delete confirmation |
| `plant.species_name` | ❌ | Italic subtitle |
| `plant.room_location` | ❌ | Location chip |
| `plant.notes` | ❌ | Notes section |
| `plant.care_tasks` (watering) | ❌ | Watering card, chip, button state |
| `wateringTask.last_completed_at` | — | "Last watered" date display |
| `wateringTask.frequency_days` | — | "Every Nd" chip |
| `wateringTask.next_due_at` | — | Not displayed directly (derived from last+freq) |

**⚠️ Note:** `next_due_at` is stored in the DB but never read by the UI. The UI derives next-due from `last_completed_at + frequency_days` at render time, which can drift from the stored `next_due_at`.

---

### 7.5 Home screen (`app/(tabs)/index.tsx`)

| Field | Required | Usage |
|---|---|---|
| `Plant[]` array | ✅ | FlatList |
| `plant.id` | ✅ | Key extractor |
| `plant.care_tasks` | ✅ | Filter logic (`needsWatering`, `getDaysUntilWatering`) |
| `plants.length` | — | Subtitle "N plants" |

---

### 7.6 Query keys (TanStack Query)

| Key | Hook | Invalidated by |
|---|---|---|
| `['plants', user.id]` | `usePlants` | `useCreatePlant`, `useDeletePlant`, `useWaterPlant`, `useUpdatePlant` |
| `['plant', id]` | `usePlant` | `useUpdatePlant` |

---

## 8. Current Search / Identity Flow

### 8.1 Plant search

**Does not exist.** The home screen "filter" is client-side categorization over the already-loaded list using three fixed buckets: All / Water today / Due soon. There is no text search, no debounced query, no server-side filter.

### 8.2 Species identity resolution

Species are resolved via a single function in `lib/careProfiles.ts`:

```
user types species_name (free-text, e.g. "Monstera" or "monstera deliciosa")
  → lookupCareProfile(species_name)
    → supabase
        .from('plant_care_profiles')
        .select('*')
        .ilike('species_name', `%${term}%`)
        .order('species_name')
        .limit(1)
        .maybeSingle()
    → returns first alphabetical partial match, or null
```

**Matching characteristics:**
- Case-insensitive (`ilike`)
- Substring match (wrapped in `%…%`)
- Returns first alphabetical match — no relevance ranking
- Returns `null` → falls back to 7-day watering default

### 8.3 Alias system

**Does not exist.** There is no alias, synonym, or common-name lookup table. "Pothos" and "Epipremnum aureum" are two separate rows in `plant_care_profiles`. A user typing "Devil's ivy" would get no match.

### 8.4 Canonical ID system

**Does not exist.** `plant_care_profiles.species_name` is the de facto canonical identifier, but it is a plain `TEXT` field with no slug, no external taxonomy ID (e.g. GBIF, Plants of the World Online), and no normalization. There is no link between `plants.species_name` (user-entered free text) and `plant_care_profiles.species_name` (exact seeded values) at the database level.

### 8.5 Normalization

**Does not exist.** `plants.species_name` is raw user input. It is never normalized, corrected, or linked to a `plant_care_profiles.id`. The profile lookup is a one-time query at plant creation time. If the profile table is updated later, existing plants' care schedules are not retroactively updated.

### 8.6 Collapse mapping

**Does not exist.** There is no mechanism to map variant spellings, common names, or genera-level entries (e.g. "Echeveria" as a genus) to a canonical species record.

---

## Summary: Pre-Migration Risk Register

| Risk | Severity | Detail |
|---|---|---|
| No DB UNIQUE on `(plant_id, task_type)` | 🔴 High | Duplicate care tasks possible on race condition or retry |
| `next_due_at` stored but not used by UI | 🟡 Medium | UI derives freshness from `last_completed_at + frequency_days`; stored value can silently drift |
| No species FK between `plants` and `plant_care_profiles` | 🟡 Medium | Profile updates don't propagate; identity is free-text |
| 7 unused columns on `plants` | 🟡 Medium | Schema is wider than the product; must decide: fill or drop |
| Env var swap auto-correction in code | 🟡 Medium | Any non-JS consumer of these vars will get wrong values |
| No migration tooling | 🟡 Medium | Current reset script destroys all data; migration history does not exist |
| `journal_entries` and `health_logs` fully defined but unused | 🟢 Low | Clean slate for design; no technical debt yet |
| No alias/common-name lookup | 🟢 Low | Users must type exact genus/species for profile match |
| No image upload infrastructure | 🟢 Low | `image_url` columns exist but no storage bucket configured |

---

*Generated from live codebase · v0.1 tag · `7e8ed698` · May 2026*
