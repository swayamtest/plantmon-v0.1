# PLANTMON — Migration Postcheck Runbook

**Classification:** Governance Migration Authority  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + `MIGRATION_EXECUTION_PROTOCOL.md` + `MIGRATION_PRECHECK_RUNBOOK.md` + `MIGRATION_AUTHORITY_DECLARATION.md` + `RUNTIME_COMPATIBILITY_CONTRACT.md` + `ACTIVATION_BOUNDARY_REGISTRY.md`  

This runbook is the authoritative post-migration verification procedure for every PLANTMON schema migration. It is executed immediately after staged migration execution (Step 5 of the Migration Execution Protocol) and must be completed before the governance lifecycle may advance to Step 8 (Governance Ledger Update) or any downstream activity (dataset seeding, activation planning).

**How to use this runbook:**

1. Execute every query in the applicable section(s) against the live Supabase DB via the Supabase Dashboard SQL Editor
2. Compare each result against its documented expected value AND against the pre-migration baseline captured in `MIGRATION_PRECHECK_RUNBOOK.md`
3. Record the actual result in the postcheck completion record
4. Any result that does not match its expected value is a **FAIL condition** — classified as either ROLLBACK-REQUIRED or INVESTIGATE-REQUIRED per the Migration Abort Conditions section
5. The postcheck is passed only when every query in all applicable blocks returns its expected result

**Relationship to the precheck runbook:** The precheck establishes baselines; the postcheck measures against them. The most critical comparisons are: row counts (must not decrease from precheck PC-DAT-01 baseline), canonical isolation (must remain zero-populated), and coexistence integrity (runtime behavior must be identical to pre-migration).

No code, schema, or migration file was modified in this document's generation.

---

## MANDATORY POSTCHECK CATEGORIES

### Category 1 — Schema Integrity

**Purpose:** Confirm that every object the migration was designed to create now exists with the correct structure — correct column names, correct data types, correct nullability — and that no existing object was altered, renamed, or removed.

**What is verified:**
- All new tables defined in the migration SQL now exist in `public`
- All new columns added by the migration now exist on the correct tables
- All new columns are nullable (no inadvertent NOT NULL)
- All pre-existing tables still exist with their pre-migration column set intact
- No pre-existing column has been renamed, retyped, or dropped

**Fail condition:** Any new object defined in the migration SQL is absent from the live DB. This indicates the migration failed partway through or the relevant statement was skipped.

**Fail condition:** Any pre-existing object (table, column, constraint) is absent after the migration that was present before. This indicates an unauthorized destructive operation occurred.

---

### Category 2 — RLS Integrity

**Purpose:** Confirm that all RLS policies defined in the migration SQL now exist on the correct tables with the correct permissions, that RLS remains enabled on all user-data tables, and that no pre-existing policy was overwritten or removed.

**What is verified:**
- All new policies created by the migration exist with correct names and definitions
- RLS is enabled (`rowsecurity = true`) on all tables created by the migration
- All pre-existing policies on user-data tables are still present and unchanged
- No policy name collision occurred silently (PostgreSQL replaces existing policies on `CREATE OR REPLACE POLICY`)

**Fail condition:** Any policy defined in the migration SQL is absent. Migration failed to apply the RLS section.

**Fail condition:** RLS is disabled on any table the migration created. Accidental `DISABLE ROW LEVEL SECURITY` or a missing `ENABLE ROW LEVEL SECURITY` clause.

**Fail condition:** Any pre-existing policy on `plants`, `care_tasks`, `care_logs`, or `plant_care_profiles` is absent or has a changed definition. The migration inadvertently dropped or replaced a pre-existing policy.

---

### Category 3 — FK Integrity

**Purpose:** Confirm that all FK constraints defined in the migration SQL were created correctly, that FK targets exist, and that the cascade behavior (ON DELETE, ON UPDATE) matches the governed specification — specifically that no CASCADE behavior was silently created on tables containing user care history.

**What is verified:**
- All new FK constraints exist with correct from-column, to-table, to-column
- `plant_aliases.canonical_species_id → canonical_species(id)` FK exists
- FK cascade behavior is `ON DELETE RESTRICT` or `ON DELETE SET NULL` for any FK involving `care_logs`, `care_tasks`, `health_logs`, or `journal_entries`
- No `ON DELETE CASCADE` from any new FK targeting user-data tables

**Fail condition:** Any FK defined in the migration SQL is absent. The referential integrity the migration was designed to enforce is not in place.

**Fail condition:** Any FK involving a user-history table has `delete_rule = CASCADE`. Historical care continuity guarantee is at risk.

---

### Category 4 — Index Integrity

**Purpose:** Confirm that all indexes defined in the migration SQL now exist and that no pre-existing index was dropped or replaced.

**What is verified:**
- All new indexes created by the migration exist with correct names
- GIN index on `plant_aliases.alias_name` exists (for hardening migration)
- UNIQUE index on `plant_aliases` active alias constraint exists (for hardening migration)
- Pre-existing indexes on `plants`, `care_tasks`, `care_logs` are intact

**Fail condition:** Any index defined in the migration SQL is absent. The performance and uniqueness guarantees the migration was designed to create are not in place.

---

### Category 5 — Coexistence Continuity

**Purpose:** Confirm that the four coexistence mechanisms protecting the PLANTMON runtime remain intact and effective after the migration. The migration must be activation-independent — it must not have triggered any inactive system or altered any active behavior.

**What is verified:**
- Phase 2.1 coexistence shim still protects all writes (columns now exist but shim still strips them → INSERT succeeds)
- `SELECT *` on `plants` returns new nullable columns as `null` (not as missing keys, not as errors)
- All new columns on existing rows are `null` (no DEFAULT silently populated existing rows)
- All new tables are empty (migration creates structure, not data — seeding is a separate event)
- The comment-gated routing slots are still inactive (code has not changed)
- Canonical isolation: `canonical_species_id` is `null` or absent on all rows in all tables

**Fail condition:** Any pre-existing plant row has a non-null value in any Phase 2.1 column. A migration DEFAULT silently propagated values.

**Fail condition:** Any new table has rows immediately after migration. Unauthorized data was inserted as part of the migration SQL.

**Fail condition:** Plant creation test fails after migration. Coexistence continuity is broken.

---

### Category 6 — Scheduler Continuity

**Purpose:** Confirm that the care scheduling behavior for all existing plants is unchanged after the migration. No plant's countdown has changed. No plant's `frequency_days` has changed. No `next_due_at` has been rewritten by any migration trigger or default.

**What is verified:**
- All active watering task `frequency_days` values match pre-migration values (row count of changed values = 0)
- All `next_due_at` values for existing plants match pre-migration values
- No new triggers on `care_tasks` were created by the migration
- `getDaysUntilWatering` input data (the four columns it reads) is unchanged for all existing plants

**Fail condition:** Any active care task's `frequency_days` differs from its pre-migration value. Migration inadvertently modified scheduling data.

**Fail condition:** Any `next_due_at` has been updated on a pre-existing task without a corresponding watering event. Migration trigger or DEFAULT silently mutated scheduler data.

---

### Category 7 — Onboarding Continuity

**Purpose:** Confirm that plant creation succeeds with the same behavior as before the migration — specifically that the `plant_care_profiles` reference data is intact after §B7 (DROP-and-recreate), that ilike resolution continues to work, and that the 7-day fallback remains in place.

**What is verified:**
- `plant_care_profiles` row count is ≥ the pre-migration baseline from PC-DAT-02
- `plant_care_profiles` species data matches the pre-migration baseline sample from PC-DAT-03
- Plant creation with a recognized species succeeds and returns the correct `frequency_days`
- Plant creation with an unrecognized species succeeds and returns `frequency_days = 7`
- No `plants` table structural change blocks the shim's 5-field INSERT payload

**Fail condition:** `plant_care_profiles` row count is lower than pre-migration baseline. §B7 lost reference data. Care profiles are missing; all affected species will receive 7-day fallback until profiles are restored.

**Fail condition:** Plant creation returns HTTP 400. A structural change to `plants` is incompatible with the current INSERT payload.

---

## REQUIRED POSTCHECK QUERIES

All queries below are read-only SELECT statements. Execute them in the Supabase Dashboard SQL Editor immediately after migration execution. Record all results.

---

### Block 1 — Schema Integrity Verification

```sql
-- PC-POST-SCHEMA-01: All tables in public schema (post-migration)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected (post-supabase-migration-v2.sql):
--   canonical_species     | rowsecurity = true (NEW)
--   care_logs             | rowsecurity = true
--   care_tasks            | rowsecurity = true
--   health_logs           | rowsecurity = true
--   journal_entries       | rowsecurity = true
--   plant_aliases         | rowsecurity = true (NEW)
--   plant_care_profiles   | rowsecurity = (check pre-migration value)
--   plants                | rowsecurity = true
-- FAIL if canonical_species or plant_aliases absent
-- FAIL if any pre-existing table is absent

-- PC-POST-SCHEMA-02: Phase 2.1 columns now exist on plants
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
  AND column_name IN (
    'canonical_species_id',
    'user_entered_name',
    'canonical_species_name',
    'species_resolution_method'
  )
ORDER BY column_name;
-- Expected: 4 rows, all is_nullable = 'YES', all column_default = NULL
-- FAIL if < 4 rows (some Phase 2.1 columns not created)
-- FAIL if any is_nullable = 'NO' (inadvertent NOT NULL constraint)
-- FAIL if any column_default is non-null (inadvertent DEFAULT that populates existing rows)

-- PC-POST-SCHEMA-03: canonical_species_id now exists on care_tasks
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'care_tasks'
  AND column_name = 'canonical_species_id';
-- Expected: 1 row, is_nullable = 'YES', column_default = NULL
-- FAIL if 0 rows

-- PC-POST-SCHEMA-04: canonical_species_id now exists on care_logs
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'care_logs'
  AND column_name = 'canonical_species_id';
-- Expected: 1 row, is_nullable = 'YES', column_default = NULL
-- FAIL if 0 rows

-- PC-POST-SCHEMA-05: canonical_species table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'canonical_species'
ORDER BY ordinal_position;
-- Expected: columns matching the CREATE TABLE definition in supabase-migration-v2.sql
-- Record all column names. FAIL if canonical_species table is absent (query returns 0 rows)

-- PC-POST-SCHEMA-06: plant_aliases table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plant_aliases'
ORDER BY ordinal_position;
-- Expected: columns including at minimum alias_name, canonical_species_id,
-- search_priority (and any others defined in migration SQL)
-- Record all. FAIL if table absent or expected columns missing

-- PC-POST-SCHEMA-07: plant_care_profiles column set intact (post-§B7 recreation)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plant_care_profiles'
ORDER BY ordinal_position;
-- Compare against pre-migration PC-COL-07 baseline.
-- All pre-existing columns must be present with same type and nullability.
-- canonical_species_id should now also be present (added by §B7 recreation).
-- FAIL if any pre-existing column is absent
-- FAIL if canonical_species_id is absent (migration SQL should have added it in §B7)

-- PC-POST-SCHEMA-08: Pre-existing plants columns completely intact
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
ORDER BY ordinal_position;
-- Expected: all 7 pre-migration columns present + 4 new Phase 2.1 columns = 11 total
-- FAIL if any pre-existing column absent or has changed data_type or is_nullable
```

---

### Block 2 — Column Existence and Nullability Validation

```sql
-- PC-POST-COL-01: All new Phase 2.1 columns across all affected tables
SELECT table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'plants' AND column_name IN (
      'canonical_species_id', 'user_entered_name',
      'canonical_species_name', 'species_resolution_method'
    ))
    OR
    (table_name = 'care_tasks' AND column_name = 'canonical_species_id')
    OR
    (table_name = 'care_logs' AND column_name = 'canonical_species_id')
    OR
    (table_name = 'plant_care_profiles' AND column_name = 'canonical_species_id')
  )
ORDER BY table_name, column_name;
-- Expected: 7 rows total (4 on plants, 1 each on care_tasks/care_logs/plant_care_profiles)
-- All is_nullable = 'YES'
-- All column_default = NULL
-- FAIL if any row absent, non-nullable, or has a default

-- PC-POST-COL-02: Canonical isolation — all Phase 2.1 columns are NULL on all existing rows
-- Test on plants:
SELECT
  COUNT(*)                                                     AS total_plants,
  COUNT(canonical_species_id)                                  AS canonical_id_populated,
  COUNT(user_entered_name)                                     AS user_entered_populated,
  COUNT(canonical_species_name)                                AS canonical_name_populated,
  COUNT(species_resolution_method)                             AS resolution_method_populated
FROM plants;
-- Expected: all _populated counts = 0 (columns exist but all NULL on existing rows)
-- FAIL if any _populated count > 0
-- This is CRITICAL: non-zero count means a DEFAULT silently populated existing rows
-- or an unauthorized write occurred; triggers ROLLBACK-REQUIRED

-- PC-POST-COL-03: Canonical isolation — care_tasks
SELECT COUNT(canonical_species_id) AS canonical_populated FROM care_tasks;
-- Expected: 0
-- FAIL if > 0

-- PC-POST-COL-04: Canonical isolation — care_logs
SELECT COUNT(canonical_species_id) AS canonical_populated FROM care_logs;
-- Expected: 0
-- FAIL if > 0

-- PC-POST-COL-05: Canonical isolation — plant_care_profiles
SELECT COUNT(canonical_species_id) AS canonical_populated FROM plant_care_profiles;
-- Expected: 0 (column exists post-migration, but no seeding has occurred yet)
-- FAIL if > 0 (data seeding is a separate Phase B2.1 event; no canonical IDs should
-- be present immediately post-migration)
```

---

### Block 3 — Row Integrity (Critical Data Safety Checks)

```sql
-- PC-POST-ROW-01: User data row counts (compare against precheck PC-DAT-01 baseline)
SELECT
  (SELECT COUNT(*) FROM plants)          AS plants_count,
  (SELECT COUNT(*) FROM care_tasks)      AS care_tasks_count,
  (SELECT COUNT(*) FROM care_logs)       AS care_logs_count,
  (SELECT COUNT(*) FROM health_logs)     AS health_logs_count,
  (SELECT COUNT(*) FROM journal_entries) AS journal_entries_count;
-- Compare every value against the PC-DAT-01 baseline recorded in the precheck.
-- ROLLBACK-REQUIRED immediately if ANY count is lower than the precheck baseline.
-- A count increase is expected only if the migration included authorized seed data.
-- An unexpected count increase (no seed data in migration) should be investigated.

-- PC-POST-ROW-02: plant_care_profiles row count (compare against PC-DAT-02 baseline)
SELECT COUNT(*) AS care_profile_count FROM plant_care_profiles;
-- Compare against precheck PC-DAT-02 value.
-- ROLLBACK-REQUIRED if count is lower than precheck baseline.
-- The §B7 DROP-and-recreate must preserve all rows.
-- Count must be ≥ precheck baseline, never lower.

-- PC-POST-ROW-03: plant_care_profiles data integrity sample
SELECT id, species_name, watering_frequency_days, light_requirement
FROM plant_care_profiles
ORDER BY species_name
LIMIT 10;
-- Compare against precheck PC-DAT-03 sample.
-- Same species should appear with the same watering_frequency_days.
-- FAIL if any species present in the precheck sample is absent post-migration.
-- FAIL if any watering_frequency_days value has changed from the precheck sample.

-- PC-POST-ROW-04: New canonical tables are empty (seeding not yet applied)
SELECT
  (SELECT COUNT(*) FROM canonical_species) AS canonical_species_rows,
  (SELECT COUNT(*) FROM plant_aliases)     AS plant_aliases_rows;
-- Expected: both = 0
-- FAIL if either > 0 (unauthorized seeding occurred during migration SQL execution)
-- Note: seeding is a separate Phase B2.1 event; these tables must be empty
-- immediately post-migration

-- PC-POST-ROW-05: plants display_name integrity (no rows lost their display_name)
SELECT COUNT(*) AS plants_missing_display_name
FROM plants
WHERE display_name IS NULL OR display_name = '';
-- Expected: 0 (same as precheck PC-DAT-06)
-- FAIL if count increased from precheck baseline (migration corrupted display_name values)

-- PC-POST-ROW-06: care_tasks frequency_days integrity
SELECT
  COUNT(*) AS total_active_watering_tasks,
  COUNT(frequency_days) AS tasks_with_frequency,
  COUNT(*) - COUNT(frequency_days) AS tasks_missing_frequency
FROM care_tasks
WHERE task_type = 'watering' AND active_status = true;
-- Compare against precheck PC-DAT-07 baseline.
-- tasks_missing_frequency must not have increased from precheck (migration must not
-- have created orphan tasks or nullified existing frequency_days values).
-- FAIL if tasks_missing_frequency is higher than precheck baseline.

-- PC-POST-ROW-07: Existing plants have not had their core fields altered
-- Sample check — compare a few plants' fields against expected pre-migration values:
SELECT id, display_name, species_name, room_location, created_at
FROM plants
ORDER BY created_at
LIMIT 5;
-- Visually confirm these match the pre-migration state.
-- Core fields (display_name, species_name, created_at) must be unchanged.
-- FAIL if any plant's display_name or species_name differs from pre-migration value.
```

---

### Block 4 — Constraint Verification

```sql
-- PC-POST-CON-01: All constraints post-migration
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pgc.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
-- Compare against precheck PC-CON-01 baseline.
-- All pre-existing constraints must still be present with unchanged definitions.
-- New constraints from the migration must be present.
-- FAIL if any pre-existing constraint is absent.

-- PC-POST-CON-02: plant_care_profiles CHECK constraints (post-§B7 recreation)
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'plant_care_profiles'::regclass
  AND contype = 'c'
ORDER BY conname;
-- Compare against precheck PC-CON-02 baseline.
-- The CHECK constraint on light_requirement must exist with the same definition.
-- The constraint name may have changed if §B7 used a different naming convention
-- than the original table definition — record the new name if different.
-- FAIL if no CHECK constraint exists on plant_care_profiles post-recreation.

-- PC-POST-CON-03: FK constraints on new tables
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('plant_aliases', 'canonical_species')
ORDER BY tc.table_name;
-- Expected: plant_aliases.canonical_species_id → canonical_species(id) FK exists
-- Record delete_rule and update_rule.
-- FAIL if no FK from plant_aliases to canonical_species.
-- INVESTIGATE if delete_rule = 'CASCADE' — this should not cascade to user-data tables,
-- but plant_aliases itself contains no user data so CASCADE here is not a
-- historical continuity risk; it is still unexpected per governance doctrine.

-- PC-POST-CON-04: Confirm no new CASCADE FK on user-history tables
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('care_logs', 'health_logs', 'journal_entries')
  AND rc.delete_rule = 'CASCADE';
-- Expected: 0 rows
-- FAIL if any rows returned — CASCADE on user-history tables violates historical
-- care continuity guarantee (Protected Property 5 in MIGRATION_EXECUTION_PROTOCOL.md)
```

---

### Block 5 — Policy Existence Verification

```sql
-- PC-POST-RLS-01: All RLS policies post-migration
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Compare against precheck PC-RLS-01 baseline.
-- All pre-existing policies must still be present.
-- New policies from the migration must be present on the correct tables.
-- FAIL if any pre-existing policy is absent.

-- PC-POST-RLS-02: RLS enabled on all tables including new ones
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: rowsecurity = true for ALL tables in public schema.
-- This includes canonical_species and plant_aliases (newly created).
-- FAIL if any table has rowsecurity = false.

-- PC-POST-RLS-03: Policies exist on new tables
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('canonical_species', 'plant_aliases')
GROUP BY tablename;
-- Expected: both canonical_species and plant_aliases have ≥ 1 policy each.
-- FAIL if either table has 0 policies (RLS enabled but no allow policies =
-- every query returns 0 rows for all users, including app service role).
-- Note: the exact required policies depend on the migration SQL definition.
-- Verify the policy definitions match the migration SQL intent.
```

---

### Block 6 — Index Integrity Verification

```sql
-- PC-POST-IDX-01: All indexes post-migration
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
-- Compare against precheck PC-IDX-01 baseline.
-- All pre-existing indexes must still be present.
-- New indexes from the migration must be present.
-- FAIL if any pre-existing index is absent.

-- PC-POST-IDX-02: GIN index on plant_aliases.alias_name (post-hardening migration)
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'plant_aliases'
    AND indexname = 'idx_plant_aliases_alias_name_gin'
) AS gin_exists;
-- Expected: true (after PRE_DATASET_HARDENING_MIGRATION_v1.sql)
-- Note: replace index name with exact name from migration SQL
-- FAIL if false

-- PC-POST-IDX-03: UNIQUE active alias index (post-hardening migration)
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'plant_aliases'
    AND indexname = 'idx_plant_aliases_unique_active'
) AS unique_exists;
-- Expected: true (after PRE_DATASET_HARDENING_MIGRATION_v1.sql)
-- Note: replace index name with exact name from migration SQL
-- FAIL if false

-- PC-POST-IDX-04: Verify index definitions are correct (not just name-exists)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'plant_aliases';
-- Expected: GIN index uses gin_trgm_ops or equivalent text search operator class
-- Expected: UNIQUE index enforces alias uniqueness with the correct WHERE clause
-- Record full index definitions. INVESTIGATE if definition differs from migration SQL.
```

---

### Block 7 — FK Integrity Verification

```sql
-- PC-POST-FK-01: Complete FK map post-migration
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;
-- Compare against precheck PC-CON-05 baseline.
-- All pre-existing FKs must still be present with unchanged delete_rule/update_rule.
-- New FKs from the migration must be present.
-- FAIL if any pre-existing FK absent or has changed cascade behavior.

-- PC-POST-FK-02: Verify canonical_species integrity (no orphaned plant_aliases)
-- (Only relevant after plant_aliases is seeded — run this during Phase B2.1 seeding,
-- not immediately post-migration since both tables will be empty)
-- Included here for completeness; expected to return 0 rows both because
-- no rows have been inserted yet:
SELECT pa.id, pa.alias_name, pa.canonical_species_id
FROM plant_aliases pa
LEFT JOIN canonical_species cs ON cs.id = pa.canonical_species_id
WHERE cs.id IS NULL
  AND pa.canonical_species_id IS NOT NULL;
-- Expected: 0 rows (no aliases reference non-existent canonical species)
-- Post-seeding: this query should still return 0 rows (FK enforces this)
```

---

## RUNTIME VALIDATION CHECKS

All runtime checks must be performed against the live running app immediately after the postcheck queries pass. These are behavioral tests, not DB queries.

### Plant Creation Validation

**Test RTV-01 — Plant creation with recognized species (post-migration):**

Steps:
1. Open the PLANTMON app
2. Navigate to Add Plant
3. Enter display_name: "Postcheck Test Plant Alpha"
4. Enter species_name: "Monstera deliciosa"
5. Submit the form

Expected results:
- Form submission succeeds with no error banner
- Plant appears in plant list
- Verify via Supabase Dashboard:
  ```sql
  SELECT id, display_name, species_name,
         canonical_species_id, user_entered_name,
         canonical_species_name, species_resolution_method
  FROM plants
  WHERE display_name = 'Postcheck Test Plant Alpha';
  ```
  - Plant row exists
  - `canonical_species_id` IS NULL — shim is still stripping the field
  - `user_entered_name` IS NULL — shim is still stripping the field
  - `species_resolution_method` IS NULL — shim is still stripping the field

- Verify care task:
  ```sql
  SELECT task_type, frequency_days, next_due_at, canonical_species_id
  FROM care_tasks
  WHERE plant_id = (
    SELECT id FROM plants WHERE display_name = 'Postcheck Test Plant Alpha'
  );
  ```
  - `task_type = 'watering'` row exists
  - `frequency_days` matches the expected value from ilike lookup (e.g., 10 for Monstera)
  - `canonical_species_id` IS NULL — shim protects care task creation too

FAIL condition: HTTP 400 on form submission. The migration added a NOT NULL column or incompatible constraint that breaks the shim's INSERT payload.

FAIL condition: `canonical_species_id` is non-null on the new plant row. The shim is no longer protecting the write, or a DB DEFAULT silently populated the field.

FAIL condition: `frequency_days` is null or 7 for Monstera deliciosa. The §B7 recreation lost plant_care_profiles data.

---

**Test RTV-02 — Plant creation with unrecognized species (post-migration):**

Steps:
1. Add Plant
2. Enter display_name: "Postcheck Test Plant Beta"
3. Enter species_name: "Fictionus plantus testii"
4. Submit

Expected results:
- Form submission succeeds
- `frequency_days = 7` on the new care task (fallback applied)
- All Phase 2.1 columns NULL on the new plant row

FAIL condition: HTTP 400. Same as RTV-01 FAIL.
FAIL condition: `frequency_days` ≠ 7. Fallback logic is broken.

---

### Watering Flow Validation

**Test RTV-03 — Watering event (post-migration):**

Steps:
1. Select any existing plant (not a postcheck test plant)
2. Tap the watering button
3. Confirm the watering action

Expected results:
- Watering succeeds with no error
- Plant countdown resets to `frequency_days` days
- Verify via Supabase Dashboard:
  ```sql
  SELECT cl.id, cl.watered_at, cl.canonical_species_id
  FROM care_logs cl
  JOIN plants p ON p.id = cl.plant_id
  ORDER BY cl.watered_at DESC
  LIMIT 1;
  ```
  - New `care_logs` row exists with correct `watered_at`
  - `canonical_species_id` IS NULL on the care log row (shim protects care_logs too)

  ```sql
  SELECT last_completed_at, next_due_at, canonical_species_id
  FROM care_tasks
  WHERE plant_id = (SELECT id FROM plants WHERE display_name = '[plant you watered]')
    AND task_type = 'watering' AND active_status = true;
  ```
  - `last_completed_at` updated to approximately NOW()
  - `next_due_at` updated to `last_completed_at + frequency_days * 86400s`
  - `canonical_species_id` IS NULL (migration added column; shim keeps it null)

FAIL condition: Watering fails. Post-migration structural change broke the UPDATE path.
FAIL condition: `canonical_species_id` non-null in care_logs. Same as RTV-01 canonical isolation failure.

---

### Scheduler Validation

**Test RTV-04 — Countdown integrity (post-migration):**

Purpose: Confirm that countdowns for all existing plants are unchanged by the migration.

Steps:
1. Before migration, record the countdown for 3 plants from the precheck SCHED-02 query
2. After migration, run the same query and compare:
   ```sql
   SELECT
     p.display_name,
     ct.frequency_days,
     ct.last_completed_at,
     ct.next_due_at,
     CEIL(
       EXTRACT(EPOCH FROM (ct.next_due_at - NOW())) / 86400
     ) AS days_from_next_due
   FROM plants p
   JOIN care_tasks ct ON ct.plant_id = p.id
     AND ct.task_type = 'watering'
     AND ct.active_status = true
   ORDER BY p.display_name
   LIMIT 10;
   ```
3. Compare `days_from_next_due` values against precheck SCHED-02 baseline

Expected: values differ by ≤ 1 day (accounting for time elapsed during migration execution)

FAIL condition: Any plant's countdown has changed by more than 1 day from precheck baseline. The migration altered `next_due_at` or `frequency_days` for existing plants.

FAIL condition: Any plant that had a positive countdown before migration now shows 0 or negative. The migration reset or zeroed scheduling data.

---

**Test RTV-05 — No new DB triggers on scheduler tables (post-migration):**

```sql
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('care_tasks', 'plants', 'plant_aliases', 'canonical_species');
-- Expected: 0 rows
-- FAIL if any trigger exists that was not present in precheck PC-TRG-01
```

---

### Onboarding Validation

**Test RTV-06 — plant_care_profiles ilike still works (post-§B7):**

```sql
SELECT species_name, watering_frequency_days, light_requirement
FROM plant_care_profiles
WHERE species_name ILIKE '%monstera%'
ORDER BY species_name
LIMIT 5;
```
- Expected: same rows as precheck ONBOARD-02 baseline
- FAIL if 0 rows returned (profiles for common species lost in §B7)
- FAIL if `watering_frequency_days` differs from precheck baseline (data corrupted in §B7)

**Test RTV-07 — Full plant_care_profiles sample:**

```sql
SELECT species_name, watering_frequency_days
FROM plant_care_profiles
ORDER BY species_name
LIMIT 20;
```
- Compare against precheck PC-DAT-03 sample
- All pre-existing species should appear with unchanged `watering_frequency_days`
- FAIL if any species from the precheck sample is absent

---

### Coexistence Validation

**Test RTV-08 — SELECT * returns correct structure post-migration:**

```sql
SELECT * FROM plants LIMIT 1;
```
- Expected columns: all 7 pre-migration columns + 4 new Phase 2.1 columns = 11 total
- New columns: `canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method`
- All new columns: value = null (not undefined — the column exists, value unset)
- FAIL if any pre-existing column is absent from the result
- Note: this confirms the `SELECT *` forward-compatibility guarantee is maintained

**Test RTV-09 — App renders plant list without crashes (post-migration null handling):**

Steps:
1. Load the PLANTMON plant list screen
2. Confirm all pre-migration plants are visible
3. Confirm no "undefined" or "[object Object]" rendering in any plant card
4. Confirm countdown values match pre-migration expectations

Expected: identical visual output to pre-migration
FAIL condition: Any plant card shows an error state or blank values. The new nullable columns are causing a render error (TypeScript optional chaining is not handling the new `null` return from `SELECT *`).

**Test RTV-10 — Edit an existing plant (post-migration shim validation):**

Steps:
1. Open an existing pre-migration plant's edit screen
2. Change only the display_name to "Postcheck Edit Test"
3. Save

Expected results:
- Edit succeeds with no error
- Display_name updated in plant list
- Verify via Dashboard:
  ```sql
  SELECT display_name, canonical_species_id, species_resolution_method
  FROM plants
  WHERE display_name = 'Postcheck Edit Test';
  ```
  - `canonical_species_id` IS NULL (shim strips it from UPDATE payload)
  - `species_resolution_method` IS NULL (shim strips it from UPDATE payload)
  - No other field changed unexpectedly

FAIL condition: HTTP 400 on edit save. Same structural break as RTV-01.
FAIL condition: `canonical_species_id` non-null after edit. Shim no longer protecting UPDATE path.

---

## GOVERNANCE VERIFICATION

### Required Governance Artifacts to Update

After all postcheck queries and runtime validation tests pass, the following governance artifacts must be updated before the migration lifecycle is considered complete.

| Artifact | Required update | Urgency |
|---|---|---|
| `governance-baseline/MIGRATION_EXECUTION_LEDGER.md` | Add entry for the completed migration: filename, date, executor, pre-check summary, post-check summary, runtime validation results, deviation notes | REQUIRED before any further activation events |
| `governance-baseline/OPERATIONAL_BASELINE_MANIFEST.md` | Update schema baseline section to reflect new tables, columns, and indexes added by migration | REQUIRED within 24 hours |
| `governance-reconciliation/STALE_ASSUMPTION_REGISTRY.md` | Close any stale assumptions that the migration resolved (e.g., "canonical_species table absent" is resolved post-migration) | REQUIRED within 24 hours |
| `governance-reconciliation/ACTIVATION_BOUNDARY_REGISTRY.md` | Update schema readiness indicators for systems whose schema prerequisites are now met | REQUIRED within 24 hours |
| `governance-migration/MIGRATION_PRECHECK_RUNBOOK.md` | Note any precheck query that produced an unexpected-but-non-blocking result, for future reference | OPTIONAL within 48 hours |
| `governance-baseline/COEXISTENCE_STATE_FREEZE.md` | Update coexistence state section to reflect post-migration schema state | REQUIRED within 24 hours |

---

### Required Ledger Updates

The migration ledger entry must include the following fields, completed with actual values:

```
MIGRATION EXECUTION LEDGER ENTRY
==================================
Migration filename:       [e.g., supabase-migration-v2.sql]
Execution date (UTC):     [YYYY-MM-DD HH:MM UTC]
Executed by:              [name]
Phase:                    [e.g., B2.1]

PRE-CHECK SUMMARY:
  Precheck date:          [YYYY-MM-DD HH:MM UTC]
  Abort conditions triggered: [None / list ABORT codes]
  Constraint name (§B7):  [exact CHECK constraint name from PC-CON-02]
  Pre-migration row counts:
    plants:               [N]
    care_tasks:           [N]
    care_logs:            [N]
    health_logs:          [N]
    journal_entries:      [N]
    plant_care_profiles:  [N]

EXECUTION NOTES:
  Started:                [HH:MM UTC]
  Completed:              [HH:MM UTC]
  Errors encountered:     [None / description]
  Deviations from protocol: [None / description and resolution]

POST-CHECK SUMMARY:
  Schema integrity:       PASS / FAIL — [details]
  RLS integrity:          PASS / FAIL — [details]
  FK integrity:           PASS / FAIL — [details]
  Index integrity:        PASS / FAIL — [details]
  Coexistence continuity: PASS / FAIL — [details]
  Scheduler continuity:   PASS / FAIL — [details]
  Onboarding continuity:  PASS / FAIL — [details]
  Post-migration row counts:
    plants:               [N] (vs. pre: [N]) — MATCH ✓ / DECREASE — ROLLBACK
    care_tasks:           [N] (vs. pre: [N]) — MATCH ✓ / DECREASE — ROLLBACK
    care_logs:            [N] (vs. pre: [N]) — MATCH ✓ / DECREASE — ROLLBACK
    health_logs:          [N] (vs. pre: [N]) — MATCH ✓ / DECREASE — ROLLBACK
    journal_entries:      [N] (vs. pre: [N]) — MATCH ✓ / DECREASE — ROLLBACK
    plant_care_profiles:  [N] (vs. pre: [N]) — MATCH ✓ / DECREASE — ROLLBACK

RUNTIME VALIDATION SUMMARY:
  RTV-01 (plant creation, recognized):   PASS / FAIL
  RTV-02 (plant creation, unrecognized): PASS / FAIL
  RTV-03 (watering event):               PASS / FAIL
  RTV-04 (countdown integrity):          PASS / FAIL
  RTV-05 (no new triggers):              PASS / FAIL
  RTV-06 (ilike still works):            PASS / FAIL
  RTV-07 (profiles sample intact):       PASS / FAIL
  RTV-08 (SELECT * structure):           PASS / FAIL
  RTV-09 (plant list renders):           PASS / FAIL
  RTV-10 (edit flow shim):               PASS / FAIL

schema_migrations INSERT executed:    YES / NO (table not yet created)
  If YES: INSERT confirmed in table:  YES / NO

ROLLBACK SCRIPT LOCATION:
  [path to rollback SQL file in governance-migration/]

GOVERNANCE ARTIFACTS UPDATED:
  MIGRATION_EXECUTION_LEDGER.md:      [date]
  OPERATIONAL_BASELINE_MANIFEST.md:   [date]
  STALE_ASSUMPTION_REGISTRY.md:       [date]
  ACTIVATION_BOUNDARY_REGISTRY.md:    [date]
  COEXISTENCE_STATE_FREEZE.md:        [date]

OVERALL STATUS:  COMPLETE ✓ / ROLLBACK EXECUTED / INVESTIGATING
```

---

### Required Freeze Supersession Procedures

Several governance freeze documents capture state at Phase B2.0. After a migration is applied, these freeze documents describe a state that no longer exists. The supersession procedure ensures no future executor treats a stale freeze document as authoritative.

**Documents that must be superseded after `supabase-migration-v2.sql` is applied:**

| Document | Current freeze state | Post-migration supersession action |
|---|---|---|
| `OPERATIONAL_BASELINE_MANIFEST.md` | Documents Phase B1 schema as the baseline | Add a "Post-B2.1 Schema State" section; mark Phase B1 section as superseded |
| `COEXISTENCE_STATE_FREEZE.md` | Documents coexistence mechanisms protecting against absent Phase 2.1 columns | Update coexistence section: columns now exist as null; shim transitions from "protecting against absent columns" to "protecting against premature canonical write" |
| `STALE_ASSUMPTION_REGISTRY.md` | Lists "canonical_species table absent" and related assumptions as active stale assumptions | Close each assumption that the migration resolves; add resolution date and verification method |
| `ACTIVATION_BOUNDARY_REGISTRY.md` | Documents "Schema Readiness: NOT READY" for canonical/alias routing | Update schema readiness rows: columns now exist (schema ready); data readiness remains NOT READY until seeding |
| `SCHEDULER_BASELINE_SNAPSHOT.md` | Captures scheduler behavior pre-migration | Append post-migration verification that scheduler behavior is unchanged; reference postcheck RTV-04 results |

**Supersession format:** Do not delete the original freeze content. Append a `## Post-Migration-v2 Update` section to each document with:
- Update date
- Migration that triggered the supersession
- The specific statements in the original freeze document that are now superseded
- The replacement statement (what is now true)
- Reference to the migration execution ledger entry

---

## MIGRATION SUCCESS CRITERIA

### What Constitutes Successful Execution

A migration is considered successfully executed when ALL of the following are true:

**Schema success criteria:**
- [ ] All new tables defined in the migration SQL exist in the live DB
- [ ] All new columns defined in the migration SQL exist on the correct tables
- [ ] All new columns are nullable with no DEFAULT
- [ ] All pre-existing tables are present and unchanged
- [ ] All pre-existing columns are present with unchanged types and nullability
- [ ] `plant_care_profiles` row count ≥ pre-migration baseline (§B7 preserved all data)

**Data safety criteria:**
- [ ] All user-data row counts (plants, care_tasks, care_logs, health_logs, journal_entries) ≥ pre-migration baseline
- [ ] All Phase 2.1 columns are NULL on all existing rows (no DEFAULT propagation)
- [ ] All new tables are empty (no unauthorized seeding)
- [ ] No care task `frequency_days` value has changed from pre-migration baseline
- [ ] No `next_due_at` value has been altered for any existing task

**RLS, index, and FK criteria:**
- [ ] RLS enabled on all tables including newly created tables
- [ ] All new policies exist with correct definitions
- [ ] All pre-existing policies intact and unchanged
- [ ] All new indexes exist with correct definitions
- [ ] All pre-existing indexes intact
- [ ] All new FK constraints exist with correct targets and cascade behavior
- [ ] No CASCADE FK on user-history tables

**Runtime behavior criteria:**
- [ ] All 10 runtime validation tests (RTV-01 through RTV-10) pass
- [ ] Plant creation succeeds for both recognized and unrecognized species
- [ ] Watering event succeeds
- [ ] Countdown values unchanged from pre-migration baseline
- [ ] Plant list renders correctly with new nullable columns returning null

**Governance criteria:**
- [ ] Postcheck completion record fully populated
- [ ] Governance ledger entry created in MIGRATION_EXECUTION_LEDGER.md
- [ ] OPERATIONAL_BASELINE_MANIFEST.md updated
- [ ] All required freeze supersession procedures completed within 24 hours

---

### What Requires Rollback

Rollback is REQUIRED (non-negotiable, immediate) for any of the following:

| Condition | Category | Rationale |
|---|---|---|
| Any user-data row count is lower than pre-migration baseline | DATA LOSS | Permanent user data has been destroyed; rollback recovers from pg_dump baseline |
| `plant_care_profiles` row count is lower than pre-migration baseline | DATA LOSS | Care profile data destroyed; plants may receive incorrect schedules until restored |
| Any Phase 2.1 column has non-null values on pre-existing rows (PC-POST-COL-02/03/04/05) | COEXISTENCE VIOLATION | Migration DEFAULT silently populated rows; shim will destroy these values on next edit; data integrity permanently compromised |
| Plant creation returns HTTP 400 (RTV-01 or RTV-02) | COEXISTENCE VIOLATION | The migration added a structural change incompatible with the live app; every user's plant creation is now broken |
| PC-POST-CON-04 returns rows (CASCADE FK on user-history table) | FK RISK | A future parent record deletion would silently destroy care history |
| Any pre-existing RLS policy on user-data tables is absent (PC-POST-RLS-01) | SECURITY REGRESSION | User data is now accessible in violation of the original RLS design |

**Rollback procedure:**
1. Execute the rollback SQL authored before migration (per Principle 3 in `MIGRATION_EXECUTION_PROTOCOL.md`)
2. Re-run precheck Block 7 row counts to confirm rollback restored the pre-migration baseline
3. Run RTV-01 to confirm plant creation works post-rollback
4. Record the rollback in the governance ledger with the conditions that triggered it
5. Escalate to Tier 1 (PRD governance) with the specific failure mode and the corrective SQL design that would prevent recurrence
6. Do not attempt to re-apply the migration until the root cause is resolved and the migration SQL is revised

---

### What Requires Partial Rollback Investigation

Partial rollback investigation is required when the migration partially succeeded — some objects were created, others were not — and a full rollback may destroy the successfully-created objects unnecessarily.

**Conditions indicating partial execution (investigate before full rollback):**

| Condition | Investigation steps |
|---|---|
| PC-POST-LED-03 equivalent: canonical_species exists but plant_aliases does not | Run PC-POST-SCHEMA-01 to determine exactly which objects were created; determine if plant_aliases creation failed due to FK definition error or execution interruption; assess whether re-running only the failed statements is safe |
| Some Phase 2.1 columns exist on plants but not all 4 | Determine which statement failed; assess whether adding the missing columns via a targeted `ALTER TABLE` is safe without a full rollback; proceed only with Tier 1 authorization |
| plant_care_profiles was dropped but not recreated | CRITICAL — the reference table is absent; ilike resolution is now broken for ALL plant creation; full rollback of §B7 from pg_dump backup is required immediately |
| New tables created but RLS not enabled | Run `ALTER TABLE canonical_species ENABLE ROW LEVEL SECURITY; ALTER TABLE plant_aliases ENABLE ROW LEVEL SECURITY;` (targeted fix, not a full rollback); record as a deviation in the execution ledger |
| New tables created but policies absent | Author and apply the missing policy CREATE statements; record as a deviation |

**Partial rollback decision tree:**

```
Is any user-data row count lower than baseline?
  YES → FULL ROLLBACK (non-negotiable)
  NO → Continue

Is plant_care_profiles row count lower than baseline?
  YES → FULL ROLLBACK (non-negotiable)
  NO → Continue

Do any Phase 2.1 columns have non-null values on existing rows?
  YES → FULL ROLLBACK (non-negotiable)
  NO → Continue

Does plant creation fail?
  YES → FULL ROLLBACK if column structure is the cause
  NO → Continue

Are some expected objects missing (partial execution)?
  YES → Investigate: can missing objects be added without rollback?
        If missing objects are additive and tables are in clean state → targeted fix
        If missing objects depend on other missing objects → FULL ROLLBACK
  NO → Continue

Do runtime validation tests have isolated failures?
  Isolated RTV failure (e.g., RTV-06 fails, RTV-01 passes) →
    Investigate the specific failure; may be a data issue, not a structural issue
  Multiple RTV failures → FULL ROLLBACK

All checks pass but some governance artifacts not updated?
  → Proceed; governance artifact updates are non-rollback obligations
```

---

## POSTCHECK COMPLETION RECORD TEMPLATE

Complete this record immediately after all postcheck queries and runtime validation tests are run. This record is the evidence that the postcheck was performed and the migration is safe to proceed with.

```
MIGRATION POSTCHECK COMPLETION RECORD
======================================
Migration:              [filename]
Postcheck date:         [YYYY-MM-DD HH:MM UTC]
Executed by:            [name]
DB environment:         [database name]
Time since execution:   [minutes since Step 5 completed]

BLOCK 1 — SCHEMA INTEGRITY
  PC-POST-SCHEMA-01: New tables present      → canonical_species ✓ / ✗  plant_aliases ✓ / ✗
  PC-POST-SCHEMA-02: Phase 2.1 cols on plants → 4 rows ✓ / [count] — all nullable ✓ / ✗
  PC-POST-SCHEMA-03: canonical_id on care_tasks → present ✓ / absent ✗
  PC-POST-SCHEMA-04: canonical_id on care_logs  → present ✓ / absent ✗
  PC-POST-SCHEMA-07: pcp columns post-§B7       → [compare vs. precheck] MATCH ✓ / ✗

BLOCK 2 — COLUMN NULLABILITY
  PC-POST-COL-01: All 7 Phase 2.1 columns    → 7 rows, all nullable ✓ / [issues]
  PC-POST-COL-02: plants canonical isolation  → all 0 ✓ / [non-zero — ROLLBACK REQUIRED]
  PC-POST-COL-03: care_tasks isolation        → 0 ✓ / [non-zero — ROLLBACK REQUIRED]
  PC-POST-COL-04: care_logs isolation         → 0 ✓ / [non-zero — ROLLBACK REQUIRED]
  PC-POST-COL-05: pcp canonical isolation     → 0 ✓ / [non-zero — investigate]

BLOCK 3 — ROW INTEGRITY (CRITICAL)
  plants:           [N] vs pre-migration [N]  → MATCH ✓ / DECREASE — ROLLBACK NOW
  care_tasks:       [N] vs pre-migration [N]  → MATCH ✓ / DECREASE — ROLLBACK NOW
  care_logs:        [N] vs pre-migration [N]  → MATCH ✓ / DECREASE — ROLLBACK NOW
  health_logs:      [N] vs pre-migration [N]  → MATCH ✓ / DECREASE — ROLLBACK NOW
  journal_entries:  [N] vs pre-migration [N]  → MATCH ✓ / DECREASE — ROLLBACK NOW
  plant_care_profiles: [N] vs pre-migration [N] → MATCH ✓ / DECREASE — ROLLBACK NOW
  PC-POST-ROW-04: new tables empty            → canonical=0 ✓  aliases=0 ✓ / [non-zero]
  PC-POST-ROW-06: no new orphan tasks         → match ✓ / [increase — note]

BLOCK 4 — CONSTRAINTS
  PC-POST-CON-01: pre-existing constraints    → all present ✓ / [absent — name]
  PC-POST-CON-02: pcp CHECK constraint        → present post-§B7 ✓ / absent ✗
                  New constraint name:        [name if changed from pre-migration]
  PC-POST-CON-04: no CASCADE on user history  → 0 rows ✓ / [rows — ROLLBACK REQUIRED]

BLOCK 5 — RLS
  PC-POST-RLS-01: pre-existing policies       → all present ✓ / [absent — ROLLBACK]
  PC-POST-RLS-02: all tables RLS enabled      → all true ✓ / [false on — investigate]
  PC-POST-RLS-03: new table policies exist    → canonical_species ✓  plant_aliases ✓ / ✗

BLOCK 6 — INDEXES
  PC-POST-IDX-01: pre-existing indexes        → all present ✓ / [absent — name]
  PC-POST-IDX-02: GIN index                   → true ✓ / false ✗  [N/A if pre-hardening]
  PC-POST-IDX-03: UNIQUE active alias index   → true ✓ / false ✗  [N/A if pre-hardening]

BLOCK 7 — FK INTEGRITY
  PC-POST-FK-01: pre-existing FKs intact      → all present ✓ / [absent — name]
  PC-POST-CON-03: aliases→canonical FK        → present ✓ / absent ✗
                  delete_rule:                [RESTRICT / SET NULL / CASCADE — expected: not CASCADE]

RUNTIME VALIDATION
  RTV-01 plant creation (recognized):         PASS ✓ / FAIL [details]
  RTV-02 plant creation (unrecognized):        PASS ✓ / FAIL [details]
  RTV-03 watering event:                       PASS ✓ / FAIL [details]
  RTV-04 countdown integrity:                  PASS ✓ / FAIL [details]
  RTV-05 no new triggers:                      PASS ✓ / FAIL [details]
  RTV-06 ilike resolution intact:              PASS ✓ / FAIL [details]
  RTV-07 profiles sample intact:               PASS ✓ / FAIL [details]
  RTV-08 SELECT * structure:                   PASS ✓ / FAIL [details]
  RTV-09 plant list renders:                   PASS ✓ / FAIL [details]
  RTV-10 edit flow shim:                       PASS ✓ / FAIL [details]

ROLLBACK TRIGGERED:
  [ ] No rollback triggered
  [ ] Full rollback triggered — reason: _______________
  [ ] Partial investigation triggered — findings: _______________

POSTCHECK RESULT:  PASS — proceed to Step 8 (Governance Ledger Update)
               /   BLOCKED — [list unresolved conditions]
               /   ROLLBACK EXECUTED — [see rollback record]

Reviewer signature: _______________  Date: _______________
```

---

*This document is a read-only migration postcheck runbook. No application files, SQL files, migration files, or schema state were modified in its generation. Every DB query in this document is a read-only SELECT. The runtime validation tests are behavioral and do not modify any production data beyond the creation of test plants (which may be deleted via the app's plant deletion flow after validation is complete). Execute this runbook in full after every migration execution. A partially-executed postcheck is not a valid postcheck — all blocks and all runtime tests must be completed before the postcheck record may be marked PASS.*
