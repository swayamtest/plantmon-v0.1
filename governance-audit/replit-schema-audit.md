# PLANTMON — Schema Governance Audit

**Scope:** Entire workspace — all artifacts and shared libraries  
**Type:** Read-only schema governance documentation  
**Generated:** May 2026  
**Based on:** Phase B1.75 Runtime Topology Audit + direct file inspection  

---

## 1 — ORM SYSTEM IN USE

### PLANTMON Mobile Artifact — No ORM

| Aspect | Detail | Governance Relevance |
|---|---|---|
| **ORM** | None. Raw SQL only (SQL files) + Supabase JS client for queries. | All schema changes must be made via SQL files and applied manually in Supabase Dashboard → SQL Editor. There is no `schema push` or `migrate` command for the mobile artifact. |
| **Client library** | `@supabase/supabase-js` (v2) via `lib/supabase.ts` | Queries are written as `supabase.from("plants").select("*")` etc. No type generation from schema — types are hand-maintained in `types/plant.ts` and `types/canonical.ts`. |
| **Query pattern** | PostgREST via Supabase client | All queries go through PostgREST. Column names in queries must match the live DB column names exactly. A mismatch between TypeScript types and live DB columns causes a silent `null` return (not a compile error). |
| **Validation** | Zod is present in the workspace catalog but is not used by the mobile artifact for runtime DB validation | The mobile app trusts PostgREST responses and TypeScript types. No runtime schema validation layer exists at the application boundary. |

### API Server Artifact — Drizzle ORM

| Aspect | Detail | Governance Relevance |
|---|---|---|
| **ORM** | Drizzle ORM (`drizzle-orm`, `drizzle-kit`) targeting a PostgreSQL database via `DATABASE_URL` env var | Completely separate from the Supabase database used by PLANTMON mobile. The two database systems do not share tables, schemas, or connections. |
| **Schema file** | `lib/db/schema.ts` | Drizzle table definitions. Currently scaffold only — no PLANTMON-related tables defined. |
| **Migration mechanism** | `pnpm --filter @workspace/db run push` (Drizzle Kit `db push`) | Schema push — not a migration file approach. Changes are applied directly to the dev DB. No migration history files. |
| **Config file** | `lib/db/drizzle.config.ts` | Points Drizzle Kit at `lib/db/schema.ts` and reads `DATABASE_URL`. |

**Governance note:** The two ORM systems (Supabase SQL files vs Drizzle) are entirely separate and must never be confused. The `DATABASE_URL` used by Drizzle is the api-server's PostgreSQL database. The Supabase project URL/anon key is the mobile app's database. They are different databases.

---

## 2 — MAIN SCHEMA DEFINITION FILES

### PLANTMON Mobile

| File Path | Short Explanation | Governance Relevance |
|---|---|---|
| `artifacts/mobile/supabase-setup.sql` | **Complete Phase 2.1 schema for fresh installs.** Drops all 9 tables (`CASCADE`) then recreates them with full Phase 2.1 structure, constraints, RLS policies, indexes, triggers, and 46 care profile seed rows. 280+ lines. | **DEV/RESET ONLY.** Must never be run on the live Supabase DB. Starts with destructive `DROP TABLE IF EXISTS … CASCADE`. The authoritative definition of what the full Phase 2.1 schema looks like. |
| `artifacts/mobile/supabase-migration-v2.sql` | **Phase 2.1 additive migration for the live DB.** Creates 3 new tables and adds columns to 5 existing tables. Idempotent (`IF NOT EXISTS` + `DROP/ADD CONSTRAINT` patterns). 278 lines. | **THE live-DB schema change file.** Status: PENDING EXECUTION. This is the migration that must be run to bring the live Supabase DB to Phase 2.1. Contains the only safe path to add Phase 2.1 columns without data loss. |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | **Phase B2.0 index + RLS hardening.** Additive only. No table or column changes. Adds 4 indexes, hardens 4 RLS policies, validates 1 UNIQUE constraint. Idempotent. | Run after `supabase-migration-v2.sql`, before dataset seeding. Does not change schema shape — only adds optimization and correctness layer. |

### API Server

| File Path | Short Explanation | Governance Relevance |
|---|---|---|
| `lib/db/schema.ts` | Drizzle ORM schema for the api-server PostgreSQL database. Currently scaffold only. | Separate from PLANTMON mobile. Governed by Drizzle Kit, not Supabase SQL Editor. |

---

## 3 — SETUP.SQL PRESENCE AND ROLE

| File Path | Short Explanation | Governance Relevance |
|---|---|---|
| `artifacts/mobile/supabase-setup.sql` | Present at artifact root (not in a `migrations/` folder). 280+ lines. Sections: (0) DROP CASCADE all tables, (1) `update_updated_at()` function, (2) `canonical_species`, (3) `plant_aliases`, (4) `collapse_mappings`, (5) `plant_care_profiles` + 46 seed rows, (6) `plants`, (7) `care_tasks`, (8) `care_logs`, (9) `journal_entries`, (10) `health_logs`. | **Dual role, conflicting danger:** This file is simultaneously the authoritative schema reference AND a destructive reset tool. It is the only place all 9 tables are defined together in their complete Phase 2.1 form. However, running it on any DB with existing user data would permanently delete all plants, care tasks, and history. |

**Governance risk:** There is no `setup.sql` or `baseline.sql` that is safe to run on a live database. The live-safe equivalent is `supabase-migration-v2.sql`. These two files must never be confused. The `supabase-setup.sql` file does not have a runtime guard (e.g., a transaction abort if tables exist with data). A future hardening step could add such a guard.

---

## 4 — MIGRATION FOLDERS AND NAMING STRUCTURE

### Structure Observation

There is **no `migrations/` folder** in this project. All SQL migration files live at the root of the mobile artifact alongside application source code.

| Path | Naming Pattern | Role |
|---|---|---|
| `artifacts/mobile/supabase-setup.sql` | `supabase-setup.sql` — generic name | Full reset schema. Confusingly similar name to `supabase-migration-v2.sql`. |
| `artifacts/mobile/supabase-migration-v2.sql` | `supabase-migration-v2.sql` — version suffix `v2` | Phase 2.1 live migration. The `v2` suffix corresponds to schema Phase 2.1, not a sequential migration number. |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` — phase prefix + version | Phase B2.0 hardening. Uses a phase-prefix naming convention, different from the `supabase-migration-vN` convention. |

### Naming Governance Issues

| Issue | Impact | Governance Relevance |
|---|---|---|
| No `migrations/` directory | All SQL lives mixed with application source. No sequential migration history. No migration runner. | Future migrations must maintain manual execution order. No automatic sequencing or rollback tracking. |
| Inconsistent naming conventions | `supabase-migration-v2.sql` uses a version suffix; `PRE_DATASET_HARDENING_MIGRATION_v1.sql` uses a phase prefix. | A future migration could be named either way, creating ambiguity about ordering and purpose. |
| No migration metadata table | No `schema_migrations` or `_migrations` tracking table in the Supabase DB. | There is no way to query the DB to know which migrations have been applied. Execution status must be tracked manually (e.g., via documentation). |
| `v2` is phase-version, not sequence | The `v2` in `supabase-migration-v2.sql` refers to schema Phase 2.1, not a second sequential migration. | A reader could interpret this as "the second migration in a series" when it is actually the first live-DB change (v1 being the original DB setup). |

### Recommended Future Convention

```
migrations/
  001_initial_setup.sql              ← idempotent version of supabase-setup.sql
  002_phase21_canonical_tables.sql   ← = supabase-migration-v2.sql
  003_phase_b20_hardening.sql        ← = PRE_DATASET_HARDENING_MIGRATION_v1.sql
  004_phase22_dataset_seeding.sql    ← future
```

---

## 5 — CANONICAL SPECIES SCHEMA REFERENCES

### Table: `canonical_species`

**Defined in:** `artifacts/mobile/supabase-setup.sql` (fresh install) and `artifacts/mobile/supabase-migration-v2.sql` (Section A1, live migration)

**Schema:**

```sql
CREATE TABLE canonical_species (
  canonical_species_id  TEXT        PRIMARY KEY,          -- format: PLANT_0001
  species_name          TEXT        NOT NULL,
  primary_archetype     TEXT,                             -- metadata only; NOT inheritance
  mainstream_priority   INTEGER,                          -- onboarding weighting
  india_relevance       INTEGER,                          -- localization weighting
  inventory_version     TEXT,                             -- dataset tracking
  identity_status       TEXT        NOT NULL DEFAULT 'active'
                          CHECK (identity_status IN ('active','deprecated','review_required')),
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `canonical_species_name_idx ON canonical_species (species_name)`
- `canonical_species_priority_idx ON canonical_species (mainstream_priority DESC, india_relevance DESC)`

**RLS:** `SELECT` for `authenticated` role only. No INSERT/UPDATE/DELETE RLS — admin-managed table.

**Current DB status:** Table does NOT exist in the live Supabase DB. It exists only in local SQL files. Will be created when `supabase-migration-v2.sql` is executed.

**Data status:** 0 rows. No `canonical_species` seed data has been defined yet. Dataset seeding is Phase B2.1.

**Governance significance:**
- `canonical_species_id` is the permanent operational identity backbone for the entire runtime
- IDs are immutable by design — they must never be recycled or changed
- `species_name` is a display helper and may evolve; `canonical_species_id` must not
- `primary_archetype` is metadata ONLY — it does not drive inheritance or runtime behavior
- The entire Phase 2.2 identity system depends on this table being populated before alias/collapse seeding

---

## 6 — `canonical_species_id` USAGE LOCATIONS

### In SQL Schema Files

| Table | Usage Pattern | File | Status in Live DB |
|---|---|---|---|
| `canonical_species` | `TEXT PRIMARY KEY` — the identity itself | `supabase-setup.sql`, `supabase-migration-v2.sql` §A1 | NOT YET LIVE |
| `plant_aliases` | `TEXT NOT NULL REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE` | `supabase-setup.sql`, `supabase-migration-v2.sql` §A2 | NOT YET LIVE |
| `collapse_mappings` | `TEXT NOT NULL REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE` | `supabase-setup.sql`, `supabase-migration-v2.sql` §A3 | NOT YET LIVE |
| `plant_care_profiles` | `TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` | `supabase-setup.sql`, `supabase-migration-v2.sql` §B1 | PENDING MIGRATION |
| `plants` | `TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` | `supabase-setup.sql`, `supabase-migration-v2.sql` §C1 | PENDING MIGRATION |
| `care_tasks` | `TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` | `supabase-setup.sql`, `supabase-migration-v2.sql` §D | PENDING MIGRATION |
| `care_logs` | `TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` | `supabase-setup.sql`, `supabase-migration-v2.sql` §D | PENDING MIGRATION |
| `journal_entries` | `TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` | `supabase-setup.sql`, `supabase-migration-v2.sql` §D | PENDING MIGRATION |
| `health_logs` | `TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` | `supabase-setup.sql`, `supabase-migration-v2.sql` §D | PENDING MIGRATION |

**Governance note:** `canonical_species` is the root of the FK tree. All 8 other tables reference it. All 6 operational table references use `ON DELETE SET NULL` (not CASCADE) — losing a canonical species entry sets the FK to NULL on all dependent rows, preserving data. Only `plant_aliases` and `collapse_mappings` use `ON DELETE CASCADE` because they are definitionally dependent on the canonical entry.

### In TypeScript Files

| File | Usage | Governance Relevance |
|---|---|---|
| `artifacts/mobile/types/plant.ts` | `Plant.canonical_species_id?: string`, `PlantInput.canonical_species_id?: string`, `PlantCareProfile.canonical_species_id?: string`, `CareTask.canonical_species_id?: string` | All are optional (`?`). The type system accepts the field but does not require it. |
| `artifacts/mobile/types/canonical.ts` | `CanonicalSpecies` interface definition | Defines the full canonical species shape with `canonical_species_id: string` as the primary field. |
| `artifacts/mobile/lib/careProfiles.ts` | `generateDefaultCareTasks()` has a parameter slot for `canonical_species_id` but does not yet pass it to DB inserts | Phase 2.2 activation point — when uncommented, will link care_tasks to canonical_species_id. |
| `artifacts/mobile/hooks/usePlants.ts` | Receives `canonical_species_id` in `PlantInput` but strips it from DB insert (Phase 2.1 shim) | The shim must be removed after `supabase-migration-v2.sql` confirms the column exists in live DB. |
| `artifacts/mobile/lib/runtimeValidation.ts` | `isReadyForCanonicalResolution(plant)` checks `plant.canonical_species_id` — used for Phase 2.2 activation gating | Diagnostic only. No mutations. |

### Runtime Propagation Gaps (current)

| Gap | Location | Effect |
|---|---|---|
| `care_logs` insert does not include `canonical_species_id` | `hooks/usePlants.ts` → `useWaterPlant()` | All historical watering logs will permanently have `canonical_species_id = NULL` for pre-Phase-2.2 waterings |
| Plants created before Phase 2.2 have no `canonical_species_id` | All existing user data | Requires a one-time backfill job (not yet implemented) |
| `care_tasks` created at plant onboarding do not include `canonical_species_id` | `lib/careProfiles.ts` → `generateDefaultCareTasks()` | All tasks for pre-Phase-2.2 plants are unlinked from canonical identity |

---

## 7 — `display_name` vs `plant_name` USAGE

### The Divergence

The **PLANTMON MVP Schema Freeze Document** defines the user-facing plant name field as `plant_name`. The **live Supabase DB column** and **all application code** use `display_name`. This naming divergence is intentional and preserved for backward compatibility.

| Aspect | `plant_name` | `display_name` |
|---|---|---|
| **Where used** | Schema Freeze Document (authoritative design spec) | Live Supabase DB column; all TypeScript types; all application code |
| **Semantic meaning** | Identical — the user's editable, personal, emotional name for their plant | Same |
| **Why the divergence exists** | The column was created as `display_name` in the original v0.1 DB setup before the schema freeze doc formalized `plant_name` | Historical naming; the DB column was never renamed |
| **Migration status** | No migration has been generated or planned to rename the column | The rename is not in `supabase-migration-v2.sql` |

### Usage Locations

| File | Uses | Content |
|---|---|---|
| `artifacts/mobile/supabase-setup.sql` | `display_name` | `display_name TEXT NOT NULL` with comment: `-- Note: 'display_name' is this app's column name for what the schema freeze doc calls 'plant_name'` |
| `artifacts/mobile/supabase-migration-v2.sql` | `display_name` | Comment in §C: `display_name (legacy column name for 'plant_name' in schema freeze doc) is preserved as-is for backward compat` |
| `artifacts/mobile/types/plant.ts` | `display_name` | `Plant.display_name: string` — NOT OPTIONAL; required field |
| `artifacts/mobile/hooks/usePlants.ts` | `display_name` | All SELECT, INSERT, UPDATE operations use `display_name` |
| `artifacts/mobile/components/PlantForm.tsx` | `display_name` | Form field label is "Plant Name" in the UI; underlying field name is `display_name` |
| `artifacts/mobile/app/plant/[id].tsx` | `display_name` | Renders `plant.display_name` as the plant's name heading |
| `artifacts/mobile/components/PlantCard.tsx` | `display_name` | Renders `plant.display_name` as the list item title |
| `attached_assets/PLANTMON_—_MVP_SCHEMA_FREEZE_DOCUMENT_*.md` | `plant_name` | Design spec uses `plant_name` throughout Section 2 identity contracts |

### Governance Risk Assessment

| Risk | Severity | Notes |
|---|---|---|
| Code/spec divergence | LOW | The divergence is documented in both the SQL files and the audit. It only matters if someone implements new features strictly from the spec without reading the actual column names. |
| Column rename risk | MEDIUM | Renaming `display_name` → `plant_name` on a live DB would require an `ALTER TABLE plants RENAME COLUMN` plus updates to all TypeScript types and all Supabase query strings. It is a multi-file coordinated change. |
| No current plan to rename | LOW URGENCY | The column functions identically regardless of name. Renaming is a cosmetic governance concern, not a runtime correctness concern. |

---

## 8 — ENUM DEFINITIONS FOUND

### 8.1 `task_type` — Care Task Category

**Defined in:** `care_tasks.task_type`, `care_logs.task_type`

| Version | Accepted Values | Location |
|---|---|---|
| v0.1 (live DB) | `'watering', 'fertilizing', 'misting', 'pruning', 'repotting'` | Live Supabase `care_tasks` CHECK constraint |
| Phase 2.1 (migration adds) | `'watering', 'fertilizing', 'misting', 'pruning', 'cleaning', 'repotting'` | `supabase-migration-v2.sql` §E |
| TypeScript `TaskType` | `"watering" \| "fertilizing" \| "misting" \| "pruning" \| "cleaning" \| "repotting"` | `types/canonical.ts` |
| TypeScript `TaskTypeLegacy` | `"watering" \| "fertilizing" \| "misting" \| "pruning" \| "repotting"` | `types/canonical.ts` |

**Drift:** `'cleaning'` exists in TypeScript but not yet in the live DB CHECK constraint. The migration adds it.

---

### 8.2 `light_requirement` — Light Condition Classification

**Defined in:** `plant_care_profiles.light_requirement`

| Version | Accepted Values | Location |
|---|---|---|
| v0.1 (live DB) | `'low', 'medium', 'bright_indirect', 'full_sun'` | Live Supabase CHECK constraint |
| Phase 2.1 canonical | `'low_light', 'medium_indirect', 'bright_indirect', 'direct_sun'` | `supabase-setup.sql` (fresh install only) |
| Migration (expanded) | Both sets combined | `supabase-migration-v2.sql` §B7 — drops old constraint, adds new accepting both |
| TypeScript `LightRequirement` | `"low_light" \| "medium_indirect" \| "bright_indirect" \| "direct_sun"` | `types/canonical.ts` |
| TypeScript `LightRequirementLegacy` | `"low" \| "medium" \| "bright_indirect" \| "full_sun"` | `types/canonical.ts` |
| TypeScript `LightRequirementAny` | Union of both | `types/plant.ts` |

**Drift risk:** The live DB has 46 rows using legacy values (`low`, `medium`, `full_sun`). The `supabase-setup.sql` seeds using canonical values. After the migration expands the CHECK, both are valid in the DB. The TypeScript `LightRequirementAny` union allows receiving either from PostgREST queries.

**Governance note:** `bright_indirect` appears in BOTH legacy and canonical value sets. It is the one value that did not change between versions. This is the only safe overlap.

---

### 8.3 `difficulty_level` — Care Complexity Rating

**Defined in:** `plant_care_profiles.difficulty_level`

| Version | Accepted Values | Location |
|---|---|---|
| v0.1 (live DB) | `'easy', 'medium', 'hard'` | Live Supabase CHECK constraint |
| Phase 2.1 canonical | `'beginner', 'intermediate', 'advanced'` | `supabase-setup.sql` |
| Migration (expanded) | `'easy', 'medium', 'hard', 'beginner', 'intermediate', 'advanced'` | `supabase-migration-v2.sql` §B7 |
| TypeScript `DifficultyLevel` | `"beginner" \| "intermediate" \| "advanced"` | `types/canonical.ts` |
| TypeScript `DifficultyLevelLegacy` | `"easy" \| "medium" \| "hard"` | `types/canonical.ts` |
| TypeScript `DifficultyLevelAny` | Union of both | `types/plant.ts` |

**Drift risk:** Live DB has 46 rows using `easy`/`medium`/`hard`. Post-migration, new rows can use `beginner`/`intermediate`/`advanced`. A future enum backfill pass must update legacy rows to canonical values before the legacy union types can be deprecated.

**Governance note:** `medium` exists in BOTH legacy difficulty and legacy light_requirement sets. In difficulty, `medium` is a legacy value for "intermediate". In light_requirement, `medium` is a legacy value for `medium_indirect`. Same string, different columns — not a conflict, but worth noting for any code that processes these generically.

---

### 8.4 `humidity_preference` — Humidity Tolerance

**Defined in:** `plant_care_profiles.humidity_preference`

| Version | Accepted Values | Location |
|---|---|---|
| All versions (no change) | `'low', 'medium', 'high'` | `supabase-setup.sql`, live DB |
| TypeScript `HumidityPreference` | `"low" \| "medium" \| "high"` | `types/canonical.ts` |

**Governance note:** This enum did NOT change between v0.1 and Phase 2.1. No drift. No coexistence handling needed.

---

### 8.5 `identity_status` — Canonical Species Lifecycle State

**Defined in:** `canonical_species.identity_status`

| Values | Meaning | Location |
|---|---|---|
| `'active'` | Normal operational species | `supabase-setup.sql`, `supabase-migration-v2.sql` §A1 |
| `'deprecated'` | Species retired from active use | Same |
| `'review_required'` | Species flagged for governance review | Same |
| TypeScript `IdentityStatus` | `"active" \| "deprecated" \| "review_required"` | `types/canonical.ts` |

**Governance note:** Deprecating a canonical species does not delete it or remove it from the DB (the ID must remain immutable). It signals to the runtime that this species should not be used for new plant onboarding.

---

### 8.6 `species_resolution_method` — Onboarding Resolution Tracking

**Defined in:** `plants.species_resolution_method`

| Value | Meaning | Location |
|---|---|---|
| `'direct_species_match'` | Exact canonical species name match | `supabase-setup.sql`, `supabase-migration-v2.sql` §C4 |
| `'alias_match'` | Resolved via `plant_aliases` lookup | Same |
| `'collapse_mapping_match'` | Resolved via `collapse_mappings` normalization | Same |
| `'fuzzy_match'` | Resolved via fuzzy/approximate match | Same |
| `'manual_override'` | Admin or user explicitly set the species | Same |
| `'unresolved'` | Species could not be resolved | Same |
| TypeScript `SpeciesResolutionMethod` | Union of all 6 values | `types/canonical.ts` |

**Current runtime usage:** Column will exist post-migration but is never populated by the current application code. All existing and new plants will have `species_resolution_method = NULL` until Phase 2.2 activation.

---

### 8.7 `alias_type` — Alias Classification

**Defined in:** `plant_aliases.alias_type`

| Value | Meaning | Location |
|---|---|---|
| `'common_name'` | Standard common name | `supabase-setup.sql`, `supabase-migration-v2.sql` §A2 |
| `'cultivar_name'` | Named cultivar/variety | Same |
| `'regional_name'` | Region-specific name | Same |
| `'nursery_name'` | Name commonly used in nurseries | Same |
| `'beginner_name'` | Simplified beginner-friendly name | Same |
| TypeScript `AliasType` | Union of all 5 values | `types/canonical.ts` |

**Governance note:** This enum distinguishes why an alias exists. `nursery_name` and `beginner_name` are operationally important for PLANTMON's India-aware onboarding strategy — these are the names users are most likely to type.

---

### 8.8 `watering_method` — Watering Technique Classification

**Defined in:** `plant_care_profiles.watering_method`

| Value | Governance Relevance | Location |
|---|---|---|
| `'soak_and_drain'` | For succulents/cacti — deep, infrequent | `supabase-setup.sql`, `supabase-migration-v2.sql` §B4 |
| `'consistent_moisture'` | For moisture-loving tropicals | Same |
| `'infrequent_deep_watering'` | Drought-tolerant plants | Same |
| `'bottom_water'` | For ferns, African violets | Same |
| `'mist_and_airflow'` | For air plants, mounted plants | Same |
| `'submersion_soak'` | For mounted orchids, air plants | Same |

**Governance note:** This enum encodes operationally distinct watering behaviors per the Collapse Governance Ruleset — species with different watering methods must NOT be collapsed into the same canonical identity.

---

### 8.9 `fertilizing_method` — Fertilizing Technique Classification

**Defined in:** `plant_care_profiles.fertilizing_method`

| Value | Location |
|---|---|
| `'diluted_liquid_feed'` | `supabase-setup.sql`, `supabase-migration-v2.sql` §B4 |
| `'slow_release_granules'` | Same |
| `'compost_topdress'` | Same |
| `'orchid_fertilizer'` | Same |
| `'low_nutrient_requirement'` | Same |
| `'foliar_feed'` | Same |

---

### 8.10 `repotting_method` — Repotting Technique Classification

**Defined in:** `plant_care_profiles.repotting_method`

| Value | Location |
|---|---|
| `'upgrade_pot_size'` | `supabase-setup.sql`, `supabase-migration-v2.sql` §B4 |
| `'refresh_substrate'` | Same |
| `'bark_refresh'` | Orchid-specific substrate refresh | Same |
| `'root_division'` | Propagation repotting | Same |
| `'minimal_disturbance'` | Root-sensitive species | Same |

---

### 8.11 `CareTaskStatus` — TypeScript Only (No DB Column)

**Defined in:** `types/canonical.ts` only

| Value | Intended Meaning |
|---|---|
| `"pending"` | Task is due but not yet completed |
| `"completed"` | Task has been completed |
| `"skipped"` | Task was deliberately skipped |
| `"overdue"` | Task is past its due date |

**Governance note:** This type is defined in TypeScript but **no DB column currently uses it**. The live `care_tasks` table uses only `active_status BOOLEAN`. `CareTaskStatus` is a forward declaration for a future task lifecycle system. Any code that reads `care_tasks.status` from the DB would receive `undefined` — this column does not exist.

---

## 9 — COEXISTENCE-COMPATIBLE SCHEMA PATTERNS

The Phase 2.1 migration uses several patterns specifically designed to allow old and new values to coexist safely during the migration period.

### Pattern 1: Nullable FK Columns for Phase 2.1 Fields

**Used in:** `plants.canonical_species_id`, `care_tasks.canonical_species_id`, `care_logs.canonical_species_id`, `journal_entries.canonical_species_id`, `health_logs.canonical_species_id`, `plant_care_profiles.canonical_species_id`

**Pattern:**
```sql
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;
```

**How it enables coexistence:** All Phase 2.1 canonical columns are nullable. Existing rows continue to work with `canonical_species_id = NULL`. New rows can optionally populate the canonical link. No data migration is required to add the columns.

**Governance relevance:** This is the "additive null" pattern — the safest way to add new operational identity fields to tables with live user data.

---

### Pattern 2: DROP CONSTRAINT + ADD CONSTRAINT for Enum Expansion

**Used in:** `plant_care_profiles.light_requirement`, `plant_care_profiles.difficulty_level`, `care_tasks.task_type`, `care_logs.task_type`

**Pattern:**
```sql
ALTER TABLE plant_care_profiles
  DROP CONSTRAINT IF EXISTS plant_care_profiles_light_requirement_check;
ALTER TABLE plant_care_profiles
  ADD CONSTRAINT plant_care_profiles_light_requirement_check
    CHECK (light_requirement IN (
      'low','medium','bright_indirect','full_sun',      -- legacy v0.1
      'low_light','medium_indirect','direct_sun'        -- canonical Phase 2.1
    ));
```

**How it enables coexistence:** Expands the allowed value set to include both legacy and canonical values. Existing rows with legacy values remain valid. New rows can use canonical values. No backfill required at migration time.

**Governance relevance:** This pattern avoids the need for a simultaneous "update all existing rows to new enum values" operation, which would be risky on a live DB with user data.

---

### Pattern 3: TypeScript Union Types for Dual-Value Enums

**Used in:** `types/plant.ts` (`LightRequirementAny`, `DifficultyLevelAny`), `types/canonical.ts` (`TaskTypeLegacy`, `LightRequirementLegacy`, `DifficultyLevelLegacy`)

**Pattern:**
```typescript
export type LightRequirementAny = LightRequirement | LightRequirementLegacy;
// = "low_light" | "medium_indirect" | "bright_indirect" | "direct_sun"
//   | "low" | "medium" | "full_sun"
```

**How it enables coexistence:** TypeScript accepts both legacy and canonical values from PostgREST responses without type errors. No runtime crash when the live DB returns a legacy enum value.

**Governance relevance:** These union types are explicitly temporary — they must be deprecated and replaced with the pure canonical types once all legacy DB rows are backfilled to canonical values.

---

### Pattern 4: Runtime Field Strip Shim (Application-Layer Coexistence)

**Used in:** `artifacts/mobile/hooks/usePlants.ts`

**Pattern:**
```typescript
const { user_entered_name, canonical_species_id, canonical_species_name,
        species_resolution_method, ...insertableInput } = input;
supabase.from("plants").insert({ ...insertableInput, user_id: user!.id });
```

**How it enables coexistence:** `PlantInput` carries Phase 2.1 fields that the pre-migration live DB does not have. The shim strips these fields before the PostgREST insert, preventing a 400 error. After the migration confirms the columns exist, this shim is removed.

**Governance relevance:** This is the application-layer equivalent of a nullable FK column — it allows the TypeScript type system to evolve ahead of the DB without runtime failures.

---

### Pattern 5: Routing Slot Architecture (careProfiles.ts)

**Used in:** `artifacts/mobile/lib/careProfiles.ts` → `resolveSpeciesProfile()`

**Pattern:**
```typescript
// [PHASE 2.2 ACTIVATION] — Uncomment when canonical dataset is seeded
// if (canonicalSpeciesId) {
//   const canonicalProfile = await lookupByCanonicalId(canonicalSpeciesId);
//   if (canonicalProfile) return canonicalProfile;
// }
return await lookupBySpeciesNameIlike(speciesName); // legacy path always active
```

**How it enables coexistence:** The ilike legacy path remains active for all plants. The canonical lookup path is present in the code but commented out, waiting for the dataset to exist. Both paths produce the same output type — no callers need to change when the new path is activated.

**Governance relevance:** This is a "routing slot" pattern — the routing decision point exists, the new branch is declared but dormant, activation is a single uncomment operation rather than a structural rewrite.

---

## 10 — SCHEMA DRIFT INDICATORS

Schema drift occurs when different layers of the system (live DB, local SQL files, TypeScript types, application code) disagree on the schema's shape. The following drift indicators were identified during audit.

---

### Drift 1 — Enum Value Divergence (ACTIVE, HIGH SIGNIFICANCE)

**Indicator:** The live Supabase `plant_care_profiles` table has 46 rows using legacy enum values. The local `supabase-setup.sql` seeds using Phase 2.1 canonical values.

| Column | Live DB values | Local SQL setup.sql values |
|---|---|---|
| `light_requirement` | `'low'`, `'medium'`, `'bright_indirect'`, `'full_sun'` | `'low_light'`, `'medium_indirect'`, `'bright_indirect'`, `'direct_sun'` |
| `difficulty_level` | `'easy'`, `'medium'`, `'hard'` | `'beginner'`, `'intermediate'`, `'advanced'` |

**Status:** Known and intentional. `supabase-migration-v2.sql` expands the CHECK constraints to accept both. Will persist until a future enum backfill pass normalizes all 46 rows.

**Governance risk:** If `supabase-setup.sql` is run against the live DB (incorrectly), the 46 rows would be deleted and re-seeded with canonical values — creating a one-time accidental normalization that may break TypeScript consumers expecting legacy values.

---

### Drift 2 — `task_type` Missing `'cleaning'` in Live DB (ACTIVE)

**Indicator:** `types/canonical.ts` defines `TaskType` including `"cleaning"`. `supabase-migration-v2.sql` §E adds `'cleaning'` to the live DB CHECK constraint. But until that migration runs, any attempt to insert a `care_tasks` row with `task_type = 'cleaning'` will fail with a CHECK constraint violation.

**Status:** Known. Will be resolved when `supabase-migration-v2.sql` is applied.

---

### Drift 3 — `display_name` vs `plant_name` Column Naming (PERSISTENT)

**Indicator:** The authoritative schema freeze document uses `plant_name`. The DB column is `display_name`. All application code uses `display_name`.

**Status:** Intentional and documented. No migration exists or is planned to rename the column. The column functions identically — this is purely a naming governance concern.

---

### Drift 4 — `CareTaskStatus` TypeScript Type with No DB Column (PERSISTENT)

**Indicator:** `types/canonical.ts` defines `CareTaskStatus = "pending" | "completed" | "skipped" | "overdue"`. No DB column with this type exists. The live `care_tasks` table uses `active_status BOOLEAN` only.

**Status:** Forward declaration. If application code ever reads `care_task.status`, it will receive `undefined` silently — not a PostgREST error, just `undefined`.

**Governance risk:** LOW (no current code reads this field). MEDIUM if future developers implement a `status` feature without checking whether the column exists in the DB.

---

### Drift 5 — `next_due_at` Written but Never Read in UI (ACTIVE, SCHEDULER RISK)

**Indicator:** `useWaterPlant()` writes `next_due_at = now + frequency_days * ms` to `care_tasks`. The UI scheduler functions (`getDaysUntilWatering`, `needsWatering`) compute from `last_completed_at + frequency_days * ms` — they ignore `next_due_at` entirely.

**Status:** Active divergence. Functionally equivalent today because both computations use the same `frequency_days`. Will produce incorrect UI countdowns when seasonal scheduler recalculates `next_due_at` using a different seasonal frequency.

**Governance risk:** HIGH — must be fixed before seasonal scheduler activation. If `next_due_at` is updated by any mechanism other than the simple `last_completed_at + frequency_days` formula, the UI will silently show wrong data.

---

### Drift 6 — Phase 2.1 Columns Exist in Types but Not in Live DB (ACTIVE, MANAGED)

**Indicator:** `PlantInput`, `Plant`, `PlantCareProfile`, `CareTask` TypeScript interfaces include Phase 2.1 fields (`canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method`, seasonal frequency fields, method fields, semantic intelligence fields). The live Supabase DB does not yet have these columns.

**Status:** Managed via Phase 2.1 shim in `usePlants.ts` (strips fields before insert) and forward-compatible `select("*")` (new nullable columns return `null` safely). This is intentional drift — the TypeScript model is ahead of the DB, with a compatibility layer bridging the gap.

**Resolution:** Shim removal after `supabase-migration-v2.sql` confirms successful application.

---

### Drift 7 — `canonical_species`, `plant_aliases`, `collapse_mappings` in Types but Not in Live DB (ACTIVE)

**Indicator:** `types/canonical.ts` defines `CanonicalSpecies`, `PlantAlias`, `CollapseMapping` interfaces. `lib/careProfiles.ts` has lookup function slots for alias resolution. The three tables do not exist in the live Supabase DB.

**Status:** Intentional forward declarations. No code currently queries these tables. Will become active after `supabase-migration-v2.sql` creates the tables and dataset seeding populates them.

---

### Drift Summary Table

| Drift Indicator | Severity | Managed? | Resolution Path |
|---|---|---|---|
| Enum value divergence (light/difficulty) | HIGH | YES — union types + expanded CHECK | Future enum backfill pass |
| `task_type` missing `cleaning` in live DB | MEDIUM | YES — migration pending | Apply `supabase-migration-v2.sql` |
| `display_name` vs `plant_name` naming | LOW | YES — documented | None planned |
| `CareTaskStatus` type with no DB column | LOW | YES — no code reads it | Add column when task lifecycle ships |
| `next_due_at` written but UI ignores it | HIGH | NO — unmanaged divergence | Fix `getDaysUntilWatering` before seasonal scheduler |
| Phase 2.1 columns in types, not in live DB | HIGH | YES — shim + forward SELECT | Apply `supabase-migration-v2.sql` |
| 3 new tables in types, not in live DB | MEDIUM | YES — no queries against them | Apply `supabase-migration-v2.sql` + dataset seeding |

---

*This document is read-only governance documentation. No files were modified in its generation. Reflects project state as of Phase B2.0.*
