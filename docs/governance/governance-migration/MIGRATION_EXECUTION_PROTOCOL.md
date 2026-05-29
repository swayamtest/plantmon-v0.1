# PLANTMON — Migration Execution Protocol

**Classification:** Governance Migration Authority  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + full governance baseline corpus + `MIGRATION_AUTHORITY_DECLARATION.md` + `RUNTIME_COMPATIBILITY_CONTRACT.md` + `ACTIVATION_BOUNDARY_REGISTRY.md`  

This document is the authoritative execution protocol for every schema migration applied to the PLANTMON live Supabase database. It governs how migrations are classified, reviewed, approved, executed, validated, and recorded. It does not authorize any specific migration — authorization is a Tier 1 PRD governance event. This protocol governs the mechanics of execution for any migration that has been authorized.

No code, schema, or migration file was modified in its generation.

---

## MIGRATION GOVERNANCE PRINCIPLES

### Principle 1 — Additive Evolution

**Statement:** Every migration adds to the schema. No migration removes or redefines existing structure in a way that could destroy data, break existing queries, or alter the meaning of existing rows.

**Operationally, additive evolution means:**

| Operation category | Permitted? | Condition |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | ✅ YES | Always |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... NULL` | ✅ YES | Column must be nullable |
| `CREATE INDEX IF NOT EXISTS` | ✅ YES | Index must not change query semantics |
| `CREATE UNIQUE INDEX` | ✅ CONDITIONAL | Only if no existing duplicate values |
| `INSERT INTO` (seed data) | ✅ YES | Must not violate FK constraints |
| `CREATE POLICY IF NOT EXISTS` | ✅ YES | Must not conflict with existing policy names |
| `DROP TABLE` | ❌ NO | Prohibited on user-data tables; conditional on reference tables (see Constraint 1, `MIGRATION_AUTHORITY_DECLARATION.md`) |
| `DROP COLUMN` | ❌ NO | Prohibited on all tables with live user data |
| `ALTER COLUMN ... SET NOT NULL` | ❌ NO | Prohibited unless all existing rows verified non-null |
| `ALTER COLUMN ... TYPE` | ❌ NO | Type changes may reject existing stored values |
| `RENAME COLUMN` | ❌ NO | Breaks all existing queries using the old column name |
| `TRUNCATE` | ❌ NO | Destroys user data |

**The additive principle is not bureaucratic caution.** Every row in `plants`, `care_tasks`, `care_logs`, `health_logs`, and `journal_entries` was created by a real user. The irreversibility of destructive DB operations means that the cost of a mistake is permanent data loss. Additive evolution eliminates the category of "oops" that cannot be corrected.

**The single known deviation in authorized PLANTMON migrations:** `supabase-migration-v2.sql §B7` drops and recreates `plant_care_profiles`. This is conditionally permitted because `plant_care_profiles` is a developer-seeded reference table with no user-authored rows and no user_id column. The condition must be verified pre-execution (see Pre-check Validation, Step 2). If user-authored rows are found, the DROP-and-recreate must be replaced with an ALTER TABLE approach before execution.

---

### Principle 2 — Coexistence-Safe Evolution

**Statement:** Every migration must leave the PLANTMON mobile app fully operational both before and after it is applied, without any code change. The coexistence mechanisms protecting the runtime (Phase 2.1 shim, comment-gated routing slots, `SELECT *` wildcard, optional TypeScript types) must remain intact and effective after the migration executes.

**Coexistence-safe design requirements for every migration:**

| Requirement | Rationale |
|---|---|
| All new columns must be nullable | Existing rows receive `NULL` for new columns — the shim strips them from writes, `SELECT *` returns them as null, TypeScript absorbs them silently |
| No new NOT NULL columns without DEFAULT | A NOT NULL column without a DEFAULT causes every existing row to fail a constraint violation — migration fails partway, leaving schema in a partial state |
| No migration triggers on user-data tables | A DB trigger fires on INSERT/UPDATE regardless of application shim — it cannot be comment-gated; it would execute even while runtime activation is pending |
| No implicit data-populating DEFAULTs | A DEFAULT that populates `canonical_species_id` would write non-null values to all existing rows — the shim would then destroy these values on the next plant edit |
| New tables must not be named to conflict with existing queries | A new table named `plant_profiles` (matching an alias used in existing code) would silently re-route existing queries |
| No alteration to existing `SELECT *` result structure that breaks TypeScript types | Adding a column named the same as an existing TypeScript property with a different type — e.g., a `status` column of type `INTEGER` where TypeScript expects `string` — breaks type safety silently |

**The coexistence-safe test:** Before applying any migration, a reviewer must be able to answer YES to: "If this migration is applied right now, will the running PLANTMON app behave identically to before, for every currently-operational feature?" A NO answer requires either a code deployment to precede the migration or a redesign of the migration.

---

### Principle 3 — Rollback-Aware Execution

**Statement:** No migration is applied to the live DB without a pre-authored rollback SQL script that can restore the previous schema state. The rollback script is authored, reviewed, and confirmed reachable before the forward migration is executed.

**Rollback awareness means:**

| Condition | Required action |
|---|---|
| Forward migration adds a new table | Rollback contains `DROP TABLE IF EXISTS <table_name>` |
| Forward migration adds a new column | Rollback contains `ALTER TABLE ... DROP COLUMN IF EXISTS <column>` |
| Forward migration adds a new index | Rollback contains `DROP INDEX IF EXISTS <index_name>` |
| Forward migration recreates a table (`plant_care_profiles`) | Rollback requires a pg_dump backup of the table taken before execution; rollback restores from backup |
| Forward migration seeds data | Rollback contains `DELETE FROM <table> WHERE <migration-specific condition>` |
| Forward migration adds RLS policies | Rollback contains `DROP POLICY IF EXISTS <policy_name> ON <table>` |

**The point-of-no-return for rollback:** Once Phase 2.2A activates and real user plants are assigned `canonical_species_id` values, rolling back `supabase-migration-v2.sql` destroys those canonical associations permanently. The rollback window is: between migration application and Phase 2.2A runtime activation. After runtime activation, the rollback becomes a data migration event requiring a separate authorized process.

**Rollback-aware execution does not guarantee rollback safety — it guarantees rollback existence.** Having the rollback script does not mean applying it is risk-free. It means that if the forward migration produces an unexpected result, there is a defined mechanism to attempt recovery rather than facing an undefined damage state.

---

### Principle 4 — Activation-Independent Migrations

**Statement:** Every migration must be inert at the moment of application — it must not activate any previously-inactive runtime system, trigger new application behavior, or cause the application to function differently than it did before the migration.

**Activation independence means:**

| Migration creates | Runtime effect immediately after migration |
|---|---|
| `canonical_species` table (empty) | Zero — no code queries this table; comment gates prevent all access |
| `plant_aliases` table (empty) | Zero — alias routing slot is comment-gated |
| `plant_care_profiles.canonical_species_id` column (NULL on all rows) | Zero — canonical routing slot is comment-gated; ilike lookup is unaffected by NULL in a column it doesn't query |
| `plants.canonical_species_id` column (NULL on all rows) | Zero — shim strips it from writes; `SELECT *` returns it as null; no component renders it |
| GIN index on `plant_aliases.alias_name` | Zero — indexes affect query performance, not application behavior; alias lookup is still comment-gated |

**The activation-independence test:** After the migration is applied (before any code change), run the app and perform: plant creation, plant edit, watering event, plant list load, plant detail view. Every action must produce results identical to before the migration. Any behavioral difference — including different timing, different DB round-trips, or different UI state — indicates the migration is not activation-independent and must be investigated before further steps.

**Why activation-independent migrations matter at PLANTMON's development stage:** PLANTMON has a single production environment (Supabase) and no staging DB. Activation-independent migrations allow schema changes to be applied at any time without coordinating a simultaneous code deployment. This decoupling is only possible because the coexistence mechanisms make the app indifferent to the new schema objects.

---

### Principle 5 — Manual Validation Requirements

**Statement:** Every migration requires manual validation at three points: before execution (pre-check), immediately after execution (post-check), and at the conclusion of the migration lifecycle (governance ledger update). No migration is considered complete until all three validation points are recorded.

**Manual validation is required — not automated — because:**

1. PLANTMON has no `schema_migrations` table. There is no automated mechanism to confirm whether a migration has been applied.
2. The Supabase Dashboard query history is ephemeral. It does not provide a permanent audit trail.
3. Governance documents can become stale. Only direct DB inspection via `information_schema` is authoritative.
4. The `getSchemaMigrationStatus()` function in `runtimeValidation.ts` has zero call sites. It cannot provide automated post-migration confirmation until it is wired to a call site.

**Manual validation minimum:** Every pre-check, post-check, and governance ledger update must include the timestamp of execution, the query used to verify, and the result observed. A governance document that says "migration applied" without a timestamp and verification query is not a valid validation record.

---

## REQUIRED MIGRATION LIFECYCLE

### Phase 0 — Pre-Authorization Check

**Before any lifecycle step begins, confirm:**

| Check | Verification method | Required result |
|---|---|---|
| Migration is PRD-authorized | Review `MIGRATION_AUTHORITY_DECLARATION.md` §Tier 1 | Phase is listed as authorized |
| Migration is for the next pending phase | Review `MIGRATION_EXECUTION_LEDGER.md` | No earlier migration is pending |
| Rollback SQL is authored | Check `governance-migration/` for rollback script | File exists and contains valid SQL |
| Execution window is low-traffic | Judgment call | App is in low-traffic state (development phase) |

If any check fails: **STOP. Do not proceed to lifecycle Step 1.**

---

### Step 1 — Governance Review

**Owner:** Tier 1 (PRD) + Tier 3 (Coexistence)  
**Purpose:** Confirm the migration is authorized, correctly scoped, and consistent with the activation boundary registry  
**Duration:** Synchronous — complete before any DB access

**Actions:**

1.1 **Read the full migration SQL file** — not a summary, the full file — and confirm it contains only operations in the permitted category (see Principle 1).

1.2 **Cross-reference against `ACTIVATION_BOUNDARY_REGISTRY.md`** — confirm no operation in the migration SQL activates any system listed as RUNTIME-OFF, UNIMPLEMENTED, or COMMENT-GATED.

1.3 **Cross-reference against `RUNTIME_COMPATIBILITY_CONTRACT.md`** — confirm the migration does not violate any of the 16 active compatibility guarantees.

1.4 **Classify the migration** using the Migration Classification System (§ below) and confirm the classification is consistent with the approval conditions for that class.

1.5 **Confirm the rollback SQL** — read the rollback script and confirm it is the correct inverse of every operation in the forward migration.

**Gate:** All 5 actions must be complete and confirm-positive before Step 2 begins. Record the governance review outcome in the migration's execution record.

---

### Step 2 — Pre-Check Validation

**Owner:** Tier 2 (Supabase) — executed via Supabase Dashboard SQL Editor  
**Purpose:** Confirm the live DB is in the exact expected state before the migration modifies it  
**Duration:** Synchronous — all queries must return expected results before Step 3 begins

**Standard pre-check queries (run for every migration):**

```sql
-- Pre-check 2.1: Confirm PostgreSQL version
SELECT version();
-- Expected: PostgreSQL 15.x or later

-- Pre-check 2.2: List all tables in public schema
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- Expected: plants, care_tasks, care_logs, plant_care_profiles, health_logs, journal_entries
-- (plus any tables added by earlier migrations in the current sequence)

-- Pre-check 2.3: Confirm no schema_migrations table exists yet
SELECT EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations'
) AS ledger_exists;
-- Expected: false (until schema_migrations is created)

-- Pre-check 2.4: Row counts for all user-data tables
SELECT
  (SELECT COUNT(*) FROM plants) AS plants,
  (SELECT COUNT(*) FROM care_tasks) AS care_tasks,
  (SELECT COUNT(*) FROM care_logs) AS care_logs,
  (SELECT COUNT(*) FROM health_logs) AS health_logs,
  (SELECT COUNT(*) FROM journal_entries) AS journal_entries;
-- Record all values — these are your rollback verification baseline
```

**Migration-specific pre-check queries for `supabase-migration-v2.sql`:**

```sql
-- Pre-check M1: Confirm plant_care_profiles is a reference table with no user rows
SELECT COUNT(*) AS row_count FROM plant_care_profiles;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'plant_care_profiles' AND column_name = 'user_id';
-- Expected: no 'user_id' column exists (confirms no user-authored rows)

-- Pre-check M2: Confirm CHECK constraint name on plant_care_profiles
SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'plant_care_profiles'::regclass AND contype = 'c';
-- Record the exact constraint name. If it contains 'light_requirement':
-- the migration's explicit DROP CONSTRAINT must use this exact name.
-- CRITICAL: If constraint name differs from what migration SQL expects, STOP.

-- Pre-check M3: Confirm canonical_species table does NOT yet exist
SELECT EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'canonical_species'
) AS canonical_species_exists;
-- Expected: false

-- Pre-check M4: Confirm plant_aliases table does NOT yet exist
SELECT EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plant_aliases'
) AS plant_aliases_exists;
-- Expected: false

-- Pre-check M5: Confirm canonical_species_id column does NOT yet exist on plants
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'plants' AND column_name = 'canonical_species_id'
) AS canonical_col_exists;
-- Expected: false

-- Pre-check M6: Confirm no existing RLS policy names conflict with migration
SELECT policyname FROM pg_policies WHERE tablename IN (
  'plants', 'care_tasks', 'care_logs', 'plant_care_profiles'
) ORDER BY tablename, policyname;
-- Record all policy names. Confirm none match the policy names defined in the migration SQL.
-- If conflicts exist, STOP — migration must be revised to use unique policy names.

-- Pre-check M7: Confirm no existing index names conflict with migration
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
-- Record all index names. Confirm none match the index names in PRE_DATASET_HARDENING_MIGRATION_v1.sql.
```

**Migration-specific pre-check queries for `PRE_DATASET_HARDENING_MIGRATION_v1.sql`:**

```sql
-- Pre-check H1: Confirm plant_aliases table exists (this migration adds indexes to it)
SELECT EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plant_aliases'
) AS plant_aliases_exists;
-- Expected: true (supabase-migration-v2.sql must have been applied first)
-- If false: STOP — apply supabase-migration-v2.sql first

-- Pre-check H2: Confirm alias_name column exists on plant_aliases
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'plant_aliases' AND column_name = 'alias_name'
) AS alias_name_exists;
-- Expected: true
```

**Gate for Step 2:** Every pre-check query must return its expected result. Any unexpected result is a STOP condition — the migration must not proceed until the discrepancy is investigated and resolved.

---

### Step 3 — Schema Snapshot

**Owner:** Tier 2 (Supabase)  
**Purpose:** Capture the authoritative pre-migration schema state as the recovery baseline  
**Duration:** Synchronous — must complete before Step 4 begins

**Required snapshot queries:**

```sql
-- Snapshot 3.1: Full column inventory of all tables
SELECT
  t.tablename,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM pg_tables t
JOIN information_schema.columns c ON c.table_name = t.tablename
WHERE t.schemaname = 'public'
ORDER BY t.tablename, c.ordinal_position;

-- Snapshot 3.2: All constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pgc.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- Snapshot 3.3: All indexes
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Snapshot 3.4: All RLS policies
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Snapshot 3.5: plant_care_profiles full content (for DROP-and-recreate recovery)
SELECT * FROM plant_care_profiles ORDER BY id;
-- Copy the output. This is the recovery baseline for §B7 rollback.
```

**Storage requirement:** The output of all five snapshot queries must be copied to a durable record before execution begins. Acceptable storage: a governance document commit in the Replit repo, a text file in `governance-migration/snapshots/`, or a manual record in the migration's execution log. The Supabase Dashboard query history is NOT acceptable as the sole storage — it is ephemeral.

---

### Step 4 — SQL Review

**Owner:** Tier 4 (Replit implementation)  
**Purpose:** Final line-by-line review of the migration SQL against the governance constraints  
**Duration:** Synchronous — all SQL must be reviewed before Step 5 begins

**SQL review checklist:**

```
□ 4.1  Every CREATE TABLE uses IF NOT EXISTS
□ 4.2  Every ADD COLUMN uses IF NOT EXISTS (or migration is idempotent via condition)
□ 4.3  Every CREATE INDEX uses IF NOT EXISTS
□ 4.4  Every new column is explicitly declared NULL (not NOT NULL)
□ 4.5  No column has a DEFAULT that would auto-populate existing rows
□ 4.6  No DB triggers are created
□ 4.7  No DB functions are created that auto-execute on table events
□ 4.8  No existing column is renamed, retyped, or dropped (except documented exception)
□ 4.9  No TRUNCATE or DELETE that removes user data
□ 4.10 All FK references target tables that exist in the live DB (verified in pre-check)
□ 4.11 All index names are unique (verified against pre-check snapshot)
□ 4.12 All constraint names are unique (verified against pre-check snapshot)
□ 4.13 All RLS policy names are unique (verified against pre-check snapshot)
□ 4.14 The DROP-and-recreate of plant_care_profiles (§B7): confirmed against pre-check M1
        that no user rows exist; confirmed plant_care_profiles backup taken in Step 3
□ 4.15 The rollback script correctly inverts every operation in this SQL file
□ 4.16 The SQL is executable in a single session (no dependencies on session variables
        or prior SQL in a different session)
```

**Gate for Step 4:** All 16 checks must be checked. Any unchecked item is a STOP condition.

---

### Step 5 — Staged Execution

**Owner:** Tier 2 (Supabase) — executed via Supabase Dashboard SQL Editor  
**Purpose:** Apply the migration SQL to the live DB  
**Duration:** Must complete in a single uninterrupted session

**Execution rules:**

5.1 **Use a single transaction where possible.** If the migration SQL does not already wrap statements in `BEGIN ... COMMIT`, evaluate whether transaction wrapping is appropriate. Note: DDL in PostgreSQL is transactional — `CREATE TABLE`, `ADD COLUMN`, and `CREATE INDEX` can be rolled back within a transaction.

5.2 **Execute the full migration SQL, not individual statements.** Partial execution leaves the schema in an intermediate state that may not be coexistence-safe and may not be reversible without a full rollback.

5.3 **Do not modify the migration SQL at execution time.** If a problem is found during execution review that was not caught in Step 4, STOP and return to Step 4. Do not improvise SQL edits in the Supabase Dashboard.

5.4 **For `supabase-migration-v2.sql §B7` (DROP-and-recreate):** Execute the DROP and CREATE in the same transaction. If the CREATE fails, the DROP must also be rolled back. If the transaction cannot be maintained across DDL, execute the CREATE immediately before the DROP and verify the CREATE succeeded before executing the DROP — though this pattern requires the new table name to be different, which it is not in this migration. **Preferred: use `BEGIN; DROP TABLE plant_care_profiles; CREATE TABLE plant_care_profiles (...); COMMIT;` as a single atomic operation.**

5.5 **Record the exact timestamp of execution start and execution completion.**

5.6 **If the Supabase Dashboard returns an error at any statement:** Note the exact error text and the statement that produced it. Do not attempt to continue with subsequent statements. Evaluate whether the applied statements must be rolled back. Consult the rollback script from Step 1 / Principle 3.

---

### Step 6 — Post-Check Validation

**Owner:** Tier 2 (Supabase) — executed via Supabase Dashboard SQL Editor  
**Purpose:** Confirm the migration produced exactly the expected schema changes and no unexpected side effects  
**Duration:** Synchronous — must complete before Step 7

**Standard post-check queries (run after every migration):**

```sql
-- Post-check 6.1: Row counts must match pre-check baseline
SELECT
  (SELECT COUNT(*) FROM plants) AS plants,
  (SELECT COUNT(*) FROM care_tasks) AS care_tasks,
  (SELECT COUNT(*) FROM care_logs) AS care_logs,
  (SELECT COUNT(*) FROM health_logs) AS health_logs,
  (SELECT COUNT(*) FROM journal_entries) AS journal_entries;
-- Compare against Step 2 pre-check 2.4 baseline.
-- Any count decrease is a CRITICAL failure — investigate immediately.
-- Any count increase is unexpected and must be explained.
```

**Migration-specific post-check queries for `supabase-migration-v2.sql`:**

```sql
-- Post-check M1: Confirm canonical_species table created
SELECT EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'canonical_species'
) AS canonical_species_exists;
-- Expected: true

-- Post-check M2: Confirm plant_aliases table created
SELECT EXISTS (
  SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plant_aliases'
) AS plant_aliases_exists;
-- Expected: true

-- Post-check M3: Confirm Phase 2.1 columns on plants
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'plants'
  AND column_name IN (
    'canonical_species_id', 'user_entered_name',
    'canonical_species_name', 'species_resolution_method'
  );
-- Expected: 4 rows, all is_nullable = 'YES'

-- Post-check M4: Confirm canonical_species_id column on care_tasks
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'care_tasks' AND column_name = 'canonical_species_id'
) AS exists;
-- Expected: true

-- Post-check M5: Confirm canonical_species_id column on care_logs
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'care_logs' AND column_name = 'canonical_species_id'
) AS exists;
-- Expected: true

-- Post-check M6: Confirm plant_care_profiles was recreated with correct row count
SELECT COUNT(*) FROM plant_care_profiles;
-- Expected: must match or exceed the count recorded in Step 3 Snapshot 3.5.
-- Any decrease indicates data loss in the DROP-and-recreate — CRITICAL FAILURE.

-- Post-check M7: Confirm existing user data is completely intact
-- (Repeat the full row count query from post-check 6.1 with extra attention to plants)
SELECT id, display_name, species_name, created_at FROM plants ORDER BY created_at;
-- Visually confirm all previously-existing plants are present.

-- Post-check M8: Confirm new columns on existing plants are NULL (not populated)
SELECT
  COUNT(*) AS total_plants,
  COUNT(canonical_species_id) AS canonical_populated,
  COUNT(user_entered_name) AS user_entered_populated
FROM plants;
-- Expected: canonical_populated = 0, user_entered_populated = 0
-- Any non-zero count means a DEFAULT silently populated rows — investigate.

-- Post-check M9: Confirm all new tables are empty (migration creates structure, not data)
SELECT
  (SELECT COUNT(*) FROM canonical_species) AS canonical_species_rows,
  (SELECT COUNT(*) FROM plant_aliases) AS plant_aliases_rows;
-- Expected: both = 0 (seeding is a separate Phase B2.1 event)

-- Post-check M10: Confirm RLS is enabled on new tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('canonical_species', 'plant_aliases');
-- Expected: rowsecurity = true for both
```

**Migration-specific post-check queries for `PRE_DATASET_HARDENING_MIGRATION_v1.sql`:**

```sql
-- Post-check H1: Confirm GIN index on alias_name exists
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'plant_aliases'
    AND indexname = 'idx_plant_aliases_alias_name_gin'
) AS gin_index_exists;
-- Expected: true (use exact index name from migration SQL)

-- Post-check H2: Confirm unique active alias index exists
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = 'plant_aliases'
    AND indexname = 'idx_plant_aliases_unique_active'
) AS unique_index_exists;
-- Expected: true (use exact index name from migration SQL)
```

**Gate for Step 6:** Every post-check query must return its expected result. Any unexpected result is a STOP condition — the migration's effect must be investigated before proceeding to Step 7. If user-data row counts have decreased: initiate rollback immediately; do not proceed.

---

### Step 7 — Runtime Validation

**Owner:** Tier 3 (Coexistence) + Tier 4 (Replit)  
**Purpose:** Confirm the live app continues to operate correctly and the migration produced no unexpected behavioral changes  
**Duration:** Must complete before Step 8

**Runtime validation actions:**

7.1 **Plant creation test:** Create a new plant with a recognized species name (e.g., "Monstera deliciosa") and confirm:
  - Plant creation succeeds (no HTTP 400, no error banner)
  - Plant appears in plant list
  - Watering task is created with `frequency_days` from the ilike lookup (or 7-day fallback)
  - No `canonical_species_id` is set on the new plant row (verify via `SELECT canonical_species_id FROM plants ORDER BY created_at DESC LIMIT 1`)

7.2 **Plant creation test (unrecognized species):** Create a plant with an unrecognized species name ("Fictionus plantus") and confirm:
  - Creation succeeds
  - `frequency_days = 7` on the new care task
  - Fallback behavior identical to pre-migration

7.3 **Watering event test:** Water an existing plant and confirm:
  - `last_completed_at` updated correctly
  - `next_due_at` updated correctly
  - Care log row inserted
  - `care_logs.canonical_species_id` is NULL (not populated — shim ensures this)

7.4 **Plant list load test:** Load the full plant list and confirm:
  - All plants that existed before migration are present
  - Countdown for each plant is correct
  - No "undefined" or "null" UI rendering from new nullable columns

7.5 **Plant edit test:** Edit an existing plant's display name and confirm:
  - Edit succeeds
  - `canonical_species_id` on the plant row remains NULL (shim strips it from UPDATE)
  - No unexpected fields appear in the DB row

**Gate for Step 7:** All five tests must pass. Any failure indicates the migration has produced a coexistence violation — do not proceed to Step 8. Investigate whether the failure requires rollback.

---

### Step 8 — Governance Ledger Update

**Owner:** Tier 4 (Replit) + Tier 1 (PRD governance)  
**Purpose:** Create the permanent, authoritative record of the migration execution  
**Duration:** Must complete within 24 hours of migration execution

**Required ledger entries:**

8.1 **Update `governance-baseline/MIGRATION_EXECUTION_LEDGER.md`** with:
  - Migration filename
  - Execution date and time
  - Executor identity
  - Pre-check results summary (pass/fail for each check, key values recorded)
  - Schema snapshot storage location
  - Post-check results summary
  - Runtime validation results
  - Any deviations from expected results and their resolution
  - Rollback script location

8.2 **Create a `schema_migrations` ledger entry** (once the `schema_migrations` table is created — see `MIGRATION_AUTHORITY_DECLARATION.md §Requirement 1`):
```sql
INSERT INTO schema_migrations (filename, applied_by, phase, notes)
VALUES (
  'supabase-migration-v2.sql',
  '[executor-name]',
  'B2.1',
  'Phase 2.1 canonical infrastructure. Pre-check M2: constraint name confirmed as
   [exact-name]. Post-check: all 10 queries passed. Row counts stable.
   Runtime validation: all 5 tests passed. Rollback: governance-migration/rollback-v2.sql'
);
```

8.3 **Update `governance-baseline/OPERATIONAL_BASELINE_MANIFEST.md`** to reflect the new baseline schema state.

8.4 **Update `governance-reconciliation/STALE_ASSUMPTION_REGISTRY.md`** to close any stale assumptions resolved by the migration.

**Gate for Step 8:** Ledger update is required before any further activation events are authorized. No runtime activation (Step 9 in the `ACTIVATION_BOUNDARY_REGISTRY.md` activation checklist) may proceed without a completed governance ledger record.

---

## MIGRATION CLASSIFICATION SYSTEM

Each migration must be assigned exactly one primary classification before governance review begins. Secondary classifications may apply in addition.

---

### Class 1 — Additive Migration

**Definition:** A migration that adds new tables, columns, or indexes to the schema without modifying any existing structure and without any user-visible behavioral effect.

**Characteristics:**
- All operations are `CREATE`, `ADD COLUMN`, `CREATE INDEX`, or `INSERT` (seed data)
- No `DROP`, `ALTER`, `TRUNCATE`, or `UPDATE` on existing structures
- New tables are empty after migration
- New columns are `NULL` on all existing rows
- Post-migration app behavior is identical to pre-migration

**PLANTMON examples:**
- Hypothetical future migration adding `plant_notes_v2` table
- Migration adding `room_temperature` column to `plants` (nullable)

**Approval requirements:** Tier 1 authorization; Tier 4 SQL review; standard pre/post-check queries only; no special rollback concern beyond standard DROP/DROP COLUMN script.

**Risk level:** LOW

---

### Class 2 — Coexistence Migration

**Definition:** A migration that adds Phase 2.x infrastructure (tables, columns, indexes) that the coexistence mechanisms render inert until a separate runtime activation event.

**Characteristics:**
- Adds tables that are comment-gated in the application code
- Adds columns that the Phase 2.1 shim strips from all writes
- Post-migration app behavior is identical to pre-migration (activation-independent)
- Has a corresponding RUNTIME-OFF entry in `ACTIVATION_BOUNDARY_REGISTRY.md`
- Does not seed data — that is a separate Phase B2.1 seeding event

**PLANTMON examples:**
- `supabase-migration-v2.sql` — adds `canonical_species`, `plant_aliases`, Phase 2.1 columns (PRIMARY classification for this migration)
- Future migration adding `collapse_mappings` table

**Approval requirements:** Tiers 1–4 authorization gate; CHECK constraint pre-flight for `plant_care_profiles`; activation-independence test required in Step 7; rollback script required before Step 5.

**Risk level:** MEDIUM (activation-independent, but irreversible without rollback script; CHECK constraint name risk for this specific migration)

---

### Class 3 — Activation Migration

**Definition:** A migration that, when combined with a simultaneous runtime code deployment, activates a previously-inactive system. This class is used only when a schema change and a code change must be deployed as a coordinated unit.

**Characteristics:**
- The schema change alone is coexistence-safe (the app continues to operate in existing mode)
- The code change alone is coexistence-safe (the code change has no effect without the schema change)
- Together, they constitute a runtime activation event

**PLANTMON examples:**
- There are no Class 3 migrations in the current authorized corpus. The Phase 2.1 shim removal (code) and `supabase-migration-v2.sql` (schema) are intentionally separable — the schema migration is Class 2; the shim removal is a separate Tier 4 activation event.
- A future example: adding a `NOT NULL` constraint to `canonical_species_id` after all rows are backfilled would be Class 3 — it is a schema change (migration) that permanently enforces an application invariant (runtime constraint).

**Approval requirements:** All Class 2 requirements, plus explicit Tier 1 authorization for the runtime activation, plus confirmation that coexistence mechanisms remain valid through the activation window.

**Risk level:** HIGH (coordinated deployment required; risk window between schema and code deployment)

---

### Class 4 — Destructive Migration (PROHIBITED in Phase B2.x)

**Definition:** A migration that removes or irrevocably alters existing schema structure in a way that could destroy user data or break existing queries.

**Characteristics:**
- Contains `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE` on user-data tables
- Or `ALTER COLUMN ... SET NOT NULL` on columns with potential NULL values
- Or `ALTER COLUMN ... TYPE` that may reject existing stored values

**PLANTMON examples:**
- No Phase B2.x migration is authorized to be Class 4 on user-data tables
- The `plant_care_profiles` DROP-and-recreate in `supabase-migration-v2.sql §B7` would be classified Class 4 if `plant_care_profiles` contained user data — it is reclassified to Class 2 only because pre-check M1 confirms zero user rows

**Approval requirements:** Explicit Tier 1 executive authorization; user data backup required; rollback confirmed as data-restoring (not merely DDL-reverting); executed in a maintenance window; user notification if live user data is involved.

**Risk level:** CRITICAL — not authorized for any Phase B2.x migration against user-data tables

---

### Class 5 — Scheduler-Affecting Migration

**Definition:** A migration that directly or indirectly alters the care scheduling behavior for any live plant — either by changing `care_tasks.frequency_days`, writing to `care_tasks.next_due_at` through triggers or defaults, or adding new scheduling columns.

**Characteristics:**
- Adds a DB trigger on `care_tasks` or `plants` that modifies scheduling fields
- Adds a DEFAULT value on `next_due_at` or `frequency_days` that auto-computes on INSERT
- Adds a seasonal adjustment column and populates it via migration DML

**PLANTMON examples:**
- No Class 5 migration is authorized in the current corpus
- A future `ALTER TABLE care_tasks ADD COLUMN seasonal_offset INTEGER` would be Class 5 only if it included DML to populate the new column with computed values

**Approval requirements:** Explicit Tier 3 (coexistence) sign-off; `getDaysUntilWatering` fix must be confirmed deployed before any Class 5 migration is applied; runtime validation must include scheduler continuity test (countdown values pre/post migration compared for all live plants).

**Risk level:** HIGH (all 16 compatibility guarantees include scheduler continuity; see `RUNTIME_COMPATIBILITY_CONTRACT.md §Guarantee 2`)

---

### Class 6 — Onboarding-Affecting Migration

**Definition:** A migration that alters the plant creation path — either by changing the `plants` table structure in a way that affects INSERT success, or by modifying `plant_care_profiles` in a way that changes species resolution behavior.

**Characteristics:**
- Modifies the `plants` table structure (columns, constraints, triggers)
- Modifies `plant_care_profiles` rows in a way that changes ilike lookup results
- Adds a NOT NULL column to `plants` (any new NOT NULL addition affects INSERT)

**PLANTMON examples:**
- Adding a new row to `plant_care_profiles` for a previously-unrecognized species: Class 6 (changes care schedule for future plants with that species)
- Modifying `watering_frequency_days` on an existing `plant_care_profiles` row: Class 6 (changes care schedule for future plants matching that species via ilike)
- `supabase-migration-v2.sql` is ALSO a Class 6 secondary classification — it adds Phase 2.1 columns to `plants` (though the shim maintains onboarding continuity)

**Approval requirements:** Tier 1 authorization for any `plant_care_profiles` data change (it is a routing decision, not a data entry); runtime validation must include plant creation test with the affected species; rollback must include restoration of the pre-migration `plant_care_profiles` data state.

**Risk level:** MEDIUM (Phase 2.1 shim insulates plant INSERT; `plant_care_profiles` changes affect future plants immediately)

---

### Classification Matrix for Authorized PLANTMON Migrations

| Migration | Primary class | Secondary class | Risk level |
|---|---|---|---|
| `supabase-migration-v2.sql` | Class 2 (Coexistence) | Class 6 (Onboarding-affecting) | MEDIUM |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Class 1 (Additive) | — | LOW |
| `collapse_mappings` CREATE TABLE (future, not yet authored) | Class 2 (Coexistence) | — | MEDIUM |
| `seasonal_watering_adjustment` ALTER TABLE (future, not yet authored) | Class 2 (Coexistence) | Class 5 (Scheduler-affecting) | HIGH |
| Phase 2.2A runtime activation code deployment (not a migration) | N/A | N/A | HIGH (code event) |
| Phase 2.1 shim removal (not a migration) | N/A | N/A | CRITICAL (code event) |

---

## REQUIRED APPROVAL CONDITIONS

### Approval Condition Set A — Universal (all migrations)

| Condition | Verification | Blocker if unmet? |
|---|---|---|
| A1: PRD authorization confirmed | `MIGRATION_AUTHORITY_DECLARATION.md §Tier 1` reviewed | ✅ YES — HARD BLOCK |
| A2: Migration classified correctly | Classification system applied; class confirmed | ✅ YES — HARD BLOCK |
| A3: Rollback SQL authored and reviewed | Rollback file exists in `governance-migration/`; SQL reviewed for correctness | ✅ YES — HARD BLOCK |
| A4: No earlier migration is pending | `MIGRATION_EXECUTION_LEDGER.md` confirms all predecessors applied | ✅ YES — HARD BLOCK |
| A5: Schema snapshot taken and stored | Step 3 snapshot queries executed; output stored durably | ✅ YES — HARD BLOCK |
| A6: Pre-check validation passed | All Step 2 standard queries returned expected results | ✅ YES — HARD BLOCK |
| A7: SQL review checklist complete | All 16 items in Step 4 confirmed | ✅ YES — HARD BLOCK |
| A8: Runtime validation plan prepared | Step 7 test cases identified for this migration | ✅ YES — HARD BLOCK |

---

### Approval Condition Set B — Class 2 Coexistence Migration (additional)

| Condition | Verification | Blocker if unmet? |
|---|---|---|
| B1: Migration-specific pre-check queries all pass | All M-prefixed queries in Step 2 returned expected results | ✅ YES — HARD BLOCK |
| B2: Activation-independence confirmed | `ACTIVATION_BOUNDARY_REGISTRY.md` confirms every new object is comment-gated or shim-protected | ✅ YES — HARD BLOCK |
| B3: CHECK constraint name verified | Pre-check M2 executed; constraint name recorded; migration SQL uses correct name | ✅ YES — HARD BLOCK (specific to `supabase-migration-v2.sql §B7`) |
| B4: `plant_care_profiles` backup taken | Step 3 Snapshot 3.5 output stored; pg_dump available | ✅ YES — HARD BLOCK (specific to `supabase-migration-v2.sql §B7`) |
| B5: Post-migration coexistence test confirms app unchanged | Step 7 all 5 tests pass after execution | ✅ YES — RETROSPECTIVE — triggers rollback if failed |

---

### Approval Condition Set C — Class 5 Scheduler-Affecting Migration (additional)

| Condition | Verification | Blocker if unmet? |
|---|---|---|
| C1: `getDaysUntilWatering` fix deployed | Code review confirms function reads `next_due_at` directly; OTA or build confirmed live | ✅ YES — HARD BLOCK |
| C2: `next_due_at` read/write consistency verified | Pre-migration test: water a plant, check countdown, verify countdown reads `next_due_at` | ✅ YES — HARD BLOCK |
| C3: Scheduler continuity test planned | Specific test: record countdown for 3 live plants pre-migration; verify same post-migration | ✅ YES — HARD BLOCK |

---

### What Requires Rollback Planning (conditions that constitute rollback triggers)

| Event | Required response |
|---|---|
| Any pre-check query returns unexpected result | STOP — investigate; do not proceed to execution |
| Migration SQL execution returns any error | STOP — evaluate whether partial application occurred; apply rollback if any statements executed |
| Post-check user-data row count has decreased | IMMEDIATE ROLLBACK — data loss is non-negotiable |
| Post-check M8 shows non-zero canonical population | STOP — investigate DEFAULT propagation; apply rollback |
| Step 7 runtime test produces HTTP 400 on plant creation | APPLY ROLLBACK — coexistence violation; migration has broken onboarding continuity |
| Step 7 runtime test shows incorrect countdown for any plant | STOP — investigate; apply rollback if countdown divergence is confirmed migration-caused |
| Governance ledger cannot be completed within 24 hours | NOT a rollback trigger — but a governance failure that must be escalated to Tier 1 |

---

## GOVERNANCE-PROTECTED RUNTIME PROPERTIES

These are the five runtime properties that no migration may silently violate. "Silently violate" means: the property is broken by the migration's side effects, but no error is raised and no validation step catches it. Silent violations are the highest-risk failure mode because they are invisible at execution time and only manifest as user-facing bugs later.

---

### Protected Property 1 — Scheduler Continuity

**Definition:** Every plant in the live system displays a correct, non-negative watering countdown that accurately reflects its actual watering schedule. No migration may produce a state where any plant's countdown diverges from its care task data without triggering a detectable error.

**How a migration could silently violate this property:**
- A migration adds a DEFAULT to `care_tasks.next_due_at` using `NOW() + interval '7 days'` — on INSERT, PostgreSQL computes this using server time; application-computed `next_due_at` is overwritten; countdown for new plants diverges from the expected interval
- A migration adds a trigger on `plants` that updates `care_tasks.next_due_at` when `species_name` changes — a plant edit silently resets its countdown without React Query cache invalidation
- A migration adds a seasonal multiplier column with a DEFAULT of 0.8 — `getDaysUntilWatering` doesn't read this column, but a future query that joins on it returns wrong values

**Migration validation requirement for this property:** After every migration, run the Step 7 watering event test (7.3) and plant list load test (7.4) and explicitly verify the countdown for at least one plant matches the expected value based on its `last_completed_at` and `frequency_days`.

**The `getDaysUntilWatering` known debt creates a latent risk:** `getDaysUntilWatering` reads `last_completed_at + frequency_days` rather than `next_due_at`. Any migration that writes a divergent `next_due_at` will not be caught by the countdown test until `getDaysUntilWatering` is fixed. Until the fix is deployed, the countdown test verifies the wrong property. This is documented as the highest-priority independent fix in the governance corpus (RAD-001).

---

### Protected Property 2 — Onboarding Continuity

**Definition:** Every plant creation attempt either succeeds with a complete, valid DB record and at least one active care task, or fails with a user-visible error. No migration may produce a state where plant creation silently fails, produces an incomplete record, or produces a care task with a null `frequency_days`.

**How a migration could silently violate this property:**
- A migration adds a NOT NULL column to `plants` without a DEFAULT — the next plant creation attempt fails with a PostgreSQL constraint violation; the shim cannot protect against a missing required column
- A migration adds a UNIQUE constraint to `plants.species_name` — duplicate species entries across users violate the constraint; plant creation silently fails for any species a user has already added
- A migration drops a row from `plant_care_profiles` for a common species — plants with that species fall through to the 7-day fallback with no notification; care quality degrades silently

**Migration validation requirement for this property:** After every migration, run the Step 7 plant creation tests (7.1 and 7.2) explicitly. Both recognized and unrecognized species must create successfully. The recognized species must receive the correct care profile (not the fallback), confirming the `plant_care_profiles` data is intact.

**The `plant_care_profiles` DROP-and-recreate risk:** `supabase-migration-v2.sql §B7` recreates `plant_care_profiles`. If the recreation fails or produces fewer rows than before, onboarding continuity is silently violated — plant creation will still succeed (shim + fallback protect it), but all plants will receive the 7-day fallback instead of species-specific profiles. Post-check M6 catches this specifically. If M6 shows a row count decrease, this is a protected property violation requiring rollback.

---

### Protected Property 3 — Canonical Isolation

**Definition:** No migration may produce a state where `canonical_species_id` contains a non-null value in any `plants`, `care_tasks`, or `care_logs` row without an explicit Phase 2.2A runtime activation event.

**How a migration could silently violate this property:**
- A migration adds a DEFAULT to `plants.canonical_species_id` — all existing rows and all new rows receive a non-null value; the shim still strips it on UPDATE, so the next plant edit silently destroys the canonical association
- A migration adds a trigger on `plants` that populates `canonical_species_id` via a lookup against `canonical_species` — creates canonical associations while the routing code is still comment-gated; associations are invisible to the app but present in the DB; shim destroys them on next edit
- A migration's FK constraint on `plants.canonical_species_id` references `canonical_species(id)` with `ON UPDATE SET DEFAULT` — a `canonical_species` row update silently nullifies associated plant records

**Migration validation requirement for this property:** After every migration, explicitly run post-check M8: `SELECT COUNT(canonical_species_id) FROM plants WHERE canonical_species_id IS NOT NULL`. Any non-zero result is a canonical isolation violation. Also run: `SELECT COUNT(canonical_species_id) FROM care_tasks WHERE canonical_species_id IS NOT NULL`. Both must return 0 until Phase 2.2A runtime activation is deliberately executed.

---

### Protected Property 4 — Coexistence Integrity

**Definition:** The four coexistence mechanisms that protect the PLANTMON runtime (Phase 2.1 shim, `SELECT *` wildcard, comment-gated routing slots, optional TypeScript types) must remain intact and effective after every migration. No migration may alter the live DB in a way that bypasses any of these mechanisms.

**How a migration could silently violate this property:**
- A migration renames `canonical_species_id` to `cs_id` — the shim strips `canonical_species_id` but not `cs_id`; the renamed column passes through the shim and causes a PostgREST error (column exists with new name, shim strips old name, INSERT includes unrecognized new field from TypeScript) — but only if TypeScript also uses the new name, which it doesn't yet; actual result depends on column rename direction
- A migration adds a GENERATED ALWAYS column to `plants` — GENERATED ALWAYS columns reject explicit values in INSERT; if the application (post-shim-removal) ever tries to write to this column, it fails unconditionally
- A migration changes `plants.canonical_species_id` from `TEXT` to `UUID` — the shim strips it, so writes are unaffected; but any future code that reads and re-writes the value would need to handle UUID type coercion

**Migration validation requirement for this property:** The coexistence integrity test is embedded in the Step 7 runtime validation tests (7.1–7.5). All five tests working correctly confirms coexistence integrity. There is no single query that validates all four mechanisms — the runtime tests are the coexistence integrity gate.

---

### Protected Property 5 — Historical Care Continuity

**Definition:** Every row in `care_logs`, `health_logs`, and `journal_entries` represents a real historical care event that a real user performed. No migration may destroy, modify, or make inaccessible any historical care record.

**How a migration could silently violate this property:**
- A migration adds a FK from `care_logs.canonical_species_id` to `canonical_species(id)` with `ON DELETE CASCADE` — if a `canonical_species` row is deleted during dataset maintenance, all associated care log rows are silently deleted
- A migration adds a partial index on `care_logs` with a `WHERE` clause that excludes legacy rows — the excluded rows are not deleted but become inaccessible to queries using that index; applications relying on index scans may miss historical data
- A migration adds a `deleted_at` column to `care_logs` with a DEFAULT of `NULL` and then adds an RLS policy that excludes rows where `deleted_at IS NOT NULL` — if a bug later populates `deleted_at` for existing rows, historical records are silently hidden

**Migration validation requirement for this property:** After every migration, verify `care_logs`, `health_logs`, and `journal_entries` row counts match the pre-migration baseline (Step 6 post-check 6.1). Additionally, for any migration that adds FK constraints referencing new tables, confirm the FK uses `ON DELETE RESTRICT` (not `CASCADE`, not `SET NULL`) — a RESTRICT FK prevents parent deletion without an explicit decision about the child rows.

**The FK cascade risk for PLANTMON:** `supabase-migration-v2.sql` adds `canonical_species_id` to `care_logs`. If this column includes a FK to `canonical_species(id)` with any cascade behavior, historical care logs are at risk when canonical species records are modified. The pre-flight SQL review (Step 4, item 4.10) must confirm the FK on `care_logs.canonical_species_id` uses `REFERENCES canonical_species(id) ON DELETE SET NULL` — not CASCADE — so that deleting a canonical species record nullifies the reference in care logs rather than deleting the historical record.

---

## EXECUTION PROTOCOL SUMMARY

```
MIGRATION AUTHORIZATION CHECK (Phase 0)
  └─ PRD authorization confirmed?         → YES / STOP
  └─ Rollback script authored?            → YES / STOP
  └─ No earlier migration pending?        → YES / STOP

STEP 1: GOVERNANCE REVIEW
  └─ Full SQL reviewed, classified, cross-referenced against governance corpus
  └─ Rollback confirmed as correct inverse
  └─ Gate: all 5 actions confirmed

STEP 2: PRE-CHECK VALIDATION (Supabase Dashboard)
  └─ Standard queries (4) + migration-specific queries (7–10)
  └─ Gate: ALL queries return expected results / STOP on any failure

STEP 3: SCHEMA SNAPSHOT (Supabase Dashboard)
  └─ 5 snapshot queries executed; output stored durably
  └─ plant_care_profiles data backup taken (for §B7)
  └─ Gate: storage confirmed before proceeding

STEP 4: SQL REVIEW
  └─ 16-item checklist completed
  └─ Gate: all 16 items confirmed / STOP on any unchecked item

STEP 5: STAGED EXECUTION (Supabase Dashboard)
  └─ Full SQL in single session; timestamp recorded
  └─ On error: STOP; evaluate rollback

STEP 6: POST-CHECK VALIDATION (Supabase Dashboard)
  └─ Standard queries + migration-specific queries
  └─ Row counts compared to Step 2 baseline
  └─ Gate: ALL expected results confirmed / IMMEDIATE ROLLBACK on count decrease

STEP 7: RUNTIME VALIDATION
  └─ 5 live app tests
  └─ Gate: all 5 tests pass / investigate; rollback if coexistence violated

STEP 8: GOVERNANCE LEDGER UPDATE
  └─ MIGRATION_EXECUTION_LEDGER.md updated
  └─ schema_migrations INSERT recorded
  └─ OPERATIONAL_BASELINE_MANIFEST.md updated
  └─ Gate: complete within 24 hours

→ MIGRATION COMPLETE
→ NEXT: Dataset seeding (separate Phase B2.1 event) if migration is supabase-migration-v2.sql
→ THEN: Activation boundary gates (see ACTIVATION_BOUNDARY_REGISTRY.md)
```

---

*This document is a read-only migration execution protocol. No application files, SQL files, migration files, or schema state were modified in its generation. Every future migration against the PLANTMON live Supabase DB must be executed under this protocol. Deviations from this protocol require explicit Tier 1 authorization and must be recorded in the governance ledger with the reason for deviation.*
