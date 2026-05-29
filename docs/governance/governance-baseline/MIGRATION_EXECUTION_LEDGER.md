# PLANTMON — Migration Execution Ledger

**Classification:** Governance Baseline Freeze  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration)  
**Source authority:** `governance-audit/replit-migration-audit.md`, `governance-audit/replit-runtime-risk-audit.md`, `governance-baseline/OPERATIONAL_BASELINE_MANIFEST.md`  

This document is the authoritative migration execution ledger for PLANTMON at the Phase B2.0 boundary. It records the precise state of all SQL migration files, the governance model governing their execution, confirmed live infrastructure, and known ambiguities. No SQL was executed, no files were modified, and no migration state was altered in its generation.

---

## MIGRATION AUTHORITY STATE

### Absence of Migration Runner

PLANTMON has **no automated migration runner** at any layer of the stack.

| Layer | Migration runner present? | Evidence |
|---|---|---|
| Expo mobile app startup | ❌ NO | `_layout.tsx` startup sequence — fonts, auth session check, routing only. No SQL executed. |
| Supabase JS client (`@supabase/supabase-js`) | ❌ NO | PostgREST HTTP client only. Does not inspect, push, or synchronize schema. |
| Drizzle ORM (`lib/db/`) | ❌ SCOPED to api-server | Drizzle targets `DATABASE_URL` (a separate PostgreSQL DB for the Express API server), not the Supabase DB. `pnpm --filter @workspace/db run push` would never reach the Supabase DB under any configuration. |
| Supabase Edge Functions | ❌ NO | No edge function files exist in the project. |
| Supabase DB triggers | ❌ NO | The only trigger defined across all SQL files is `update_updated_at` on `plants` — a timestamp maintenance trigger, not a migration mechanism. |
| CI / GitHub Actions | ❌ NO | No CI pipeline is configured. No automated schema application on push. |
| `pnpm run` scripts | ❌ NO | No root or package-level script applies migrations to the Supabase DB. |

**Operational consequence:** Every schema change to the live Supabase database is a **manual, human-executed operation** via the Supabase Dashboard SQL Editor (or equivalent direct PostgreSQL connection). There is no automated path by which any migration file in this repository is applied to the live database.

---

### Absence of Schema Migration Metadata Table

The live Supabase database has **no migration history tracking table** of any kind.

`supabase-setup.sql` does not create a `schema_migrations`, `migrations`, `_migrations`, or equivalent table. Neither pending migration file creates one.

**Consequences of this absence:**

| Consequence | Impact |
|---|---|
| No programmatic applied/unapplied detection | Whether a migration has been applied can only be determined by inspecting the schema directly (e.g., checking whether a column or table exists) |
| No idempotency enforcement | Nothing prevents a migration from being applied twice. `CREATE TABLE IF NOT EXISTS` guards exist in `supabase-migration-v2.sql`, but not all statements use `IF NOT EXISTS` |
| No rollback record | There is no log of what was applied, when, or by whom |
| No ordering enforcement | Nothing prevents applying `PRE_DATASET_HARDENING_MIGRATION_v1.sql` before `supabase-migration-v2.sql`, even if ordering matters |
| `getSchemaMigrationStatus()` is the only programmatic detection | `runtimeValidation.ts:79–85` detects whether Phase 2.1 columns are present in a PostgREST response. This is the sole available migration-state detection function — and it has zero call sites in the current runtime. |

**Detection query for current migration state** (run in Supabase SQL Editor before any migration):

```sql
-- Confirm which Phase 2.1 columns exist on plants
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
-- Expected pre-migration: 0 rows
-- Expected post-migration: 4 rows

-- Confirm which Phase 2.1 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('canonical_species', 'plant_aliases', 'collapse_mappings');
-- Expected pre-migration: 0 rows
-- Expected post-migration: 3 rows
```

---

### Manual Migration Governance Model

The current migration governance model is **fully manual** and relies entirely on developer discipline.

**Current model description:**

```
Developer authors SQL → SQL file committed to Replit repo
  → Developer opens Supabase Dashboard SQL Editor
    → Developer pastes SQL content
      → Developer clicks "Run"
        → Supabase applies statements sequentially
          → Developer manually verifies (column inspection, test query)
```

No step in this chain is automated, logged, or enforced by tooling. The applied/unapplied state of each migration file exists only in:
1. The actual Supabase DB schema (inspectable via SQL)
2. Developer memory
3. This governance document

**Maturity classification:** **LEVEL 1 — Ad-hoc manual execution**

| Maturity level | Description | PLANTMON status |
|---|---|---|
| Level 0 — Untracked | SQL applied directly, no files | ABOVE THIS |
| **Level 1 — Ad-hoc manual** | SQL files exist, applied manually, no tracking | **← CURRENT** |
| Level 2 — Tracked manual | SQL files + migration history table | NOT YET |
| Level 3 — Runner-assisted | Migration runner (Flyway, Liquibase, `supabase db push`) | NOT YET |
| Level 4 — CI-enforced | Automated migration on merge/deploy | NOT YET |

---

## MIGRATION FILE REGISTRY

### File 1 — `supabase-setup.sql`

| Property | Value |
|---|---|
| **Filename** | `artifacts/mobile/supabase-setup.sql` |
| **Purpose** | Initial schema creation — all base tables, RLS policies, indexes, functions, trigger |
| **Intended execution order** | FIRST — must precede all other migrations; establishes the schema foundation |
| **Believed applied?** | ✅ **APPLIED** — live Supabase DB reflects this file's output |
| **Application method** | Manual SQL Editor execution at project setup |

**Contents summary:**

| Object created | Type | Notes |
|---|---|---|
| `plants` | TABLE | `user_id`, `display_name`, `species_name`, `room_location`, `notes`, timestamps |
| `care_tasks` | TABLE | `plant_id` FK, `task_type`, `frequency_days`, `last_completed_at`, `next_due_at`, `active_status` |
| `care_logs` | TABLE | `plant_id` FK, `task_type`, `completed_at`, `notes` |
| `journal_entries` | TABLE | `plant_id` FK, `content`, `mood` |
| `health_logs` | TABLE | `plant_id` FK, `health_status`, `notes` |
| `plant_care_profiles` | TABLE | `species_name` UNIQUE, care interval fields, `light_requirement` enum CHECK |
| `update_updated_at()` | FUNCTION | Timestamp maintenance for `plants.updated_at` |
| `update_plants_updated_at` | TRIGGER | `BEFORE UPDATE ON plants` — fires `update_updated_at()` |
| RLS `ENABLE` | All tables | Row-level security enabled on all 6 tables |
| RLS policies | Multiple | User ownership policies on user tables; public read on `plant_care_profiles` |

**Governance implications:**
- This file is the single source of truth for the current live schema.
- `plant_care_profiles.light_requirement` CHECK constraint was created without an explicit name — PostgreSQL auto-generated the constraint name. This auto-generated name is assumed by `supabase-migration-v2.sql §B7` — see Migration Ambiguity §1 below.
- RLS policy names created by this file are assumed by `PRE_DATASET_HARDENING_MIGRATION_v1.sql §D` — see Migration Ambiguity §2 below.
- No `canonical_species_id` FK, no `user_entered_name`, no `canonical_species`, no `plant_aliases`, no `collapse_mappings`.

---

### File 2 — `supabase-migration-v2.sql`

| Property | Value |
|---|---|
| **Filename** | `artifacts/mobile/supabase-migration-v2.sql` |
| **Purpose** | Phase 2.1 schema upgrade — adds canonical identity infrastructure to all tables; expands enums; adds three canonical reference tables |
| **Intended execution order** | SECOND — must be applied after `supabase-setup.sql`, before dataset seeding and before shim removal |
| **Believed applied?** | ❌ **UNAPPLIED** — live DB does not contain Phase 2.1 columns or canonical tables |
| **Application method** | Pending — requires manual SQL Editor execution |

**Contents summary by section:**

| Section | Operation | Object | Notes |
|---|---|---|---|
| A1 | `CREATE TABLE IF NOT EXISTS` | `canonical_species` | PLANT_0001-format IDs; species reference data |
| A2 | `CREATE TABLE IF NOT EXISTS` | `plant_aliases` | `canonical_species_id` FK; `alias_name`; `search_priority` |
| A3 | `CREATE TABLE IF NOT EXISTS` | `collapse_mappings` | Multi-score normalization mapping table |
| B1 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `plants.user_entered_name` | Raw species input preservation |
| B2 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `plants.canonical_species_id` | FK to `canonical_species` (nullable) |
| B3 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `plants.canonical_species_name` | Denormalized canonical display name |
| B4 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `plants.species_resolution_method` | Enum: method used for canonical resolution |
| B5 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `care_tasks.canonical_species_id` | FK to `canonical_species` (nullable) |
| B6 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `care_logs.canonical_species_id` | FK to `canonical_species` (nullable) |
| B7 | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` | `plant_care_profiles.light_requirement` | Expands `light_requirement` enum values |
| B8 | `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `plant_care_profiles.canonical_species_id` | FK to `canonical_species` (nullable) |
| C1 | RLS `ENABLE` + policies | `canonical_species` | Public read; no user write |
| C2 | RLS `ENABLE` + policies | `plant_aliases` | Public read; no user write |
| C3 | RLS `ENABLE` + policies | `collapse_mappings` | Public read; no user write |
| D | `CREATE INDEX IF NOT EXISTS` | `plants.canonical_species_id` | Index for canonical FK lookups |

**Governance implications:**
- All `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements are idempotent — safe to re-run if partially applied.
- Section B7 (CHECK constraint recreation) is **NOT idempotent** under all conditions — see Migration Ambiguity §1.
- Sections A1–A3 use `CREATE TABLE IF NOT EXISTS` — idempotent.
- After application: `SELECT *` on `plants` will return all 5 new columns as `null` for all existing rows. The Phase 2.1 shim must remain active until this is confirmed and the shim is deliberately removed.
- After application: `getSchemaMigrationStatus()` (`runtimeValidation.ts:79`) will return `"migrated"` on the next plant fetch — but this function is never called.
- This migration does NOT seed any data. `canonical_species`, `plant_aliases`, and `collapse_mappings` will be empty after application.

---

### File 3 — `PRE_DATASET_HARDENING_MIGRATION_v1.sql`

| Property | Value |
|---|---|
| **Filename** | `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` |
| **Purpose** | Production hardening before dataset seeding — adds UNIQUE partial index, GIN trigram index, recreates RLS policies with verified names |
| **Intended execution order** | THIRD — must be applied after `supabase-migration-v2.sql`, before dataset seeding |
| **Believed applied?** | ❌ **UNAPPLIED** — GIN index and UNIQUE partial index are absent from live DB |
| **Application method** | Pending — requires manual SQL Editor execution |

**Contents summary by section:**

| Section | Operation | Object | Notes |
|---|---|---|---|
| A | `CREATE UNIQUE INDEX IF NOT EXISTS` | `care_tasks (plant_id, task_type) WHERE active_status = true` | Prevents duplicate active care tasks per plant per type |
| B | `CREATE EXTENSION IF NOT EXISTS pg_trgm` | Extension | Required for GIN trigram index |
| C | `CREATE INDEX IF NOT EXISTS` | `plant_aliases.alias_name gin_trgm_ops` | Enables fast trigram-based alias search |
| D | `DROP POLICY IF EXISTS` + `CREATE POLICY` | All user tables | Recreates RLS policies with governance-verified names |

**Governance implications:**
- Section A UNIQUE partial index is the **DB-level backstop** against duplicate active care tasks. Without it, only the application-level guard in `generateDefaultCareTasks` (which checks `active_status = true`) prevents duplicates.
- Section C GIN index covers only `plant_aliases.alias_name`. It does NOT add a trigram index to `plant_care_profiles.species_name`. Post-dataset seeding, the ilike fallback on care profiles remains an unindexed sequential scan.
- Section D assumes RLS policy names from `supabase-setup.sql`. If Dashboard-created policies have different auto-generated names, `DROP POLICY IF EXISTS` silently does nothing and duplicate policies accumulate — see Migration Ambiguity §2.
- This file is largely idempotent (`IF NOT EXISTS`, `IF EXISTS`) but RLS policy recreation is not fully idempotent if name assumptions fail.

---

## CONFIRMED RUNTIME STATE

### Canonical Infrastructure: Confirmed Live vs. Absent

| Infrastructure component | Confirmed LIVE in Supabase DB? | Basis for determination |
|---|---|---|
| `plants` table (base columns) | ✅ LIVE | App creates and reads plants successfully |
| `care_tasks` table | ✅ LIVE | Task generation and watering mutations succeed |
| `care_logs` table | ✅ LIVE | `useWaterPlant` inserts to `care_logs` without error |
| `journal_entries` table | ✅ LIVE (structure only) | Defined in setup; no app UI populates it |
| `health_logs` table | ✅ LIVE (structure only) | Defined in setup; no app UI populates it |
| `plant_care_profiles` table | ✅ LIVE — approximately 46 rows | ilike resolution produces results for known species |
| `update_updated_at()` function | ✅ LIVE | Inferred from trigger presence |
| `update_plants_updated_at` trigger | ✅ LIVE | `plants.updated_at` updates on edit |
| RLS on all base tables | ✅ LIVE | Users cannot access other users' plants |
| `canonical_species` table | ❌ ABSENT | No canonical_species_id is ever populated |
| `plant_aliases` table | ❌ ABSENT | `lookupByAlias` returns error if uncommented; table absent |
| `collapse_mappings` table | ❌ ABSENT | No query code exists; not queried |
| `plants.canonical_species_id` column | ❌ ABSENT | Column not in PostgREST response (returns `undefined`) |
| `plants.user_entered_name` column | ❌ ABSENT | Column not in PostgREST response (returns `undefined`) |
| `plants.canonical_species_name` column | ❌ ABSENT | Column not in PostgREST response |
| `plants.species_resolution_method` column | ❌ ABSENT | Column not in PostgREST response |
| `care_tasks.canonical_species_id` column | ❌ ABSENT | Not in PostgREST response |
| `care_logs.canonical_species_id` column | ❌ ABSENT | Not in PostgREST response |
| `plant_care_profiles.canonical_species_id` column | ❌ ABSENT | Not queried; not in response |
| UNIQUE partial index on `care_tasks` | ❌ ABSENT | No hardening migration applied |
| GIN trigram index on `plant_aliases.alias_name` | ❌ ABSENT | No hardening migration applied |
| `pg_trgm` extension | ❓ UNCERTAIN | May or may not be enabled on this Supabase instance |

---

### Runtime Activations: Confirmed OFF

The following runtime behaviors are confirmed inactive. They cannot activate without source code changes:

| Runtime behavior | Status | Why it cannot self-activate |
|---|---|---|
| Canonical ID lookup (`canonical_id_lookup`) | ❌ OFF | Function body commented out; call site commented out — two independent comment barriers |
| Alias lookup (`alias_lookup`) | ❌ OFF | Same double-comment barrier; `plant_aliases` table absent |
| Collapse normalization | ❌ OFF | No code exists at any layer |
| Seasonal scheduler adjustment | ❌ OFF | All seasonal routing slots commented out |
| Phase 2.1 field persistence | ❌ OFF | Shim strips all 4 fields before every DB write |
| `SpeciesResolutionContext` logging | ❌ OFF | Context discarded at every call site |
| `getSchemaMigrationStatus()` gate | ❌ OFF | Zero call sites — function is compiled but inert |
| Canonical propagation | ❌ OFF | No propagation mechanism exists at any layer |
| Scheduler rebinding | ❌ OFF | No rebinding mechanism exists at any layer |

---

### Coexistence-Safe State

The live runtime is confirmed in a **coexistence-safe state** as of this baseline freeze:

1. **INSERT/UPDATE safety:** Phase 2.1 shim (`usePlants.ts:49–66, 106–116`) strips all Phase 2.1 fields from every plant write. No `400 Bad Request` from absent columns.

2. **SELECT safety:** `PLANT_SELECT = "*, care_tasks(*)"` returns only existing columns. Absent Phase 2.1 columns appear as `undefined` in JavaScript — correctly handled by TypeScript optional field typing.

3. **Resolution safety:** `resolveSpeciesProfile` routes to `lookupBySpeciesNameIlike` only. ilike query targets `plant_care_profiles` which exists with live data.

4. **Task generation safety:** `generateDefaultCareTasks` guard checks for existing active tasks before inserting. DB-level UNIQUE index absent (hardening not applied) — application guard is the sole protection.

5. **Auth safety:** Session check at startup is read-only. Token refresh is automatic and non-destructive. Auth state changes do not trigger any schema mutation.

---

## KNOWN MIGRATION AMBIGUITIES

### Ambiguity 1 — CHECK constraint name on `plant_care_profiles.light_requirement`

**File:** `supabase-migration-v2.sql §B7`  
**Risk level:** HIGH — most dangerous single statement in the pending migrations

**The issue:**  
`supabase-setup.sql` creates the `light_requirement` CHECK constraint without an explicit `CONSTRAINT name` clause:

```sql
CHECK (light_requirement IN ('low', 'medium', 'bright_indirect', 'full_sun'))
```

PostgreSQL auto-generates a constraint name using the pattern `{table}_{column}_check` — likely `plant_care_profiles_light_requirement_check`. `supabase-migration-v2.sql §B7` assumes this exact name:

```sql
ALTER TABLE plant_care_profiles
  DROP CONSTRAINT IF EXISTS plant_care_profiles_light_requirement_check;
ALTER TABLE plant_care_profiles
  ADD CONSTRAINT plant_care_profiles_light_requirement_check
    CHECK (light_requirement IN ('low','medium','bright_indirect','full_sun',
                                 'low_light','medium_indirect','direct_sun'));
```

**If the auto-generated name differs:**  
`DROP CONSTRAINT IF EXISTS` silently succeeds (does nothing). `ADD CONSTRAINT` creates a second CHECK constraint. PostgreSQL evaluates multiple CHECK constraints with AND semantics. The old constraint accepts only the original 4 values; the new constraint accepts 7. Any INSERT or UPDATE with a new value (e.g., `'low_light'`) passes the new constraint but fails the old one → `400 Bad Request` on write.

**Pre-migration verification required:**

```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'plant_care_profiles'::regclass
  AND contype = 'c'
  AND conname LIKE '%light_requirement%';
```

If the returned `conname` differs from `plant_care_profiles_light_requirement_check`, update the migration SQL before executing.

**Supabase/Replit divergence risk:** PostgreSQL constraint naming is deterministic when constraints are created via SQL. However, if the `plant_care_profiles` table or its CHECK constraint was modified via the Supabase Dashboard Table Editor (which may use different SQL generation), the auto-generated name may differ.

---

### Ambiguity 2 — RLS policy names assumed in `PRE_DATASET_HARDENING_MIGRATION_v1.sql`

**File:** `PRE_DATASET_HARDENING_MIGRATION_v1.sql §D`  
**Risk level:** MEDIUM

**The issue:**  
The hardening migration drops and recreates RLS policies by name (e.g., `"care_tasks: insert own"`, `"care_logs: select own"`). These names were defined in `supabase-setup.sql`. If any policy was recreated via the Supabase Dashboard (which generates names like `policy_1`, `Enable read access for all users`, or other auto-generated formats), the `DROP POLICY IF EXISTS "care_tasks: insert own"` silently does nothing, and the `CREATE POLICY` adds a second permissive policy.

**Effect of duplicate permissive policies:**  
PostgreSQL evaluates multiple `FOR SELECT` permissive policies with OR semantics — a user passes if ANY permissive policy allows them. For ownership-scoped policies (`USING (user_id = auth.uid())`), duplicate policies produce no incorrect access (both policies produce the same decision). The policy list becomes dirty but functionally correct.

For `INSERT` and `UPDATE` policies (which use `WITH CHECK`), duplicate policies are also evaluated with OR — functionally correct for identical `WITH CHECK` clauses, but ambiguous for future policy modifications.

**Pre-migration verification required:**

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'plants', 'care_tasks', 'care_logs',
    'journal_entries', 'health_logs'
  )
ORDER BY tablename, policyname;
```

Compare returned policy names against names assumed in `PRE_DATASET_HARDENING_MIGRATION_v1.sql §D`. Update the DROP names in the migration if they differ.

---

### Ambiguity 3 — Applied/unapplied state relies on schema inspection, not a migration table

**Risk level:** MEDIUM

There is no `schema_migrations` table. The only way to confirm whether `supabase-migration-v2.sql` has been applied is to check for the existence of Phase 2.1 columns:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plants'
  AND column_name = 'canonical_species_id';
-- 1 row = applied; 0 rows = not applied
```

And for the hardening migration — check for the UNIQUE partial index:

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'care_tasks'
  AND indexname = 'care_tasks_active_unique';
-- 1 row = applied; 0 rows = not applied
```

These queries are the migration state oracle. They must be run before each migration execution to confirm starting conditions.

---

### Ambiguity 4 — `pg_trgm` extension availability on the Supabase-managed instance

**File:** `PRE_DATASET_HARDENING_MIGRATION_v1.sql §B`  
**Risk level:** LOW — Supabase enables `pg_trgm` by default on all managed instances

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Supabase's managed PostgreSQL instances have `pg_trgm` available as a pre-packaged extension. `CREATE EXTENSION IF NOT EXISTS` is idempotent — it succeeds silently whether or not the extension is already enabled. This ambiguity is low-risk but should be confirmed:

```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
-- 1 row = already enabled; 0 rows = will be enabled by migration
```

---

### Ambiguity 5 — `plant_care_profiles` row count and data integrity

**Risk level:** LOW  
**Basis:** Inferred from successful ilike resolution for known species during app usage.

The live `plant_care_profiles` table contains approximately 46 rows (the count at which the table was authored in `supabase-setup.sql`). However:

- No verification query has been run against the live DB to confirm the exact row count
- No check confirms whether any rows were added, modified, or deleted since initial setup via the Supabase Dashboard
- No check confirms whether `canonical_species_id` was manually backfilled on any row

**Pre-dataset-seeding verification required:**

```sql
SELECT COUNT(*) FROM plant_care_profiles;

-- Check for any non-null canonical_species_id (should be 0 pre-Phase-2.2)
SELECT COUNT(*) FROM plant_care_profiles WHERE canonical_species_id IS NOT NULL;

-- Confirm no orphaned or duplicate species names
SELECT species_name, COUNT(*) FROM plant_care_profiles
GROUP BY species_name HAVING COUNT(*) > 1;
```

---

### Ambiguity 6 — PostgREST schema cache lag between migration execution and API availability

**Risk level:** MEDIUM — time-bounded, resolves automatically  

Supabase's PostgREST service caches the database schema in memory and reloads it on a configurable interval. When `supabase-migration-v2.sql` is applied, there may be a lag (seconds to low minutes) between:

- SQL statements completing successfully in PostgreSQL
- PostgREST serving the new schema (new columns appearing in SELECT responses)

During this window:
- The Phase 2.1 shim must remain active even if the migration is confirmed applied at the SQL level
- `getSchemaMigrationStatus()` (if called) would return `"not_migrated"` because PostgREST responses do not yet include the new columns

**Verification before shim removal:**

```http
GET /rest/v1/plants?select=canonical_species_id&limit=1
Authorization: Bearer <anon key>
```

If `canonical_species_id` appears in the response (even as `null`), PostgREST has loaded the new schema. If the column is absent from the response (`undefined` in JavaScript), PostgREST cache has not yet refreshed.

---

### Ambiguity 7 — Missing migration lineage controls (structural gap)

**Risk level:** HIGH — systemic governance gap

The following migration governance controls are absent and have no defined path to introduction:

| Missing control | Impact |
|---|---|
| No `schema_migrations` table | Cannot programmatically confirm applied state |
| No migration checksums | Cannot detect whether a migration file was modified after partial application |
| No rollback scripts | No documented path to reverse any migration; all changes are forward-only |
| No migration ordering enforcement | Nothing prevents applying File 3 before File 2 |
| No idempotency guarantee for all statements | Section B7 of File 2 and Section D of File 3 are not fully idempotent |
| No audit trail | No log of who applied what and when |
| No staging environment | Migrations are authored against the live DB with no pre-production validation |

---

## GOVERNANCE CONCLUSIONS

### Current Migration Governance Maturity

**Classification: Level 1 — Ad-hoc manual execution with structured documentation**

PLANTMON's migration governance is at Level 1 maturity. This is appropriate for a pre-production solo development phase but carries real risk as the project approaches data-bearing production state (post-dataset seeding, post-Phase-2.2 activation).

**What is working at Level 1:**
- SQL migration files are version-controlled in the Replit repository
- Migration files are internally ordered by naming convention (`setup.sql` → `migration-v2.sql` → `PRE_DATASET_HARDENING_MIGRATION_v1.sql`)
- Most statements use `IF NOT EXISTS` / `IF EXISTS` guards for partial idempotency
- The governance audit corpus provides the documentation that a migration runner would otherwise generate automatically
- The Phase 2.1 shim provides a safe coexistence layer during the migration gap

**What is not working at Level 1:**
- No applied/unapplied tracking
- No automated ordering enforcement
- No staging environment
- Two migrations pending simultaneously with no formal gate between them
- Constraint name assumptions that could cause silent data corruption (Ambiguity 1)

---

### Future Hardening Requirements

The following hardening steps are required before PLANTMON migrations can be considered production-grade:

**Tier 1 — Required before Phase 2.1 migration execution:**
1. Run the CHECK constraint name detection query (Ambiguity 1) and correct `supabase-migration-v2.sql §B7` if the live name differs
2. Run the RLS policy name detection query (Ambiguity 2) and correct `PRE_DATASET_HARDENING_MIGRATION_v1.sql §D` if live names differ
3. Confirm PostgREST schema cache refresh before shim removal (Ambiguity 6)

**Tier 2 — Required before dataset seeding:**
4. Verify `plant_care_profiles` row count and data integrity (Ambiguity 5)
5. Apply `PRE_DATASET_HARDENING_MIGRATION_v1.sql` to add the UNIQUE partial index before seeding creates care task associations

**Tier 3 — Required before Phase 2.2 activation:**
6. Create a `schema_migrations` tracking table in the live DB
7. Author rollback scripts for each applied migration
8. Define a staging Supabase project for migration pre-validation
9. Establish a `supabase gen types typescript` codegen step to eliminate manual type/schema synchronization

---

### Operational Sequencing Risks

The following sequencing violations would cause runtime failures or data corruption:

| Violation | Consequence | Recovery path |
|---|---|---|
| Remove Phase 2.1 shim BEFORE applying `supabase-migration-v2.sql` | `400 Bad Request` on every `plants` INSERT and UPDATE — app broken for all users | Re-add shim; apply migration; remove shim |
| Apply `supabase-migration-v2.sql` but leave shim permanently | Phase 2.1 fields stripped on every write forever — silent data loss, canonical identity never activates | Remove shim (requires app release) |
| Apply `PRE_DATASET_HARDENING_MIGRATION_v1.sql` BEFORE `supabase-migration-v2.sql` | `plant_aliases` table doesn't exist — GIN index creation fails; `canonical_species` table doesn't exist — FK constraints fail | Apply `supabase-migration-v2.sql` first |
| Seed `plant_care_profiles` BEFORE applying hardening migration | No UNIQUE partial index on `care_tasks` — duplicate active task risk during seeding; no GIN index on `plant_aliases` — alias search performance degraded from first use | Apply hardening migration; reseed |
| Activate Phase 2.2 routing BEFORE canonical_species seeding | `lookupByCanonicalId` returns null for all plants — falls through to ilike (benign) or alias lookup (table absent) — PostgREST error on alias lookup | Seed canonical_species; seed plant_aliases; then activate |
| Apply `supabase-migration-v2.sql` WITHOUT running constraint name check | Duplicate CHECK constraint on `plant_care_profiles.light_requirement` — all writes with new `light_requirement` values rejected | Drop the old constraint by its actual name via SQL Editor |

**Safe execution sequence:**

```
1. Run pre-migration verification queries (Ambiguities 1, 2, 5)
2. Apply supabase-migration-v2.sql
3. Confirm PostgREST serving new columns
4. Apply PRE_DATASET_HARDENING_MIGRATION_v1.sql
5. Confirm UNIQUE index and GIN index exist
6. Seed plant_care_profiles (dataset seeding — Phase B2.1)
7. Seed canonical_species, plant_aliases (Phase 2.2 prerequisite)
8. Remove Phase 2.1 shim
9. Activate Phase 2.2 routing slots
```

Steps 1–5 must be executed in this order. Steps 6–9 may be distributed across separate deployment events.

---

## LEDGER SUMMARY

| Migration file | Applied? | Safe to apply now? | Blocks |
|---|---|---|---|
| `supabase-setup.sql` | ✅ APPLIED | N/A | Nothing |
| `supabase-migration-v2.sql` | ❌ UNAPPLIED | ⚠️ After constraint name check | Phase 2.1 field persistence; shim removal |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | ❌ UNAPPLIED | ⚠️ After File 2 + RLS name check | Dataset seeding; UNIQUE index protection |

**Total tables in live DB:** 6 (plants, care_tasks, care_logs, journal_entries, health_logs, plant_care_profiles)  
**Total tables pending creation:** 3 (canonical_species, plant_aliases, collapse_mappings)  
**Total columns pending addition:** 6 (4 on plants, 1 on care_tasks, 1 on care_logs, 1 on plant_care_profiles)  
**Total indexes pending creation:** 2 (UNIQUE partial on care_tasks, GIN trigram on plant_aliases)  
**Total RLS policies pending recreation:** Multiple (all user-table policies in §D)  

---

*This document is a read-only migration execution ledger. No SQL was executed, no migration files were modified, and no live schema was altered in its generation. Supersede only by updating after a confirmed migration execution event.*
