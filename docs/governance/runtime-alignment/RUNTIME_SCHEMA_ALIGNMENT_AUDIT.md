# RUNTIME SCHEMA ALIGNMENT AUDIT
**PLANTMON — Phase B1.75**
**Status:** READ-ONLY · No code changes made
**Date:** 2026-05-28
**Scope:** Full source sweep of TypeScript types, hooks, lib layers, screen files, and SQL migration files against live schema ground truth.

---

## 1. Audit Scope & Source Coverage

| Source File | Role | Read Status |
|---|---|---|
| `artifacts/mobile/types/plant.ts` | Domain types: `Plant`, `CareTask`, `CareLog`, `PlantCareProfile`, `PlantInput`; scheduler helpers | ✅ Full |
| `artifacts/mobile/types/canonical.ts` | `CanonicalSpecies`, `PlantAlias`, `CollapseMapping`, all governance enums | ✅ Full |
| `artifacts/mobile/hooks/usePlants.ts` | All Supabase mutations; Phase 2.1 shims; `useWaterPlant` | ✅ Full |
| `artifacts/mobile/lib/careProfiles.ts` | `resolveSpeciesProfile` routing layer; Phase 2.2 stubs | ✅ Full |
| `artifacts/mobile/lib/runtimeValidation.ts` | Diagnostic / migration-readiness checks | ✅ Full |
| `artifacts/mobile/lib/supabase.ts` | Client init; swapped-credential detection | ✅ Full |
| `artifacts/mobile/app/(tabs)/index.tsx` | Plant list screen; filter logic; scheduler display | ✅ Full |
| `artifacts/mobile/app/plant/[id].tsx` | Plant detail screen; water action; edit form | ✅ Full |
| `artifacts/mobile/app/plant/new.tsx` | New plant onboarding screen | ✅ Full |
| `artifacts/mobile/supabase-setup.sql` | Full-schema (dev reset); authoritative column definitions | ✅ Full |
| `artifacts/mobile/supabase-migration-v2.sql` | Phase 2.1 additive migration; live DB ground truth | ✅ Full |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Phase B2.0 index + RLS hardening | ✅ Full |

**What was NOT read** (not in scope for this audit):
- `components/PlantCard.tsx`, `components/PlantForm.tsx`, `components/WateringStatus.tsx` — UI rendering only; no DB mutations
- `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/profile.tsx` — auth screens; no schema contact
- `hooks/useColors.ts`, `hooks/useAuth.ts` — no schema contact

---

## 2. Database Schema Ground Truth

Derived from `supabase-setup.sql` (full-schema) cross-referenced against `supabase-migration-v2.sql` (live additive migration). These are the **confirmed live columns** assuming both migration files have been applied.

### 2.1 `canonical_species`

| Column | Type | Constraint |
|---|---|---|
| `canonical_species_id` | TEXT | PRIMARY KEY (format: `PLANT_0001`) |
| `species_name` | TEXT | NOT NULL |
| `primary_archetype` | TEXT | nullable |
| `mainstream_priority` | INTEGER | nullable |
| `india_relevance` | INTEGER | nullable |
| `inventory_version` | TEXT | nullable |
| `identity_status` | TEXT | NOT NULL DEFAULT `'active'`; CHECK IN (`active`,`deprecated`,`review_required`) |
| `review_notes` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### 2.2 `plant_aliases`

| Column | Type | Constraint |
|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| `alias_name` | TEXT | NOT NULL |
| `canonical_species_name` | TEXT | NOT NULL |
| `canonical_species_id` | TEXT | NOT NULL FK → `canonical_species` ON DELETE CASCADE |
| `alias_type` | TEXT | NOT NULL CHECK IN (`common_name`,`cultivar_name`,`regional_name`,`nursery_name`,`beginner_name`) |
| `language_region` | TEXT | nullable |
| `search_priority` | INTEGER | NOT NULL DEFAULT 0 |
| `alias_confidence` | FLOAT | NOT NULL DEFAULT 1.0 CHECK BETWEEN 0 AND 1 |
| `review_notes` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### 2.3 `collapse_mappings`

| Column | Type | Constraint |
|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() |
| `collapsed_species_name` | TEXT | NOT NULL |
| `canonical_species_name` | TEXT | NOT NULL |
| `canonical_species_id` | TEXT | NOT NULL FK → `canonical_species` ON DELETE CASCADE |
| `collapse_reason` | TEXT | nullable |
| `operational_similarity` | FLOAT | nullable CHECK BETWEEN 0 AND 1 |
| `consumer_recognition_overlap` | FLOAT | nullable CHECK BETWEEN 0 AND 1 |
| `collapse_confidence` | FLOAT | nullable CHECK BETWEEN 0 AND 1 |
| `review_notes` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### 2.4 `plant_care_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `canonical_species_id` | TEXT | nullable FK → `canonical_species` (Phase 2.1 addition) |
| `species_name` | TEXT | NOT NULL UNIQUE — legacy lookup key |
| `watering_frequency_days` | INTEGER | NOT NULL DEFAULT 7 — legacy; superseded by seasonal |
| `fertilizing_frequency_days` | INTEGER | nullable — legacy |
| `watering_frequency_spring/summer/autumn/winter` | INTEGER | nullable — Phase 2.1 seasonal fields |
| `fertilizing_frequency_spring/summer/autumn/winter` | INTEGER | nullable — Phase 2.1 |
| `watering_method` | TEXT | nullable CHECK enum |
| `watering_method_description` | TEXT | nullable |
| `fertilizing_method` | TEXT | nullable CHECK enum |
| `fertilizing_method_description` | TEXT | nullable |
| `repotting_method` | TEXT | nullable CHECK enum |
| `repotting_signs` | TEXT | nullable |
| `repotting_method_description` | TEXT | nullable |
| `repotting_frequency_months` | INTEGER | nullable |
| `plant_profile` | TEXT | nullable — semantic intelligence |
| `seasonal_adjustments` | TEXT | nullable |
| `care_alerts` | TEXT | nullable |
| `placement_guidance` | TEXT | nullable |
| `suggested_location` | TEXT | nullable |
| `light_requirement` | TEXT | nullable CHECK (legacy+canonical union constraint) |
| `humidity_preference` | TEXT | nullable CHECK IN (`low`,`medium`,`high`) |
| `difficulty_level` | TEXT | nullable CHECK (legacy+canonical union constraint) |
| `notes` | TEXT | nullable — legacy guidance field |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Seed data:** 45 species seeded in `supabase-setup.sql` with only the legacy columns populated (`watering_frequency_days`, `fertilizing_frequency_days`, `light_requirement`, `humidity_preference`, `difficulty_level`, `notes`). All Phase 2.1 columns (`canonical_species_id`, seasonal frequencies, method fields, semantic fields) are `NULL` for all seeded rows.

### 2.5 `plants`

| Column | Type | Layer |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | NOT NULL FK → `auth.users` |
| `display_name` | TEXT | NOT NULL — Layer 1: user ownership identity |
| `user_entered_name` | TEXT | nullable — Layer 2: recognition identity (Phase 2.1) |
| `canonical_species_id` | TEXT | nullable FK → `canonical_species` — Layer 3 (Phase 2.1) |
| `canonical_species_name` | TEXT | nullable — display helper only (Phase 2.1) |
| `species_resolution_method` | TEXT | nullable CHECK enum (Phase 2.1) |
| `species_name` | TEXT | nullable — legacy identity (backward compat) |
| `botanical_name` | TEXT | nullable — legacy enrichment |
| `room_location` | TEXT | nullable |
| `notes` | TEXT | nullable |
| `image_url` | TEXT | nullable |
| `light_conditions` | TEXT | nullable — legacy (NOT `light_requirement`) |
| `humidity_preferences` | TEXT | nullable — legacy (NOT `humidity_preference`) |
| `watering_preferences` | TEXT | nullable — legacy |
| `purchase_date` | DATE | nullable |
| `acquired_from` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | nullable — auto-updated by trigger |

### 2.6 `care_tasks`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `plant_id` | UUID | NOT NULL FK → `plants` |
| `canonical_species_id` | TEXT | nullable FK → `canonical_species` (Phase 2.1 addition) |
| `task_type` | TEXT | NOT NULL CHECK IN (`watering`,`fertilizing`,`misting`,`pruning`,`cleaning`,`repotting`) |
| `frequency_days` | INTEGER | nullable CHECK > 0 |
| `last_completed_at` | TIMESTAMPTZ | nullable |
| `next_due_at` | TIMESTAMPTZ | nullable |
| `notes` | TEXT | nullable |
| `active_status` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### 2.7 `care_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `plant_id` | UUID | NOT NULL FK → `plants` |
| `canonical_species_id` | TEXT | nullable FK → `canonical_species` (Phase 2.1 addition) |
| `task_type` | TEXT | NOT NULL CHECK enum (same as care_tasks) |
| `completed_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| `notes` | TEXT | nullable |
| `image_url` | TEXT | nullable |

### 2.8 `journal_entries`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `plant_id` | UUID NOT NULL FK |
| `canonical_species_id` | TEXT nullable FK (Phase 2.1) |
| `title` | TEXT nullable |
| `notes` | TEXT nullable |
| `image_url` | TEXT nullable |
| `created_at` | TIMESTAMPTZ NOT NULL |

### 2.9 `health_logs`

| Column | Type |
|---|---|
| `id` | UUID PK |
| `plant_id` | UUID NOT NULL FK |
| `canonical_species_id` | TEXT nullable FK (Phase 2.1) |
| `health_score` | SMALLINT NOT NULL CHECK BETWEEN 1 AND 5 |
| `issue_type` | TEXT nullable |
| `severity` | TEXT nullable |
| `notes` | TEXT nullable |
| `image_url` | TEXT nullable |
| `created_at` | TIMESTAMPTZ NOT NULL |

---

## 3. TypeScript ↔ DB Alignment by Entity

### 3.1 `Plant` interface vs `plants` table

| TS Field | DB Column | Status | Notes |
|---|---|---|---|
| `id` | `id` | ✅ Aligned | UUID |
| `user_id` | `user_id` | ✅ Aligned | |
| `display_name` | `display_name` | ✅ Aligned | DB column name confirmed; schema freeze doc calls it `plant_name` — naming artifact only |
| `species_name` | `species_name` | ✅ Aligned | Legacy column |
| `canonical_species_id` | `canonical_species_id` | ✅ Aligned | Phase 2.1 — column exists in DB, typed in TS, BLOCKED by shim |
| `user_entered_name` | `user_entered_name` | ✅ Aligned | Phase 2.1 — column exists in DB, typed in TS, BLOCKED by shim |
| `canonical_species_name` | `canonical_species_name` | ✅ Aligned | Phase 2.1 — column exists in DB, typed in TS, BLOCKED by shim |
| `species_resolution_method` | `species_resolution_method` | ✅ Aligned | Phase 2.1 — column exists in DB, typed in TS, BLOCKED by shim |
| `botanical_name` | `botanical_name` | ✅ Aligned | DB column confirmed |
| `room_location` | `room_location` | ✅ Aligned | |
| `notes` | `notes` | ✅ Aligned | |
| `image_url` | `image_url` | ✅ Aligned | |
| `light_conditions` | `light_conditions` | ✅ Aligned | Legacy column (not `light_requirement`) |
| `humidity_preferences` | `humidity_preferences` | ✅ Aligned | Legacy column (not `humidity_preference`) — note plural |
| `watering_preferences` | `watering_preferences` | ✅ Aligned | |
| `purchase_date` | `purchase_date` | ✅ Aligned | DB type is `DATE` |
| `acquired_from` | `acquired_from` | ✅ Aligned | |
| `updated_at` | `updated_at` | ✅ Aligned | Auto-populated by DB trigger |
| `created_at` | `created_at` | ✅ Aligned | |
| `care_tasks` | *(joined)* | ✅ Aligned | Not a DB column — populated by nested select in `usePlant` |

**Plant entity: fully aligned. Zero column name mismatches.**

### 3.2 `CareTask` interface vs `care_tasks` table

| TS Field | DB Column | Status | Notes |
|---|---|---|---|
| `id` | `id` | ✅ Aligned | |
| `plant_id` | `plant_id` | ✅ Aligned | |
| `task_type` | `task_type` | ✅ Aligned | |
| `frequency_days` | `frequency_days` | ✅ Aligned | |
| `last_completed_at` | `last_completed_at` | ✅ Aligned | |
| `next_due_at` | `next_due_at` | ✅ Aligned | Column exists in DB; **NOT used by runtime scheduler** (see GAP-CT-002) |
| `notes` | `notes` | ✅ Aligned | |
| `active_status` | `active_status` | ✅ Aligned | |
| `created_at` | `created_at` | ✅ Aligned | |
| *(absent in TS)* | `canonical_species_id` | ⚠️ TYPE GAP | DB column exists (Phase 2.1); not in `CareTask` interface — column comes back from `*` select but is silently dropped |

**Gap: `CareTask` TS type does not include `canonical_species_id`.** Column is present in the DB (added by migration-v2 Section D) and populated from DB reads via `*` selector, but no TypeScript field captures it. Downstream analytics and Phase 2.2 propagation cannot reference it via type-safe code.

### 3.3 `CareLog` interface vs `care_logs` table

| TS Field | DB Column | Status | Notes |
|---|---|---|---|
| `id` | `id` | ✅ Aligned | |
| `plant_id` | `plant_id` | ✅ Aligned | |
| `task_type` | `task_type` | ✅ Aligned | |
| `completed_at` | `completed_at` | ✅ Aligned | |
| `notes` | `notes` | ✅ Aligned | |
| *(absent in TS)* | `canonical_species_id` | ⚠️ TYPE GAP | DB column exists; not in `CareLog` interface |
| *(absent in TS)* | `image_url` | ⚠️ TYPE GAP | DB column exists; not in `CareLog` interface |

**Two type gaps on `CareLog`.** Neither `canonical_species_id` nor `image_url` from the DB are represented in the TS interface.

### 3.4 `PlantCareProfile` interface vs `plant_care_profiles` table

| TS Field | DB Column | Status | Notes |
|---|---|---|---|
| `id` | `id` | ✅ Aligned | |
| `canonical_species_id` | `canonical_species_id` | ✅ Aligned | Phase 2.1 |
| `species_name` | `species_name` | ✅ Aligned | |
| `watering_frequency_days` | `watering_frequency_days` | ✅ Aligned | Legacy field |
| `fertilizing_frequency_days` | `fertilizing_frequency_days` | ✅ Aligned | |
| `watering_frequency_spring/summer/autumn/winter` | same | ✅ Aligned | Phase 2.1 seasonal |
| `fertilizing_frequency_spring/summer/autumn/winter` | same | ✅ Aligned | Phase 2.1 seasonal |
| `watering_method` | `watering_method` | ✅ Aligned | |
| `watering_method_description` | `watering_method_description` | ✅ Aligned | |
| `fertilizing_method` | `fertilizing_method` | ✅ Aligned | |
| `fertilizing_method_description` | `fertilizing_method_description` | ✅ Aligned | |
| `repotting_method` | `repotting_method` | ✅ Aligned | |
| `repotting_signs` | `repotting_signs` | ✅ Aligned | |
| `repotting_method_description` | `repotting_method_description` | ✅ Aligned | |
| `repotting_frequency_months` | `repotting_frequency_months` | ✅ Aligned | |
| `plant_profile` | `plant_profile` | ✅ Aligned | |
| `seasonal_adjustments` | `seasonal_adjustments` | ✅ Aligned | |
| `care_alerts` | `care_alerts` | ✅ Aligned | |
| `placement_guidance` | `placement_guidance` | ✅ Aligned | |
| `suggested_location` | `suggested_location` | ✅ Aligned | |
| `light_requirement` | `light_requirement` | ✅ Aligned | |
| `humidity_preference` | `humidity_preference` | ✅ Aligned | Note: singular — different from `plants.humidity_preferences` (plural) |
| `difficulty_level` | `difficulty_level` | ✅ Aligned | |
| `notes` | `notes` | ✅ Aligned | |

**`PlantCareProfile` entity: fully aligned.**
**Important distinction:** `plant_care_profiles.light_requirement` and `humidity_preference` (singular) are different column names from `plants.light_conditions` and `humidity_preferences` (plural). This is intentional — different tables, different legacy naming — but a developer must not conflate them.

### 3.5 `CanonicalSpecies` interface vs `canonical_species` table

| TS Field | DB Column | Status |
|---|---|---|
| `canonical_species_id` | `canonical_species_id` | ✅ Aligned |
| `species_name` | `species_name` | ✅ Aligned |
| `primary_archetype` | `primary_archetype` | ✅ Aligned |
| `mainstream_priority` | `mainstream_priority` | ✅ Aligned |
| `india_relevance` | `india_relevance` | ✅ Aligned |
| `inventory_version` | `inventory_version` | ✅ Aligned |
| `identity_status` | `identity_status` | ✅ Aligned |
| `review_notes` | `review_notes` | ✅ Aligned |
| `created_at` | `created_at` | ✅ Aligned |

**CanonicalSpecies entity: fully aligned.**

### 3.6 `PlantAlias` interface vs `plant_aliases` table

All fields aligned. ✅

### 3.7 `CollapseMapping` interface vs `collapse_mappings` table

All fields aligned. ✅

### 3.8 `journal_entries` — TypeScript coverage

No `JournalEntry` TypeScript interface found in `types/plant.ts` or `types/canonical.ts`. The DB table exists with 5 columns. **Zero TypeScript type coverage.** This is acceptable if journal features are not yet built, but the table structure should be reflected in a TS type before any journal UI is introduced.

### 3.9 `health_logs` — TypeScript coverage

No `HealthLog` TypeScript interface found. The DB table exists with 7 columns including a typed `health_score SMALLINT CHECK 1-5` and `canonical_species_id`. **Zero TypeScript type coverage.** Same note as journal entries above.

---

## 4. Runtime Logic Gaps

### GAP-RAD-001 — `getDaysUntilWatering` never reads `next_due_at` *(CONFIRMED)*

**Location:** `types/plant.ts` lines 241–248
**Description:** The scheduler computes days until watering as:
```
nextWater = last_completed_at + frequency_days * ms
daysLeft  = ceil((nextWater - now) / ms_per_day)
```
It reads `last_completed_at` and `frequency_days` from the active `CareTask`. It **never** reads `next_due_at` from the DB.

**Consequence 1 — `next_due_at` drift:** The `next_due_at` column on `care_tasks` is populated at task creation by `generateDefaultCareTasks` (set to `NOW() + frequency_days`). After `useWaterPlant` executes, it updates `last_completed_at` but does NOT recompute and write `next_due_at`. After the first watering, `next_due_at` is permanently stale. The DB column is useless for any future feature that reads it directly.

**Consequence 2 — No timezone awareness:** The computation uses raw millisecond arithmetic without timezone normalization. This can drift by up to ±1 day at midnight boundaries depending on device locale.

**Consequence 3 — `"Due soon"` filter reliability:** `app/(tabs)/index.tsx` uses `getDaysUntilWatering(p) <= 2` for the "Due soon" filter. This is computed entirely client-side at render time and is consistent with the rest of the app — but confirms that no server-side scheduling exists.

**Risk level:** Medium. App is self-consistent today. Risk materialises when a second system (notifications, background job, analytics) tries to read `next_due_at` from DB and gets stale values.

---

### GAP-CL-001 — `care_logs` INSERT omits `canonical_species_id` *(CONFIRMED)*

**Location:** `hooks/usePlants.ts` `useWaterPlant` hook, INSERT block
**Description:** `useWaterPlant` inserts:
```typescript
{ plant_id, task_type: 'watering', completed_at: now, notes: null }
```
The `canonical_species_id` column exists on `care_logs` (added by migration-v2 Section D). It is never populated.

**Consequence:** Every `care_log` row will have `canonical_species_id = NULL` permanently, even after Phase 2.2 identity activation assigns `canonical_species_id` to the parent `plants` row. Historical care logs will be unresolvable by canonical identity for analytics purposes unless a backfill migration is run.

**Fix:** One-line change — add `canonical_species_id: plant.canonical_species_id ?? null` to the INSERT payload. The value is available on the plant record after Phase 2.2 activation.

**Risk level:** High for analytics/Phase 3 data quality. Low for current app functionality.

---

### GAP-CT-001 — `care_tasks` `canonical_species_id` typed gap

**Location:** `types/plant.ts` `CareTask` interface
**Description:** The `canonical_species_id` column was added to `care_tasks` by migration-v2 Section D. The `CareTask` TypeScript interface does not include this field. The Supabase `*` selector in `usePlants` returns the column value from the DB, but it is silently dropped at the TypeScript boundary.

**Consequence:** Phase 2.2 propagation code that tries to write or read `canonical_species_id` on a `CareTask` will require an interface update first. Any code attempting `task.canonical_species_id` today will get a TypeScript error.

**Risk level:** Low (blocking type gap, not a data corruption risk). Straightforward to fix.

---

### GAP-CL-002 — `care_logs.image_url` not in `CareLog` TS type

**Location:** `types/plant.ts` `CareLog` interface
**Description:** The DB `care_logs` table has an `image_url` column. The `CareLog` TypeScript interface does not include it. No current feature uses it, but if a future "log with photo" feature is added, this will need to be added to the type first.

**Risk level:** Low. No current feature is affected.

---

### GAP-CRED-001 — Supabase credentials swapped in env vars *(MITIGATED)*

**Location:** `lib/supabase.ts`
**Description:** The environment variable names are swapped:
- `EXPO_PUBLIC_SUPABASE_URL` holds the **anon key**
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` holds the **URL**

**Mitigation in place:** `lib/supabase.ts` detects this at runtime by checking `startsWith("https://")` and swaps them back:
```typescript
const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const url  = rawUrl.startsWith("https://") ? rawUrl : rawKey;
const key  = rawUrl.startsWith("https://") ? rawKey : rawUrl;
```

**Consequence:** App functions correctly despite the swap. However, this is a fragile ENV configuration that will break if the key ever starts with `https://` (theoretically impossible for a Supabase anon key, but still a sharp edge) or if a new developer inspects the env vars without knowing about the swap.

**Risk level:** Low (mitigated). Should be fixed in ENV configuration before any team expansion.

---

### GAP-SCHED-001 — `generateDefaultCareTasks` has app-level duplicate guard only

**Location:** `hooks/usePlants.ts` `useCreatePlant`
**Description:** `generateDefaultCareTasks` checks for an existing active watering task before inserting, but this guard is application-level only. There was no DB-level uniqueness constraint on `(plant_id, task_type) WHERE active_status = TRUE` until `PRE_DATASET_HARDENING_MIGRATION_v1.sql` Section A1 added it.

**Current status:** The unique partial index `care_tasks_plant_task_active_unique` in `PRE_DATASET_HARDENING_MIGRATION_v1.sql` closes this gap at the DB level — **IF** that migration has been applied. Until then, concurrent inserts or admin operations could create duplicate active tasks, causing the scheduler to fire duplicate results silently.

**Risk level:** Medium before B2.0 migration; Low after.

---

## 5. Phase 2.1 Shim Status

### SHIM-001 — `useCreatePlant` identity shim

**Location:** `hooks/usePlants.ts` `useCreatePlant`
**Action:** Strips 4 fields from the INSERT payload before writing to Supabase:
```typescript
// Phase 2.1 shim: identity fields not yet written to DB
const { user_entered_name, canonical_species_id, canonical_species_name, species_resolution_method, ...safeInput } = input;
```
**Effect:** The 4 Phase 2.1 columns exist in the DB. The app will never accidentally write them until the shim is removed as part of Phase 2.2 identity activation.

**Shim is ACTIVE and INTENTIONAL.** No gap — this is controlled behavior.

---

### SHIM-002 — `useUpdatePlant` identity shim

**Location:** `hooks/usePlants.ts` `useUpdatePlant`
**Action:** Same 4-field strip applied to UPDATE payloads.
**Effect:** Editing a plant cannot overwrite identity fields until the shim is removed.

**Shim is ACTIVE and INTENTIONAL.**

---

### SHIM-003 — `resolveSpeciesProfile` Phase 2.2 canonical path stub

**Location:** `lib/careProfiles.ts` `resolveSpeciesProfile`
**Description:** The function contains two routing branches:
1. **Phase 2.2 canonical path** (if `plant.canonical_species_id`): stub that returns `null` — no DB query executed
2. **Legacy ilike path** (if `plant.species_name`): live query against `plant_care_profiles` by `species_name` ilike

**Effect:** All current care profile resolution uses the legacy ilike path. The canonical path is inert.

**Dependency note:** The ilike lookup will only return results if the `plant_care_profiles` table has been seeded (requires `supabase-setup.sql` seed data or equivalent). If the live DB was set up via `supabase-migration-v2.sql` alone (which does not seed profiles), the ilike path will return nothing for all plants.

---

## 6. Migration Application Status — Inferred State

| Migration File | Application Status | Inference Basis |
|---|---|---|
| `supabase-setup.sql` (initial schema) | Applied or superseded | Phase 2.1 columns confirmed referenced in code; `runtimeValidation.ts` uses them as existence check |
| `supabase-migration-v2.sql` | Required for Phase 2.1 columns | `getSchemaMigrationStatus()` checks for `canonical_species_id` and `user_entered_name` on plants — these are checked as migration gate |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Unknown — cannot confirm from code | No runtime code references the indexes or corrected RLS policies added by this migration |

**Cannot confirm live DB state from code alone.** `runtimeValidation.ts:getSchemaMigrationStatus()` must be called on a live plant row to determine whether migration-v2 is applied.

---

## 7. Critical Gap Register

| Gap ID | Table / Layer | Description | Severity | Fix Complexity |
|---|---|---|---|---|
| GAP-RAD-001 | `care_tasks` / scheduler | `next_due_at` is never updated after watering; stale indefinitely | Medium | Low — update `useWaterPlant` to recompute and write `next_due_at` |
| GAP-CL-001 | `care_logs` / mutation | `canonical_species_id` omitted from every INSERT | High (data quality) | Low — one field added to INSERT payload |
| GAP-CT-001 | `CareTask` TS type | `canonical_species_id` missing from interface | Low | Trivial — add optional field to interface |
| GAP-CL-002 | `CareLog` TS type | `image_url` missing from interface | Low | Trivial |
| GAP-CRED-001 | `lib/supabase.ts` / env | Env vars swapped; shim mitigates but fragile | Low (mitigated) | Low — fix ENV config |
| GAP-SCHED-001 | `care_tasks` / DB constraints | No DB-level unique active task guard until B2.0 migration applied | Medium | Resolved by PRE_DATASET migration |
| GAP-JE-001 | `journal_entries` table | No TS type coverage | Low | Low — add TS interface before any journal UI |
| GAP-HL-001 | `health_logs` table | No TS type coverage | Low | Low — add TS interface before any health UI |
| GAP-SEED-001 | `plant_care_profiles` seed | Seed data only populated via `supabase-setup.sql`; migration-v2 alone leaves table empty | Medium | Confirm live DB seed state before Phase 2.2 |

---

## 8. Pre-Dataset Migration Readiness Summary

The following must be true **before** the canonical species dataset is loaded and Phase 2.2 identity activation begins:

| Check | Status | Notes |
|---|---|---|
| `supabase-migration-v2.sql` applied | ❓ Unconfirmed | Verify via `getSchemaMigrationStatus()` on a live plant row |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` applied | ❓ Unconfirmed | Verify via F1–F6 validation queries in that file |
| `plant_care_profiles` seeded with 45 species | ❓ Unconfirmed | Required for legacy ilike path in `resolveSpeciesProfile` to work |
| `canonical_species`, `plant_aliases`, `collapse_mappings` tables empty | ❓ Unconfirmed | Must be empty before dataset load (per B2.0 migration prerequisite) |
| `GAP-CL-001` (care_logs canonical gap) addressed | ❌ Not fixed | Should be fixed before or at the same time as Phase 2.2 activation to avoid historical nulls |
| `GAP-CT-001` (CareTask TS type) addressed | ❌ Not fixed | Should be fixed before Phase 2.2 canonical propagation code is written |
| SHIM-001 and SHIM-002 removal plan documented | ✅ Documented | In `ACTIVATION_SEQUENCE_GUARDRAILS.md` |

---

## 9. Architectural Observations (Non-Gap, Non-Blocking)

### O-001 — `display_name` vs `plant_name` naming artifact
The DB column is named `display_name`. The schema freeze document calls this concept `plant_name`. All application code uses `display_name` consistently. This is not a runtime gap — it is a vocabulary artifact between the governance docs and the DB. A comment in `supabase-setup.sql` acknowledges this explicitly. No action needed; document-level disambiguation is sufficient.

### O-002 — `light_conditions` / `humidity_preferences` vs `light_requirement` / `humidity_preference`
`plants` table uses plural legacy names (`light_conditions`, `humidity_preferences`, `watering_preferences`). `plant_care_profiles` uses canonical singular names (`light_requirement`, `humidity_preference`). These are different tables with different columns — not a bug. A developer must never conflate them when building UI that bridges both tables.

### O-003 — Scheduler is entirely client-side
No server-side scheduling exists. All "due today" / "due soon" logic runs in JavaScript at render time. This is appropriate for the current scale. Any future push notification feature will need to replicate `getDaysUntilWatering` logic server-side, at which point `next_due_at` drift (GAP-RAD-001) will become a blocking issue.

### O-004 — `careProfiles.ts` legacy path dependency on seed data
The currently-active care profile resolution path (`ilike` on `species_name`) only produces results if `plant_care_profiles` is seeded. The 45-species seed is in `supabase-setup.sql` only. Any live DB provisioned via the migration-only path will have an empty `plant_care_profiles` table and silent null returns from `resolveSpeciesProfile` with no error surfaced to the user.

### O-005 — No `JournalEntry` or `HealthLog` UI or types yet
Tables exist in the DB schema. No TypeScript types, no hooks, no screens reference them. This is expected at the current build phase. They are ready to be built against without schema changes.

---

## 10. Audit Confidence Notes

This audit is based entirely on static source analysis of SQL migration files and TypeScript source files. It does **not** reflect:

- **Live DB state** — whether migrations have actually been applied
- **Supabase RLS behavior at runtime** — policies are read from SQL only
- **Actual env var values** — only their names and the swap-detection shim logic are confirmed
- **Whether `canonical_species`, `plant_aliases`, `collapse_mappings` are populated** — tables exist; data presence is unverified

To close the gap between this static audit and confirmed live state, run `runtimeValidation.ts:getSchemaMigrationStatus()` on a fetched plant row and execute the `PRE_DATASET_HARDENING_MIGRATION_v1.sql` Section F validation queries against the live Supabase instance.

---

*End of audit. Document is READ-ONLY — no code changes were made as part of producing this report.*
