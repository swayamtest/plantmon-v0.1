# PLANTMON — Migration Precheck Runbook

**Classification:** Governance Migration Authority  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + `MIGRATION_EXECUTION_PROTOCOL.md` + `MIGRATION_AUTHORITY_DECLARATION.md` + `RUNTIME_COMPATIBILITY_CONTRACT.md` + `ACTIVATION_BOUNDARY_REGISTRY.md`  

This runbook is the authoritative pre-migration validation procedure for every PLANTMON schema migration. Every query in this document is a READ-ONLY `SELECT` — this document does not and cannot modify any schema state. Its purpose is to confirm the live DB is in the exact expected pre-migration state before any migration SQL is executed.

**How to use this runbook:**

1. Execute every query in the applicable section(s) against the live Supabase DB via the Supabase Dashboard SQL Editor
2. Compare each result to its documented expected value
3. Record the actual result alongside the expected result in the migration's execution log
4. Any result that does not match its expected value is a **STOP condition** — do not proceed to migration execution until the discrepancy is investigated and resolved
5. All queries must pass before the migration governance lifecycle may advance to Step 5 (Staged Execution) per `MIGRATION_EXECUTION_PROTOCOL.md`

No code, schema, or migration file was modified in this document's generation.

---

## MANDATORY PRECHECK CATEGORIES

### Category 1 — Schema Existence

**Purpose:** Confirm which tables, columns, and schema objects exist or do not exist in the live DB before the migration runs. A migration that creates a table that already exists (without `IF NOT EXISTS`) will fail. A migration that adds a column to a table that doesn't exist will fail. A migration that references a column that has already been added by a partial prior execution will produce a duplicate or silent no-op.

**What is checked:**
- Which tables are present in the `public` schema
- Which columns are present on tables that the migration will modify
- Whether any object the migration creates already exists
- Whether any object the migration references (FK targets, parent tables for new columns) already exists

**Abort condition:** Any table that the migration creates (via `CREATE TABLE`) already exists AND was not created by an earlier migration in the current sequence. This indicates either a partial prior execution or an unauthorized schema change.

**Abort condition:** Any table that the migration references (via `ADD COLUMN`, `CREATE INDEX`, `FK REFERENCES`) does not yet exist. This indicates a migration ordering violation — a prerequisite migration has not been applied.

---

### Category 2 — Constraint Validation

**Purpose:** Confirm the names and definitions of all CHECK, UNIQUE, FK, and NOT NULL constraints on tables the migration will touch. Constraint names are globally unique in PostgreSQL — a migration that tries to create a constraint with a name that already exists will fail. A migration that drops a constraint by name will fail if the name is wrong.

**Critical case for PLANTMON:** `supabase-migration-v2.sql §B7` drops and recreates `plant_care_profiles`. The DROP must reference the exact CHECK constraint name as it exists in the live DB. If PostgreSQL auto-generated the constraint name (as it does for unnamed constraints), the actual name may differ from what the migration SQL assumes.

**What is checked:**
- All constraint names on `plant_care_profiles` (for §B7 DROP-and-recreate)
- All FK constraint names on tables receiving new FK columns
- All UNIQUE constraint names on tables where the migration adds UNIQUE indexes
- All NOT NULL constraints — confirm no column will have NOT NULL enforced where NULLs already exist

**Abort condition:** Any constraint name in the migration SQL (`DROP CONSTRAINT`) does not match the actual constraint name in the live DB.

**Abort condition:** The migration adds a NOT NULL column to a table with existing rows and no DEFAULT — PostgreSQL will reject the `ALTER TABLE` with a constraint violation.

---

### Category 3 — RLS Validation

**Purpose:** Confirm the names and definitions of all Row Level Security policies on tables the migration will create or modify. RLS policy names must be unique per table. A migration that creates a policy with a name that already exists on that table will fail.

**What is checked:**
- All existing policy names on `plants`, `care_tasks`, `care_logs`, `plant_care_profiles`
- Whether RLS is enabled on these tables
- Policy names defined in the migration SQL vs. existing policy names

**Abort condition:** Any policy name in the migration SQL (`CREATE POLICY`) already exists on the target table.

**Abort condition:** RLS is disabled on a table where the migration creates policies (indicates the table is in an unexpected security state).

---

### Category 4 — Index Validation

**Purpose:** Confirm that no index named in the migration SQL already exists. Index names are globally unique in PostgreSQL per schema. A duplicate index name fails the migration. Additionally, confirm that `CREATE UNIQUE INDEX` operations will not fail due to duplicate data in the indexed column.

**What is checked:**
- All existing index names in the `public` schema
- Index names defined in the migration SQL vs. existing index names
- For UNIQUE indexes: whether the indexed column has duplicate values that would prevent creation

**Abort condition:** Any index name in the migration SQL already exists in the `public` schema.

**Abort condition:** A UNIQUE index is being created on a column that has existing duplicate values.

---

### Category 5 — FK Validation

**Purpose:** Confirm that all FK targets referenced in the migration SQL exist in the live DB before the migration runs. PostgreSQL enforces FK target existence at constraint creation time — if the referenced table or column does not exist, the FK creation fails.

**What is checked:**
- All tables and columns referenced as FK targets in the migration SQL
- Whether those tables are present in the live DB
- Whether those tables have the correct PK/UNIQUE constraint that the FK references

**Critical ordering check for PLANTMON:** `PRE_DATASET_HARDENING_MIGRATION_v1.sql` creates indexes on `plant_aliases`. This migration requires `plant_aliases` to already exist (created by `supabase-migration-v2.sql`). If the FK check confirms `plant_aliases` does not exist, the hardening migration must not proceed.

**Abort condition:** Any FK target table referenced in the migration SQL does not exist in the live DB.

**Abort condition:** Any FK target column referenced in the migration SQL does not exist, or does not have a UNIQUE or PK constraint that the FK can reference.

---

### Category 6 — Coexistence Validation

**Purpose:** Confirm that the live DB's schema state is consistent with the coexistence mechanisms currently protecting the runtime. Specifically: confirm that no Phase 2.1 columns have been partially added by an unauthorized schema change, confirm that no canonical tables exist that the application does not expect, and confirm that the coexistence shim's assumptions about what columns exist are still correct.

**What is checked:**
- Phase 2.1 columns (`canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method`) are absent from `plants` (pre-migration)
- Canonical tables (`canonical_species`, `plant_aliases`, `collapse_mappings`) are absent (pre-migration)
- The Phase B1 column set on `plants` is exactly the 7 expected columns
- No unauthorized column has been added that would break the shim's `...v01Fields` spread

**Abort condition:** Any Phase 2.1 column already exists on `plants` without a corresponding governance ledger entry confirming that migration was applied. This indicates an unauthorized schema change that bypassed the governance lifecycle.

**Abort condition:** Any canonical table already exists without a corresponding governance ledger entry. Same implication.

**Abort condition:** The `plants` table has any column not in `{id, user_id, display_name, species_name, room_location, notes, created_at}` that was not created by an authorized prior migration.

---

### Category 7 — Scheduler Safety

**Purpose:** Confirm that the migration will not introduce any schema object that alters care scheduling behavior — either by creating triggers that modify `care_tasks`, by adding defaults that compute `next_due_at`, or by modifying `plant_care_profiles` data in a way that changes future ilike resolution outcomes.

**What is checked:**
- No triggers exist on `care_tasks` that would fire during or after migration (baseline confirmation)
- `care_tasks.frequency_days` has no DEFAULT that would auto-populate new tasks
- `plant_care_profiles` row count (pre-migration) — any decrease after migration is a scheduler safety violation
- `getDaysUntilWatering` is confirmed to NOT read `next_due_at` (pre-migration baseline — documents the known debt)

**Abort condition (Class 5 scheduler-affecting migrations only):** `getDaysUntilWatering` has not been fixed to read `next_due_at` directly. No Class 5 migration may proceed until this fix is deployed.

**Abort condition:** Any trigger already exists on `care_tasks` that was not created by an authorized prior migration (indicates unauthorized schema modification).

---

### Category 8 — Onboarding Continuity

**Purpose:** Confirm that the pre-migration state of `plant_care_profiles` is healthy, that plant creation is currently working correctly, and establish the baseline row count that post-migration checks will compare against.

**What is checked:**
- `plant_care_profiles` row count (becomes the baseline for post-migration check M6)
- `plant_care_profiles` has no `user_id` column (confirming no user-authored rows that could be lost in §B7)
- The 7-column INSERT path for `plants` is structurally intact
- No NOT NULL constraint on `plants` that the shim's 5-field payload would violate

**Abort condition:** `plant_care_profiles` has fewer rows than expected based on the governance baseline (indicates a prior unauthorized DELETE or data loss event).

**Abort condition:** `plant_care_profiles` has a `user_id` column containing non-null values. This would mean user-authored care profiles exist and would be destroyed by §B7's DROP-and-recreate.

---

## REQUIRED PRECHECK QUERIES

All queries below are read-only SELECT statements. Execute them in the Supabase Dashboard SQL Editor. Record actual results alongside expected results.

---

### Block 1 — Environment and Version

```sql
-- PC-ENV-01: PostgreSQL version
SELECT version();
-- Expected: PostgreSQL 15.x or later
-- Record: exact version string

-- PC-ENV-02: Current database name and user
SELECT current_database(), current_user, session_user;
-- Record: confirm you are connected to the correct database, not a test/staging DB
-- STOP if database name indicates a different environment than intended
```

---

### Block 2 — Existing Tables

```sql
-- PC-TBL-01: All tables in public schema
SELECT tablename, tableowner, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected (pre-supabase-migration-v2.sql):
--   care_logs         | rowsecurity = true
--   care_tasks        | rowsecurity = true
--   health_logs       | rowsecurity = true
--   journal_entries   | rowsecurity = true
--   plant_care_profiles | rowsecurity = (check current value)
--   plants            | rowsecurity = true
-- STOP if any of the following are present (they should not exist pre-migration):
--   canonical_species
--   plant_aliases
--   collapse_mappings
--   schema_migrations

-- PC-TBL-02: Confirm canonical tables are absent (targeted check)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('canonical_species', 'plant_aliases', 'collapse_mappings');
-- Expected: 0 rows returned
-- STOP if any rows returned (unauthorized schema change detected)

-- PC-TBL-03: Confirm schema_migrations table is absent
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'schema_migrations'
) AS ledger_table_exists;
-- Expected: false
-- Note: if true, a prior migration created this table — confirm in governance ledger
```

---

### Block 3 — Existing Columns

```sql
-- PC-COL-01: Full column inventory on plants table
SELECT column_name, data_type, is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'plants'
ORDER BY ordinal_position;
-- Expected (exactly 7 columns):
--   id              | uuid or text    | not null
--   user_id         | text or uuid    | not null
--   display_name    | text            | not null
--   species_name    | text            | YES (nullable)
--   room_location   | text            | YES (nullable)
--   notes           | text            | YES (nullable)
--   created_at      | timestamptz     | YES or not null
-- STOP if any Phase 2.1 columns are present without governance ledger authorization:
--   canonical_species_id, user_entered_name, canonical_species_name,
--   species_resolution_method
-- STOP if any unexpected column is present that is not in the above 7

-- PC-COL-02: Confirm Phase 2.1 columns are absent from plants
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
  AND column_name IN (
    'canonical_species_id',
    'user_entered_name',
    'canonical_species_name',
    'species_resolution_method'
  );
-- Expected: 0 rows returned
-- STOP if any rows returned

-- PC-COL-03: Confirm canonical_species_id is absent from care_tasks
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'care_tasks'
    AND column_name = 'canonical_species_id'
) AS col_exists;
-- Expected: false

-- PC-COL-04: Confirm canonical_species_id is absent from care_logs
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'care_logs'
    AND column_name = 'canonical_species_id'
) AS col_exists;
-- Expected: false

-- PC-COL-05: Full column inventory on care_tasks
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'care_tasks'
ORDER BY ordinal_position;
-- Record all columns. STOP if any unexpected column is present.

-- PC-COL-06: Full column inventory on care_logs
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'care_logs'
ORDER BY ordinal_position;
-- Record all columns.

-- PC-COL-07: Full column inventory on plant_care_profiles
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'plant_care_profiles'
ORDER BY ordinal_position;
-- Record all columns and their types.
-- STOP if 'user_id' column is present (indicates user-authored rows at risk in §B7)

-- PC-COL-08: Confirm plant_care_profiles has no user_id column
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'plant_care_profiles'
    AND column_name = 'user_id'
) AS user_id_exists;
-- Expected: false
-- STOP if true — §B7 DROP-and-recreate would destroy user-authored care profiles

-- PC-COL-09: Confirm canonical_species_id is absent from plant_care_profiles
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'plant_care_profiles'
    AND column_name = 'canonical_species_id'
) AS col_exists;
-- Expected: false (this column is ADDED by supabase-migration-v2.sql)
```

---

### Block 4 — Existing Constraints

```sql
-- PC-CON-01: All constraints in public schema
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pgc.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
-- Record the full output. This is the constraint baseline.

-- PC-CON-02: CHECK constraints on plant_care_profiles (critical for §B7)
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'plant_care_profiles'::regclass
  AND contype = 'c'
ORDER BY conname;
-- CRITICAL: Record the EXACT constraint name(s) returned.
-- The migration SQL's DROP CONSTRAINT statement must use the exact name returned here.
-- If the name contains 'light_requirement': confirm migration SQL uses this exact name.
-- If the migration SQL uses a different name: STOP — migration must be revised before execution.
-- Expected: at least one constraint related to light_requirement values

-- PC-CON-03: UNIQUE constraints on tables receiving new UNIQUE indexes
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
ORDER BY tc.table_name, tc.constraint_name;
-- Record. Confirm no existing UNIQUE/PK conflicts with indexes the migration will create.

-- PC-CON-04: NOT NULL constraints — confirm plants required columns
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
  AND is_nullable = 'NO';
-- Record. Confirm all NOT NULL columns have values in all existing rows.
-- (If display_name is NOT NULL, every existing plant must have a display_name — expected.)

-- PC-CON-05: FK constraints — all foreign keys in public schema
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
ORDER BY tc.table_name;
-- Record all FKs. This is the FK baseline.
-- Any FK with DELETE CASCADE should be reviewed for historical care continuity implications.
```

---

### Block 5 — Existing RLS Policies

```sql
-- PC-RLS-01: All RLS policies in public schema
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Record the full output. This is the RLS policy baseline.
-- Compare policy names against those defined in supabase-migration-v2.sql.
-- STOP if any policy name in the migration SQL already exists on the same table.

-- PC-RLS-02: RLS policy names on user-data tables (targeted check)
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('plants', 'care_tasks', 'care_logs', 'plant_care_profiles')
ORDER BY tablename, policyname;
-- Record. Confirm no naming conflict with policies defined in migration SQL.

-- PC-RLS-03: Confirm RLS is enabled on user-data tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('plants', 'care_tasks', 'care_logs', 'plant_care_profiles',
                    'health_logs', 'journal_entries');
-- Expected: rowsecurity = true for all tables listed
-- STOP if rowsecurity = false for any user-data table (unexpected security state)
```

---

### Block 6 — Existing Indexes

```sql
-- PC-IDX-01: All indexes in public schema
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
-- Record the full output. This is the index baseline.
-- Compare index names against those defined in supabase-migration-v2.sql
-- and PRE_DATASET_HARDENING_MIGRATION_v1.sql.
-- STOP if any index name in the migration SQL already exists.

-- PC-IDX-02: Targeted check for indexes the hardening migration will create
-- (Run this before PRE_DATASET_HARDENING_MIGRATION_v1.sql only)
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'idx_plant_aliases_alias_name_gin'
) AS gin_index_exists;
-- Expected: false (pre-hardening migration)

SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'idx_plant_aliases_unique_active'
) AS unique_index_exists;
-- Expected: false (pre-hardening migration)
-- Note: replace index names above with the exact names from PRE_DATASET_HARDENING_MIGRATION_v1.sql

-- PC-IDX-03: Confirm plant_aliases table exists before hardening migration
-- (Run this before PRE_DATASET_HARDENING_MIGRATION_v1.sql only)
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'plant_aliases'
) AS plant_aliases_exists;
-- Expected: true
-- STOP if false — supabase-migration-v2.sql must be applied first
```

---

### Block 7 — Row Counts and Data Baseline

```sql
-- PC-DAT-01: Row counts for all user-data tables (baseline for post-migration comparison)
SELECT
  (SELECT COUNT(*) FROM plants)          AS plants_count,
  (SELECT COUNT(*) FROM care_tasks)      AS care_tasks_count,
  (SELECT COUNT(*) FROM care_logs)       AS care_logs_count,
  (SELECT COUNT(*) FROM health_logs)     AS health_logs_count,
  (SELECT COUNT(*) FROM journal_entries) AS journal_entries_count;
-- Record ALL values. These are the immutable baseline counts.
-- Any post-migration decrease in any count is an immediate STOP + ROLLBACK condition.

-- PC-DAT-02: plant_care_profiles row count (baseline for §B7 validation)
SELECT COUNT(*) AS care_profile_count FROM plant_care_profiles;
-- Record this value. Post-migration check M6 must return >= this value.
-- STOP if this value is lower than the governance baseline documents expect.

-- PC-DAT-03: plant_care_profiles sample (confirms data is present and intact)
SELECT id, species_name, watering_frequency_days, light_requirement
FROM plant_care_profiles
ORDER BY species_name
LIMIT 10;
-- Record sample rows. Confirm the data looks correct (not empty, not corrupted).
-- After §B7, this data must be preserved in the recreated table.

-- PC-DAT-04: Canonical nullability confirmation (all canonical fields must be NULL)
SELECT
  COUNT(*)                                    AS total_plants,
  COUNT(CASE WHEN canonical_species_id IS NOT NULL
             THEN 1 END)                      AS canonical_id_populated,
  COUNT(CASE WHEN species_resolution_method IS NOT NULL
             THEN 1 END)                      AS resolution_method_populated
FROM plants;
-- Note: this query will FAIL pre-migration because these columns don't exist yet.
-- That failure is the EXPECTED result pre-migration — it confirms the columns are absent.
-- If this query SUCCEEDS (returns rows), it means the columns already exist:
--   → the migration has already been partially applied (or unauthorized change occurred)
--   → STOP and investigate

-- PC-DAT-05: care_tasks canonical nullability (same pattern)
SELECT COUNT(*) FROM care_tasks WHERE canonical_species_id IS NOT NULL;
-- Expected: column does not exist → query fails (expected pre-migration)
-- If query succeeds: columns already exist — investigate

-- PC-DAT-06: Confirm all existing plants have required non-null fields
SELECT COUNT(*) AS plants_missing_display_name
FROM plants
WHERE display_name IS NULL OR display_name = '';
-- Expected: 0 (every plant must have a display_name)
-- Any non-zero count indicates a data integrity issue predating this migration

-- PC-DAT-07: Confirm all care tasks have frequency_days
SELECT
  COUNT(*) AS total_tasks,
  COUNT(frequency_days) AS tasks_with_frequency,
  COUNT(*) - COUNT(frequency_days) AS tasks_missing_frequency
FROM care_tasks
WHERE task_type = 'watering' AND active_status = true;
-- Expected: tasks_missing_frequency = 0
-- Any orphan tasks (missing frequency_days) will remain orphans post-migration.
-- Record the orphan count. This is not a STOP condition but a data quality note.
```

---

### Block 8 — Duplicate Risk Detection

```sql
-- PC-DUP-01: Check for duplicate species names in plant_care_profiles
-- (UNIQUE index risk: if migration adds UNIQUE on species_name, duplicates cause failure)
SELECT species_name, COUNT(*) AS occurrence_count
FROM plant_care_profiles
GROUP BY species_name
HAVING COUNT(*) > 1
ORDER BY occurrence_count DESC;
-- Expected: 0 rows (no duplicate species names)
-- If any rows returned: a UNIQUE constraint on species_name would fail — check migration SQL

-- PC-DUP-02: Check for duplicate alias names in plant_aliases
-- (Only relevant after supabase-migration-v2.sql is applied; run before hardening migration)
-- Skipped pre-supabase-migration-v2.sql (table does not exist)

-- PC-DUP-03: Check for plants with duplicate care tasks of the same type
SELECT plant_id, task_type, COUNT(*) AS task_count
FROM care_tasks
WHERE active_status = true
GROUP BY plant_id, task_type
HAVING COUNT(*) > 1;
-- Expected: 0 rows (each plant should have at most one active task per type)
-- Any rows indicate duplicate task guard bypass — record but not a migration STOP condition

-- PC-DUP-04: Check for plants with no active watering task
SELECT p.id, p.display_name, p.species_name
FROM plants p
LEFT JOIN care_tasks ct ON ct.plant_id = p.id
  AND ct.task_type = 'watering'
  AND ct.active_status = true
WHERE ct.id IS NULL;
-- Record orphaned plants. These plants will show "Water today" indefinitely post-migration.
-- Not a STOP condition but a data quality record.
-- Count: orphaned plant count to be tracked in execution log.

-- PC-DUP-05: Check for care logs without a corresponding plant
SELECT cl.id, cl.plant_id
FROM care_logs cl
LEFT JOIN plants p ON p.id = cl.plant_id
WHERE p.id IS NULL;
-- Expected: 0 rows
-- Orphaned care logs indicate prior data integrity issues.
-- Not a STOP condition for this migration, but record count.
```

---

### Block 9 — Trigger and Function Inventory

```sql
-- PC-TRG-01: All triggers in public schema
SELECT
  trigger_name,
  event_object_table AS table_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
-- Expected: 0 rows (PLANTMON has no DB triggers)
-- STOP if any triggers exist on user-data tables that were not created by an
-- authorized prior migration. Triggers on user-data tables can intercept
-- post-migration INSERTs and UPDATEs in unexpected ways.

-- PC-TRG-02: All functions in public schema
SELECT routine_name, routine_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;
-- Record. STOP if any function exists that was not created by an authorized
-- prior migration. Functions can be invoked by triggers.
```

---

### Block 10 — Migration Ledger State

```sql
-- PC-LED-01: Check if schema_migrations table exists
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'schema_migrations'
) AS ledger_exists;
-- Expected pre-first-migration: false
-- If true: query the ledger to confirm what has been applied:

-- PC-LED-02: Current ledger contents (run only if PC-LED-01 returns true)
SELECT filename, applied_at, applied_by, phase, notes
FROM schema_migrations
ORDER BY applied_at;
-- Record. Confirm all listed migrations are reflected in the current schema.
-- Any migration listed here should have its objects present in the live DB.

-- PC-LED-03: Confirm no partial migration state
-- (Symptom of partial execution: some but not all objects from a migration exist)
-- For supabase-migration-v2.sql: if canonical_species exists but plant_aliases does not
-- → partial execution of supabase-migration-v2.sql has occurred → STOP
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'canonical_species')  AS cs_exists,
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'plant_aliases')       AS pa_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plants' AND column_name = 'canonical_species_id'
  ) AS plants_col_exists;
-- Expected (pre-migration): all three = false
-- Expected (post-migration): all three = true
-- STOP if values are mixed (e.g., cs_exists=true AND pa_exists=false):
-- → partial execution detected; rollback and re-execute in full
```

---

## MIGRATION ORDERING VALIDATION

### Ordering Validation Procedure

Migration ordering in PLANTMON is a strict linear sequence. No migration may be applied out of order. The ordering is enforced by FK dependencies (you cannot create a FK to a table that doesn't exist) and index dependencies (you cannot create an index on a column that doesn't exist).

**Authorized migration sequence:**

```
Position 1: supabase-setup.sql
  ← APPLIED (live DB baseline at Phase B2.0)

Position 2: supabase-migration-v2.sql
  ← PENDING (must be applied before Position 3)
  ← Creates: canonical_species, plant_aliases, Phase 2.1 columns
  ← Prerequisite for: Position 3

Position 3: PRE_DATASET_HARDENING_MIGRATION_v1.sql
  ← PENDING (must not be applied before Position 2)
  ← Creates: GIN and UNIQUE indexes on plant_aliases.alias_name
  ← Requires: plant_aliases table to exist (created by Position 2)

Position 4: collapse_mappings CREATE TABLE migration
  ← NOT YET AUTHORED
  ← Prerequisite: Position 2 applied; collapse_mappings SQL authored

Position 5+: Future migrations (not yet authorized)
```

**Ordering validation query sequence:**

```sql
-- ORDER-01: Determine current position in the migration sequence
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'canonical_species') AS pos2_applied,
  EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_plant_aliases_alias_name_gin'
  ) AS pos3_applied;
-- Expected pre-pos2: both false → apply supabase-migration-v2.sql next
-- Expected post-pos2, pre-pos3: pos2_applied=true, pos3_applied=false → apply hardening next
-- Expected post-pos3: both true → sequence complete for authorized migrations
-- STOP if pos2_applied=false AND pos3_applied=true → impossible ordering; investigate

-- ORDER-02: Confirm Position 2 creates its FK target before FK is defined
-- (FK in plant_aliases references canonical_species — both created by same migration)
-- No separate query needed: if canonical_species and plant_aliases both exist (post-pos2),
-- the FK was created successfully. If plant_aliases exists but canonical_species does not:
-- partial execution occurred → STOP
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'canonical_species')  AS canonical_species_exists,
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'plant_aliases')       AS plant_aliases_exists;
-- Expected: both same value (both false pre-migration, both true post-migration)
-- Mixed result = partial execution

-- ORDER-03: Confirm no future-phase objects exist prematurely
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('collapse_mappings')
ORDER BY tablename;
-- Expected: 0 rows (collapse_mappings is not yet authorized for creation)
-- If present: unauthorized schema change; STOP
```

---

### Dependency Verification

**Dependency graph for authorized PLANTMON migrations:**

| Migration | Depends on | Creates | Depended on by |
|---|---|---|---|
| `supabase-setup.sql` | (none) | plants, care_tasks, care_logs, plant_care_profiles, health_logs, journal_entries | supabase-migration-v2.sql |
| `supabase-migration-v2.sql` | supabase-setup.sql applied | canonical_species, plant_aliases, Phase 2.1 columns | PRE_DATASET_HARDENING_MIGRATION_v1.sql |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | supabase-migration-v2.sql applied AND plant_aliases exists | GIN index, UNIQUE index on plant_aliases | Phase B2.1 dataset seeding |
| collapse_mappings migration (future) | supabase-migration-v2.sql applied | collapse_mappings table | Phase B2.3B activation |

**Dependency verification queries:**

```sql
-- DEP-01: Verify supabase-migration-v2.sql dependency for PRE_DATASET_HARDENING
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'plant_aliases')    AS dep_met,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plant_aliases' AND column_name = 'alias_name'
  ) AS dep_column_met;
-- Both must be true before PRE_DATASET_HARDENING_MIGRATION_v1.sql is applied
-- STOP if either is false

-- DEP-02: Verify FK target existence for plant_aliases → canonical_species FK
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'canonical_species') AS fk_target_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canonical_species' AND column_name = 'id'
  ) AS fk_target_col_exists;
-- Both must be true before any table with FK → canonical_species(id) is created
-- For supabase-migration-v2.sql: both tables are created in the same migration,
-- so this validates post-migration state, not pre-migration

-- DEP-03: Verify Phase B2.1 dataset seeding dependency
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'canonical_species')  AS seeding_target_1,
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'plant_aliases')       AS seeding_target_2,
  EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_plant_aliases_alias_name_gin'
  ) AS gin_index_ready;
-- All three must be true before dataset seeding begins
-- Seeding canonical_species without the GIN index will work but will be slow;
-- dataset seeding should wait for the hardening migration to complete
```

---

### Coexistence Dependency Checks

The coexistence mechanisms must remain intact through every migration. These checks confirm that the coexistence dependencies are satisfied:

```sql
-- COX-01: Confirm Phase 2.1 shim dependencies (columns must be ABSENT)
-- The shim strips these 4 columns. If they exist post-shim, they are stripped (writes safe).
-- If they exist without shim, all writes include them → confirmed absent pre-migration.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
  AND column_name IN (
    'canonical_species_id', 'user_entered_name',
    'canonical_species_name', 'species_resolution_method'
  );
-- Expected: 0 rows
-- STOP if any rows — shim is protecting absent columns; if columns exist, shim becomes
-- a no-op protection for present (but unactivated) columns. Investigate before proceeding.

-- COX-02: Confirm SELECT * coexistence safety (no unexpected columns)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
ORDER BY ordinal_position;
-- Expected: exactly 7 columns matching {id, user_id, display_name, species_name,
--   room_location, notes, created_at}
-- Any additional column not in this list requires explanation

-- COX-03: Confirm no existing data violates canonical isolation guarantee
-- (Canonical isolation: no non-null canonical_species_id in any row)
-- Pre-migration: the columns don't exist → this query documents their absence
-- Post-migration: the columns exist → this query validates they are null-populated only
-- Run this as a post-migration coexistence check (after Step 5 in the lifecycle)
-- Included here so it is ready to execute immediately after migration completes:
-- SELECT COUNT(*) FROM plants WHERE canonical_species_id IS NOT NULL;
-- Expected post-migration (before Phase 2.2A): 0
```

---

## RUNTIME VALIDATION REQUIREMENTS

### Pre-Migration Runtime Baselines

Before the migration is applied, the following runtime behaviors must be confirmed as working. These establish the baseline that post-migration validation (Step 7 of the lifecycle) will compare against.

**Pre-migration behavioral baseline confirmation:**

| Behavior | Test | Expected result |
|---|---|---|
| Plant creation — recognized species | Create plant with species "Monstera deliciosa" | Succeeds; `frequency_days` matches ilike lookup; no HTTP 400 |
| Plant creation — unrecognized species | Create plant with species "Fictionus plantus" | Succeeds; `frequency_days = 7` (fallback); no error banner |
| Watering event | Water any existing plant | `last_completed_at` updated; `next_due_at` updated; care log inserted |
| Plant list load | Load plant list screen | All plants visible; countdowns displayed; no "undefined" values |
| Plant edit | Edit existing plant display_name | Succeeds; care tasks unaffected |

**These tests must be confirmed PASSING before migration execution begins.** If any pre-migration test fails, the runtime is already broken. Do not apply the migration on top of a broken runtime — investigate and resolve the existing failure first.

---

### Scheduler Continuity Checks

```sql
-- SCHED-01: Confirm care_tasks.next_due_at is populated for active watering tasks
SELECT
  COUNT(*) AS total_active_watering_tasks,
  COUNT(next_due_at) AS tasks_with_next_due,
  COUNT(last_completed_at) AS tasks_with_last_completed,
  COUNT(frequency_days) AS tasks_with_frequency
FROM care_tasks
WHERE task_type = 'watering' AND active_status = true;
-- Record all four counts.
-- tasks_missing_frequency = total - tasks_with_frequency (document count)
-- Any task missing frequency_days will show "Water today" indefinitely — known orphan state

-- SCHED-02: Sample scheduler state for manual verification
SELECT
  p.display_name,
  p.species_name,
  ct.frequency_days,
  ct.last_completed_at,
  ct.next_due_at,
  CEIL(
    EXTRACT(EPOCH FROM (ct.next_due_at - NOW())) / 86400
  ) AS days_remaining_from_next_due_at,
  CEIL(
    EXTRACT(EPOCH FROM (
      ct.last_completed_at + (ct.frequency_days * INTERVAL '1 day') - NOW()
    )) / 86400
  ) AS days_remaining_from_last_completed
FROM plants p
JOIN care_tasks ct ON ct.plant_id = p.id
  AND ct.task_type = 'watering'
  AND ct.active_status = true
ORDER BY ct.next_due_at
LIMIT 10;
-- Record output.
-- Compare days_remaining_from_next_due_at vs. days_remaining_from_last_completed.
-- These should be equal (both derived from the same frequency and last completed time).
-- If they differ: next_due_at has been written inconsistently — document the divergence.
-- STOP if divergence is large (> 1 day for any plant) — indicates prior scheduler mutation.

-- SCHED-03: Confirm no DB triggers on care_tasks (scheduler must be app-controlled only)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'care_tasks';
-- Expected: 0 rows
-- STOP if any triggers exist (unauthorized scheduler automation)

-- SCHED-04: Confirm no DEFAULT on care_tasks.next_due_at (app must control this value)
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'care_tasks'
  AND column_name = 'next_due_at';
-- Expected: column_default = NULL (no default)
-- STOP if column_default is non-null (a DB-computed default bypasses app scheduler)

-- SCHED-05: getDaysUntilWatering read-source documentation (not a DB query)
-- This is a code-level check, not a DB query.
-- Confirm in the source code that getDaysUntilWatering reads:
--   last_completed_at + frequency_days * 24*60*60*1000 (NOT next_due_at directly)
-- This is the KNOWN DEBT (RAD-001). Document its presence as a pre-migration baseline.
-- After the getDaysUntilWatering fix is deployed, update this note.
-- SCHED-02 above documents both computation paths in SQL for comparison.
```

---

### Onboarding Continuity Checks

```sql
-- ONBOARD-01: Confirm plant_care_profiles has content for common species
SELECT COUNT(*) AS profiles_available FROM plant_care_profiles;
-- Expected: > 0 (the profile table must have data for ilike resolution to succeed)
-- STOP if 0: ilike lookups always return null; all plants receive fallback schedule

-- ONBOARD-02: Confirm ilike lookup would succeed for a common species
SELECT species_name, watering_frequency_days, light_requirement
FROM plant_care_profiles
WHERE species_name ILIKE '%monstera%'
ORDER BY species_name
LIMIT 5;
-- Expected: at least 1 row
-- Record the returned profile(s) — this is what plant creation with "Monstera" should use

-- ONBOARD-03: Confirm the fallback constant is documented
-- This is a code-level check: confirm DEFAULT_WATERING_DAYS = 7 in careProfiles.ts
-- Not a DB query. Document: fallback value = 7 days (pre-migration baseline).

-- ONBOARD-04: Confirm plants table NOT NULL constraints won't block post-migration INSERTs
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
  AND is_nullable = 'NO'
ORDER BY ordinal_position;
-- Record all NOT NULL columns.
-- Confirm the shim's 5-field payload {display_name, species_name, room_location,
-- notes, user_id} satisfies all NOT NULL constraints.
-- Any NOT NULL column not in the shim's payload will cause INSERT failure post-shim-removal.
-- Note: this risk is shim-protected now; it only matters at Phase 2.2A shim removal.

-- ONBOARD-05: Confirm care_tasks creation path is intact
-- The duplicate task guard queries: SELECT WHERE task_type='watering' AND active_status=true
-- Confirm the relevant columns exist and are not null on existing tasks:
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'care_tasks'
  AND column_name IN ('task_type', 'active_status', 'plant_id', 'frequency_days');
-- Expected: all 4 columns present
-- STOP if any absent (indicates corrupted care_tasks schema)
```

---

## MIGRATION ABORT CONDITIONS

### Category A — Immediate Hard Stops (Do Not Proceed)

These conditions require immediate termination of the migration governance lifecycle. The migration must not be executed until the condition is resolved and all pre-checks are re-run from the beginning.

| Abort code | Condition | Required response |
|---|---|---|
| **ABORT-A01** | PC-TBL-02 returns any rows (canonical tables exist pre-migration) | Investigate unauthorized schema change; determine if partial migration occurred; consult governance ledger; do not proceed until resolved |
| **ABORT-A02** | PC-COL-02 returns any rows (Phase 2.1 columns exist on plants pre-migration) | Same as ABORT-A01 |
| **ABORT-A03** | PC-CON-02 returns a constraint name that differs from what migration SQL expects (§B7 DROP CONSTRAINT) | Halt; revise migration SQL to use the actual constraint name returned; re-execute full SQL review (Step 4); re-run all pre-checks |
| **ABORT-A04** | PC-COL-08 returns true (plant_care_profiles has user_id column) | CRITICAL — §B7 would destroy user-authored care profiles; halt migration; escalate to Tier 1; redesign §B7 as ALTER TABLE instead of DROP-and-recreate |
| **ABORT-A05** | PC-RLS-01/02 shows a policy name conflict (migration policy name already exists) | Halt; revise migration SQL policy names; re-execute full SQL review; re-run all pre-checks |
| **ABORT-A06** | PC-IDX-01/02 shows an index name conflict (migration index name already exists) | Halt; revise migration SQL index names; re-execute full SQL review; re-run all pre-checks |
| **ABORT-A07** | PC-IDX-03 returns false (plant_aliases absent before hardening migration) | Halt; apply supabase-migration-v2.sql first; re-run all pre-checks for hardening migration |
| **ABORT-A08** | PC-TRG-01 returns rows on user-data tables (unauthorized triggers exist) | Halt; investigate trigger source; determine whether trigger is safe for migration; obtain Tier 1 authorization to proceed |
| **ABORT-A09** | ORDER-01 shows pos2_applied=false AND pos3_applied=true (impossible ordering) | CRITICAL — investigate; the schema is in an impossible state |
| **ABORT-A10** | PC-LED-03 returns mixed values (partial migration state detected) | CRITICAL — a prior migration was partially executed; determine the rollback procedure for the partial state; do not apply further migrations |
| **ABORT-A11** | PC-DAT-01 row counts are lower than governance baseline expectations | Data loss has already occurred; investigate before applying any migration |
| **ABORT-A12** | PC-RLS-03 returns rowsecurity=false for any user-data table | Unexpected security state; investigate before applying migration that creates new RLS policies |
| **ABORT-A13** | SCHED-02 shows days_remaining divergence > 1 day between the two computation paths | Scheduler has already been mutated by an unknown prior event; document and escalate before migration |
| **ABORT-A14** | SCHED-03 returns any rows (unauthorized triggers on care_tasks) | Same as ABORT-A08 for care_tasks specifically |
| **ABORT-A15** | SCHED-04 returns non-null column_default on care_tasks.next_due_at | Unauthorized DEFAULT on scheduler column; investigate |
| **ABORT-A16** | ONBOARD-01 returns 0 (plant_care_profiles is empty) | Ilike resolution is already broken; all plants are already receiving fallback schedule; investigate before migration |
| **ABORT-A17** | Pre-migration runtime baseline test fails (any of the 5 behavioral checks) | Runtime is already broken; do not apply migration on top of broken runtime |
| **ABORT-A18** | DEP-01 returns dep_met=false (plant_aliases absent before hardening migration) | Same as ABORT-A07 |
| **ABORT-A19** | PC-CON-05 shows a FK with ON DELETE CASCADE referencing a user-data table | Historical care continuity risk; review the cascading FK; confirm it does not affect care_logs, health_logs, or journal_entries |

---

### Category B — Conditions Requiring Rollback Planning Before Proceeding

These conditions do not immediately block migration execution but require a documented rollback plan specific to the condition before Step 5 (Staged Execution) may proceed.

| Abort code | Condition | Required pre-execution action |
|---|---|---|
| **ABORT-B01** | PC-DUP-01 returns rows (duplicate species names in plant_care_profiles) | Document which species have duplicates; confirm migration SQL does not add UNIQUE on species_name; if it does, halt and revise |
| **ABORT-B02** | PC-DAT-04 / PC-DAT-05 SUCCEED rather than fail (Phase 2.1 columns already exist) | Migration may have already been partially applied; verify full scope before proceeding; partial re-application of an additive migration is usually safe with IF NOT EXISTS guards |
| **ABORT-B03** | PC-DUP-03 returns rows (plants with multiple active tasks of same type) | Document orphan task count; plan a separate data cleanup event post-migration; not a block but a known data quality debt |
| **ABORT-B04** | PC-DAT-07 returns tasks_missing_frequency > 0 | Document orphan task count; these plants will continue to show "Water today" post-migration; not a block but must be recorded in execution log |
| **ABORT-B05** | PC-DAT-02 returns a count lower than expected | Investigate: how many profiles were expected? Has a prior unauthorized DELETE occurred? If count differs from governance baseline, obtain Tier 1 explanation before §B7 DROP-and-recreate |

---

### Category C — Conditions Requiring Governance Review Escalation

These conditions indicate a governance process breakdown that must be escalated to Tier 1 (PRD governance) before any further migration activity.

| Abort code | Condition | Escalation reason |
|---|---|---|
| **ABORT-C01** | Any table or column exists that cannot be explained by authorized migrations | Unauthorized schema modification occurred outside the governance lifecycle |
| **ABORT-C02** | PC-LED-02 lists a migration as applied that has no corresponding schema objects | Ledger is incorrect; someone recorded an application without executing it, or the migration was rolled back without updating the ledger |
| **ABORT-C03** | PC-LED-02 lists no migrations as applied but PC-TBL-01 shows objects that should have been created by a migration | Schema objects exist without governance record; audit trail is broken |
| **ABORT-C04** | Tier 1 authorization for the current migration phase cannot be confirmed in governance documents | Governance document may be stale; obtain fresh Tier 1 confirmation before proceeding |
| **ABORT-C05** | The migration SQL file has been modified since governance review was completed | The SQL review (Step 4) must be re-executed against the current file; if the file was modified post-review, the review is invalid |
| **ABORT-C06** | Rollback SQL was not authored before precheck began | Violation of Principle 3 (Rollback-Aware Execution); author rollback SQL before re-running prechecks |

---

### Abort Condition Summary by Severity

```
CRITICAL (ABORT-A04, ABORT-A09, ABORT-A10, ABORT-A11, ABORT-C01):
  → Data loss risk or impossible schema state
  → Escalate to Tier 1 immediately
  → Do not attempt to resolve autonomously
  → Consider whether user notification is required

HIGH (ABORT-A03, ABORT-A17, ABORT-A08, ABORT-A14, ABORT-A16, ABORT-C02, ABORT-C03):
  → Migration cannot proceed without specific remediation action
  → Remediation is well-defined and reversible
  → Proceed after remediation; re-run full prechecks

MEDIUM (ABORT-A01, ABORT-A02, ABORT-A05, ABORT-A06, ABORT-A07, all ABORT-B):
  → Migration blocked by schema state that can be resolved by applying correct migrations
  → or blocked by naming conflicts that can be resolved by SQL revision
  → Resolve the specific condition; re-run pre-checks from the beginning

LOW (ABORT-A12, ABORT-A13, ABORT-A15, ABORT-A19, ABORT-C04, ABORT-C05, ABORT-C06):
  → Governance process deviation
  → Correct the process; re-run prechecks
  → Not a data risk if addressed before execution
```

---

## PRECHECK COMPLETION RECORD TEMPLATE

Before executing the migration, complete this record and store it with the migration execution log:

```
MIGRATION PRECHECK COMPLETION RECORD
=====================================
Migration:            [filename]
Precheck date:        [YYYY-MM-DD HH:MM UTC]
Executed by:          [name]
DB environment:       [database name from PC-ENV-02]

BLOCK 1 — ENVIRONMENT
  PC-ENV-01: PostgreSQL version  →  [actual value]
  PC-ENV-02: Database/user       →  [actual value]

BLOCK 2 — TABLES
  PC-TBL-01: Tables present      →  [list]
  PC-TBL-02: Canonical absent    →  0 rows ✓ / [rows returned — ABORT-A01]
  PC-TBL-03: Ledger absent       →  false ✓ / [true — note]

BLOCK 3 — COLUMNS
  PC-COL-01: plants columns      →  [7 columns confirmed / unexpected columns — ABORT]
  PC-COL-02: Phase 2.1 absent    →  0 rows ✓ / [rows returned — ABORT-A02]
  PC-COL-07: pcp columns         →  [list]
  PC-COL-08: pcp no user_id      →  false ✓ / [true — ABORT-A04 CRITICAL]
  PC-COL-09: pcp no canonical_id →  false ✓ / [true — note]

BLOCK 4 — CONSTRAINTS
  PC-CON-01: All constraints     →  [recorded to snapshot]
  PC-CON-02: pcp CHECK name      →  [EXACT CONSTRAINT NAME RECORDED: ___________]
                                     Migration SQL uses: ___________
                                     Match: YES ✓ / NO — ABORT-A03
  PC-CON-05: FK cascade review   →  [no CASCADE on user-data tables ✓ / ABORT-A19]

BLOCK 5 — RLS
  PC-RLS-01: All policies        →  [recorded to snapshot]
  PC-RLS-02: No name conflicts   →  confirmed ✓ / [conflicts — ABORT-A05]
  PC-RLS-03: RLS enabled         →  all true ✓ / [false on table — ABORT-A12]

BLOCK 6 — INDEXES
  PC-IDX-01: All indexes         →  [recorded to snapshot]
  PC-IDX-02: Target indexes absent → both false ✓ / [exists — ABORT-A06]
  PC-IDX-03: plant_aliases exists → [N/A pre-pos2 / true ✓ / false — ABORT-A07]

BLOCK 7 — ROW COUNTS (IMMUTABLE BASELINE)
  plants:            [N]
  care_tasks:        [N]
  care_logs:         [N]
  health_logs:       [N]
  journal_entries:   [N]
  plant_care_profiles: [N]

BLOCK 8 — DUPLICATE RISK
  PC-DUP-01: No pcp duplicates   →  0 rows ✓ / [rows — ABORT-B01]
  PC-DUP-03: No duplicate tasks  →  0 rows ✓ / [rows — note count]
  PC-DUP-04: Orphaned plants     →  0 ✓ / [count — note]

BLOCK 9 — TRIGGERS
  PC-TRG-01: No triggers         →  0 rows ✓ / [rows — ABORT-A08]

BLOCK 10 — ORDERING
  ORDER-01: Sequence position    →  [pos2=false/pos3=false: ready for pos2 ✓]
  PC-LED-03: No partial state    →  all same ✓ / [mixed — ABORT-A10 CRITICAL]

SCHEDULER SAFETY
  SCHED-01: Task frequency       →  [counts recorded]
  SCHED-02: No divergence        →  confirmed ✓ / [divergence detected — ABORT-A13]
  SCHED-03: No triggers          →  0 rows ✓ / [rows — ABORT-A14]
  SCHED-04: No next_due default  →  null ✓ / [non-null — ABORT-A15]

ONBOARDING CONTINUITY
  ONBOARD-01: pcp has content    →  [N] rows ✓ / 0 rows — ABORT-A16
  ONBOARD-02: ilike works        →  [sample rows confirmed]
  ONBOARD-04: NOT NULL review    →  [columns recorded; shim payload satisfies all]

RUNTIME BASELINE
  Plant creation (recognized):   →  PASS ✓ / FAIL — ABORT-A17
  Plant creation (fallback):     →  PASS ✓ / FAIL — ABORT-A17
  Watering event:                →  PASS ✓ / FAIL — ABORT-A17
  Plant list load:               →  PASS ✓ / FAIL — ABORT-A17
  Plant edit:                    →  PASS ✓ / FAIL — ABORT-A17

ABORT CONDITIONS TRIGGERED:
  [List any ABORT codes triggered and their resolution, or "None"]

PRECHECK RESULT:  PASS — proceed to Step 5 (Staged Execution)
              /   BLOCKED — [list unresolved abort conditions]

Reviewer signature: _______________  Date: _______________
```

---

*This document is a read-only migration precheck runbook. No application files, SQL files, migration files, or schema state were modified in its generation. Every query in this document is a read-only SELECT. Execute this runbook in full before every migration execution. A partially-executed precheck is not a valid precheck — all blocks must be completed before the precheck record may be marked PASS.*
