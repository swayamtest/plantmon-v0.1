-- ============================================================
-- PLANTMON — PRE-DATASET HARDENING MIGRATION v1
-- Phase B2.0 — Runtime Integrity Hardening
--
-- Run: Supabase Dashboard → SQL Editor
--
-- PREREQUISITES — MUST be true before running this migration:
--   1. supabase-migration-v2.sql has been applied and confirmed
--   2. App smoke-tested and functional post Phase 2.1
--   3. No canonical_species, plant_aliases, collapse_mappings data yet
--
-- PURPOSE:
--   Harden the runtime before dataset synchronization begins.
--   Strictly additive. No destructive operations.
--   No runtime behavior changes.
--   No data modifications.
--
-- SAFE: idempotent throughout — re-running causes no harm.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- SECTION A — CARE TASK RUNTIME INTEGRITY
-- Prevents duplicate tasks and optimizes scheduler lookups.
-- ────────────────────────────────────────────────────────────

-- A1. Prevent duplicate active tasks per (plant, task_type)
--
-- Problem: generateDefaultCareTasks() has an app-level guard
-- against duplicate active watering tasks, but there is no DB
-- enforcement. A concurrent insert, admin operation, or bug
-- bypass could create two active watering tasks for one plant,
-- causing the scheduler to fire duplicate reminders silently.
--
-- This index enforces at the DB layer:
--   ONE active task per (plant_id, task_type) combination.
--
-- IMPORTANT: Partial index (WHERE active_status = TRUE) means:
--   - Historical inactive tasks are completely unaffected.
--   - Multiple inactive/completed tasks per type remain allowed.
--   - Only ACTIVE task uniqueness is enforced.
--
-- If a violation already exists: this CREATE UNIQUE INDEX will
-- fail with a duplicate-key error, surfacing the problem safely
-- so it can be resolved before proceeding.

CREATE UNIQUE INDEX IF NOT EXISTS care_tasks_plant_task_active_unique
  ON care_tasks (plant_id, task_type)
  WHERE active_status = TRUE;


-- A2. Composite scheduler lookup index
--
-- Problem: Phase 2.2 schedule recalculation, active-task lookups,
-- and useWaterPlant's "find the watering task to update" query all
-- need (plant_id, task_type, active_status). The existing single-
-- column care_tasks_plant_id_idx supports only plant_id scans.
-- A composite index eliminates the per-row active_status filter.
--
-- This index also benefits:
--   - useWaterPlant: finds active watering task for a plant
--   - generateDefaultCareTasks: checks existing active tasks
--   - future scheduler: recalculates frequency per task_type

CREATE INDEX IF NOT EXISTS care_tasks_plant_task_active_idx
  ON care_tasks (plant_id, task_type, active_status);


-- ────────────────────────────────────────────────────────────
-- SECTION B — ALIAS SEARCH HARDENING
-- Prepares plant_aliases for performant ilike/fuzzy search.
-- plant_aliases table exists post supabase-migration-v2.sql.
-- ────────────────────────────────────────────────────────────

-- B1. Enable pg_trgm extension
--
-- pg_trgm provides GIN/GIST trigram indexes for fast ILIKE and
-- similarity searches. Required for alias autocomplete in Phase 2.2.
-- IF NOT EXISTS ensures this is safe to run on any Supabase project,
-- including those where pg_trgm is already enabled by default.
-- Supabase enables pg_trgm by default on all projects — this is a
-- safety-first guard that produces no harm if already present.

CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- B2. GIN trigram index on plant_aliases.alias_name
--
-- Problem: The btree index (plant_aliases_name_idx) created by
-- supabase-migration-v2.sql supports equality lookups and prefix
-- scans only. It does NOT accelerate:
--   - ilike '%money plant%'  (substring scan)
--   - ilike 'mone%'          (only when using text_pattern_ops)
--   - similarity('money plant', alias_name) > 0.3
--
-- The GIN trigram index accelerates all of these patterns, which are
-- the exact patterns Phase 2.2 alias autocomplete will use.
--
-- Impact: alias search latency drops from sequential scan to index
-- scan for any alias_name search pattern.
--
-- Safe: additive only. Does not affect btree index. Does not affect
-- existing data. Zero impact on INSERT/UPDATE performance overhead
-- beyond normal index maintenance.

CREATE INDEX IF NOT EXISTS plant_aliases_name_trgm_idx
  ON plant_aliases USING GIN (alias_name gin_trgm_ops);


-- ────────────────────────────────────────────────────────────
-- SECTION C — CANONICAL QUERY HARDENING
-- Optimizes per-user canonical identity lookups for Phase 2.2.
-- ────────────────────────────────────────────────────────────

-- C1. Composite per-user canonical species index on plants
--
-- Problem: After Phase 2.2 identity activation, queries like
-- "find all plants owned by user X that have canonical_species_id Y"
-- require a join on both user_id and canonical_species_id. The
-- existing plants_user_id_idx (single column) would require a full
-- user-plant scan with a per-row canonical_species_id filter.
--
-- This composite partial index (WHERE canonical_species_id IS NOT NULL)
-- allows:
--   - Per-user canonical species lookups (scheduler operations)
--   - Backfill verification queries
--   - Species-level analytics per user
--   - Phase 2.2 identity propagation queries
--
-- Partial index: plants with no canonical_species_id (all current
-- plants pre-activation) are excluded, keeping index size minimal
-- until activation. Index grows only as canonical identity is assigned.

CREATE INDEX IF NOT EXISTS plants_user_canonical_idx
  ON plants (user_id, canonical_species_id)
  WHERE canonical_species_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- SECTION D — RLS POLICY HARDENING
-- Corrects INSERT/UPDATE policy semantics on care_tasks
-- and care_logs. Preserves authorization behavior exactly.
-- ────────────────────────────────────────────────────────────

-- D1. care_tasks INSERT — replace USING with WITH CHECK
--
-- Problem: PostgreSQL RLS distinguishes:
--   USING      → applied when reading/filtering existing rows
--   WITH CHECK → applied when validating new/updated row values
-- Using USING on an INSERT policy is technically accepted by
-- PostgreSQL (it copies it to WITH CHECK internally) but is
-- semantically incorrect — it creates misleading policy definitions
-- and can behave unexpectedly with combined USING + WITH CHECK rules
-- on the same table. WITH CHECK is the correct clause for INSERT.
--
-- Authorization behavior is IDENTICAL — same predicate, correct clause.

DROP POLICY IF EXISTS "care_tasks: insert own" ON care_tasks;
CREATE POLICY "care_tasks: insert own"
  ON care_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plants
      WHERE plants.id = care_tasks.plant_id
        AND plants.user_id = auth.uid()
    )
  );


-- D2. care_tasks UPDATE — add WITH CHECK alongside USING
--
-- Problem: The existing UPDATE policy uses USING only. This controls
-- which rows can be updated (the read-side filter) but does not
-- validate that the updated row values still satisfy the ownership
-- condition. A user could theoretically reassign care_tasks.plant_id
-- to a plant they don't own if only USING is present.
--
-- Adding WITH CHECK with the same predicate closes this gap:
--   USING      → filter: which rows this user can target
--   WITH CHECK → validate: the updated row still belongs to this user
--
-- Authorization behavior is IDENTICAL for normal operations.

DROP POLICY IF EXISTS "care_tasks: update own" ON care_tasks;
CREATE POLICY "care_tasks: update own"
  ON care_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM plants
      WHERE plants.id = care_tasks.plant_id
        AND plants.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plants
      WHERE plants.id = care_tasks.plant_id
        AND plants.user_id = auth.uid()
    )
  );


-- D3. care_logs INSERT — replace USING with WITH CHECK
--
-- Same issue as care_tasks INSERT (D1). care_logs is an append-only
-- table (useWaterPlant only INSERTs, never UPDATEs). WITH CHECK is
-- the correct and sole clause needed.

DROP POLICY IF EXISTS "care_logs: insert own" ON care_logs;
CREATE POLICY "care_logs: insert own"
  ON care_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plants
      WHERE plants.id = care_logs.plant_id
        AND plants.user_id = auth.uid()
    )
  );


-- D4. care_logs UPDATE — add WITH CHECK alongside USING
--
-- care_logs is intended as append-only; the UPDATE policy exists for
-- completeness. Applying the same USING + WITH CHECK hardening for
-- consistency and defense in depth.

DROP POLICY IF EXISTS "care_logs: update own" ON care_logs;
CREATE POLICY "care_logs: update own"
  ON care_logs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM plants
      WHERE plants.id = care_logs.plant_id
        AND plants.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plants
      WHERE plants.id = care_logs.plant_id
        AND plants.user_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
-- SECTION E — CONSTRAINT VALIDATION
-- Ensures plant_care_profiles.species_name UNIQUE enforcement.
-- ────────────────────────────────────────────────────────────

-- E1. Verify/add plant_care_profiles.species_name UNIQUE constraint
--
-- The supabase-setup.sql defines species_name as NOT NULL UNIQUE.
-- The live DB should already have this constraint. This block is
-- a safety guard: if it exists, DO NOTHING; if missing, add it.
--
-- This constraint is operationally critical: it is the only protection
-- against duplicate care profile rows for the same species, which
-- would cause non-deterministic ilike lookup results.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
           AND tc.table_schema = ccu.table_schema
    WHERE  tc.constraint_type = 'UNIQUE'
      AND  tc.table_name      = 'plant_care_profiles'
      AND  ccu.column_name    = 'species_name'
  ) THEN
    ALTER TABLE plant_care_profiles
      ADD CONSTRAINT plant_care_profiles_species_name_unique
        UNIQUE (species_name);

    RAISE NOTICE 'ADDED missing UNIQUE constraint on plant_care_profiles.species_name';
  ELSE
    RAISE NOTICE 'OK: plant_care_profiles.species_name UNIQUE constraint already present';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- SECTION F — VALIDATION QUERIES
-- Non-destructive inspection. Safe to run at any time.
-- Review results to confirm migration applied cleanly.
-- ────────────────────────────────────────────────────────────

-- F1. Verify all indexes were created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('care_tasks', 'plants', 'plant_aliases')
  AND indexname IN (
    'care_tasks_plant_task_active_unique',
    'care_tasks_plant_task_active_idx',
    'plants_user_canonical_idx',
    'plant_aliases_name_trgm_idx'
  )
ORDER BY tablename, indexname;
-- Expected: 4 rows (one per index above)


-- F2. Verify pg_trgm extension is active
SELECT
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_trgm';
-- Expected: 1 row (pg_trgm, version varies)


-- F3. Verify care_tasks RLS policies now use WITH CHECK
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual       AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE tablename IN ('care_tasks', 'care_logs')
  AND policyname IN (
    'care_tasks: insert own',
    'care_tasks: update own',
    'care_logs: insert own',
    'care_logs: update own'
  )
ORDER BY tablename, policyname;
-- Expected: 4 rows
-- INSERT rows: with_check_expr should be non-null
-- UPDATE rows: both qual and with_check_expr should be non-null


-- F4. Verify plant_care_profiles species_name uniqueness
SELECT
  tc.constraint_name,
  tc.constraint_type,
  tc.table_name,
  ccu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.table_name = 'plant_care_profiles'
  AND tc.constraint_type = 'UNIQUE'
  AND ccu.column_name = 'species_name';
-- Expected: 1 row confirming UNIQUE on species_name


-- F5. Verify care_tasks partial unique index prevents duplicates
--     (read-only test — does not insert data)
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'care_tasks'
  AND indexname = 'care_tasks_plant_task_active_unique';
-- Expected: 1 row with WHERE clause showing "active_status = true"


-- F6. Verify plant_aliases GIN trgm index definition
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'plant_aliases'
  AND indexname = 'plant_aliases_name_trgm_idx';
-- Expected: 1 row with indexdef containing "gin" and "gin_trgm_ops"


-- ────────────────────────────────────────────────────────────
-- MIGRATION SAFETY SUMMARY
--
-- Operations in this migration:
--   A1. CREATE UNIQUE INDEX IF NOT EXISTS   — additive, partial
--   A2. CREATE INDEX IF NOT EXISTS          — additive, composite
--   B1. CREATE EXTENSION IF NOT EXISTS      — additive, idempotent
--   B2. CREATE INDEX IF NOT EXISTS (GIN)    — additive
--   C1. CREATE INDEX IF NOT EXISTS (partial)— additive
--   D1. DROP POLICY IF EXISTS + CREATE      — replaces semantics only
--   D2. DROP POLICY IF EXISTS + CREATE      — replaces semantics only
--   D3. DROP POLICY IF EXISTS + CREATE      — replaces semantics only
--   D4. DROP POLICY IF EXISTS + CREATE      — replaces semantics only
--   E1. DO $$ (conditional ALTER)           — additive if missing
--   F1-F6. SELECT only                      — read-only validation
--
-- No tables dropped.
-- No columns dropped or renamed.
-- No data modified.
-- No runtime behavior changed.
-- No existing authorization behavior changed.
-- Rollback: drop the 4 indexes + drop/recreate original policies.
-- ────────────────────────────────────────────────────────────
