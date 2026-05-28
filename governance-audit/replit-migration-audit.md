# PLANTMON — Migration Lineage Audit

**Scope:** Entire workspace — all SQL files, migration files, and schema-affecting operations  
**Type:** Read-only migration lineage documentation  
**Generated:** May 2026  
**Based on:** Phase B1.75 Runtime Topology Audit + Phase B2.0 migration generation  

---

## EXECUTIVE SUMMARY

PLANTMON has **three SQL files** that affect the database schema. None use a migrations folder, migration runner, or metadata tracking table. Two of the three files are confirmed unapplied against the live Supabase database. The third (setup.sql) is destructive and should never be applied to the live DB.

No migrations exist yet for:
- canonical_species dataset synchronization
- plant_aliases dataset synchronization
- collapse_mappings dataset synchronization
- plant_care_profiles → canonical_species propagation (FK backfill)
- plants → canonical_species backfill (existing user plants)
- Enum value normalization (legacy → canonical enum values on existing rows)

These are all pending future work. Their absence is the primary migration lineage gap.

---

## 1 — ALL MIGRATION FILES

### Complete Migration File Registry

| # | Filename | Type | Applied to Live DB | Safe for Live DB | Phase |
|---|---|---|---|---|---|
| 1 | `artifacts/mobile/supabase-setup.sql` | Full reset schema | ❌ NO (destructive) | ❌ NEVER | Original setup |
| 2 | `artifacts/mobile/supabase-migration-v2.sql` | Additive structural migration | ❌ NOT YET APPLIED | ✅ YES | Phase 2.1 |
| 3 | `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Index + RLS hardening | ❌ NOT YET APPLIED | ✅ YES | Phase B2.0 |

**Absence of further migration files:**

The following migration categories are **not represented by any SQL file** in the project:

| Category | Status |
|---|---|
| canonical_species dataset seeding | ❌ NO FILE — Phase B2.1 (future) |
| plant_aliases dataset seeding | ❌ NO FILE — Phase B2.2 (future) |
| collapse_mappings dataset seeding | ❌ NO FILE — Phase B2.3 (future) |
| plant_care_profiles → canonical_species FK backfill | ❌ NO FILE — Phase B2.1 (future) |
| Enum value normalization (legacy → canonical) | ❌ NO FILE — future |
| plants backfill (canonical_species_id for existing plants) | ❌ NO FILE — Phase 2.2 (future) |
| care_tasks backfill (canonical_species_id for existing tasks) | ❌ NO FILE — Phase 2.2 (future) |

---

## 2 — MIGRATION ORDERING AND TIMESTAMPS

### Ordering Mechanism

There is **no timestamp-based, sequence-numbered, or hash-tracked migration ordering** in this project. No migration runner (Flyway, Liquibase, Alembic, Drizzle migrate, Prisma migrate) is configured. No `schema_migrations` tracking table exists in the Supabase DB.

Migration execution order is determined entirely by:
- Documentation (this file, `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md`, `RUNTIME_TOPOLOGY_AUDIT_v1.md`)
- Phase naming conventions (`v2`, `B2.0`)
- Manual discipline by the developer

### Intended Execution Order

```
ORDER  FILENAME                                    PREREQS
──────────────────────────────────────────────────────────────────────────────
  1.   supabase-setup.sql                          Fresh install ONLY.
       [NOT for live DB — destructive]              Never run on DB with user data.

  2.   supabase-migration-v2.sql                   Must run after confirming
       [PENDING — live DB]                          live DB is on v0.1 baseline.
                                                   Status: UNAPPLIED

  3.   PRE_DATASET_HARDENING_MIGRATION_v1.sql      Must run after step 2 is
       [PENDING — live DB]                          confirmed applied.
                                                   Status: UNAPPLIED

  [Future — not yet written]
  4.   canonical_species seeding                   After step 3.
  5.   plant_care_profiles FK backfill             After step 4.
  6.   plant_aliases seeding                       After step 4.
  7.   collapse_mappings seeding                   After step 4.
  8.   plants canonical backfill                   After steps 4–6.
  9.   Enum value normalization                    After step 5.
```

### Ordering Governance Risks

| Risk | Severity | Notes |
|---|---|---|
| No migration metadata table in DB | HIGH | No way to query the live DB to know which migrations have been applied. Tracking must be done manually. |
| Steps 2 and 3 have no ordering guard | MEDIUM | Nothing prevents step 3 from being run before step 2. Running the hardening migration before `supabase-migration-v2.sql` would fail on `plant_aliases` (table doesn't exist). |
| No timestamps on SQL files | LOW | File modification time is not a reliable ordering mechanism. Files could be renamed or copied without preserving ordering intent. |
| No CI/CD integration | LOW | No automated system prevents running migrations in the wrong order or running step 1 against a live DB. |

---

## 3 — CANONICAL SYNCHRONIZATION MIGRATIONS

### `canonical_species` — Table Creation

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Section A1  
**Purpose:** Creates the `canonical_species` table — the immutable operational identity registry.  
**Status:** UNAPPLIED (table does not exist in live Supabase)

**What it creates:**
```sql
CREATE TABLE IF NOT EXISTS canonical_species (
  canonical_species_id  TEXT        PRIMARY KEY,
  species_name          TEXT        NOT NULL,
  primary_archetype     TEXT,
  mainstream_priority   INTEGER,
  india_relevance       INTEGER,
  inventory_version     TEXT,
  identity_status       TEXT        NOT NULL DEFAULT 'active'
                          CHECK (identity_status IN ('active','deprecated','review_required')),
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- + 2 indexes + RLS policy
```

**Runtime impact:** Zero until data is seeded. Table will be empty post-migration. No application code queries this table yet.

**Governance risk observations:**
- `canonical_species_id` is `TEXT PRIMARY KEY` with format `PLANT_0001`. There is no DB sequence or auto-generation enforcing this format — it must be enforced at the seeding layer.
- No UNIQUE constraint on `species_name` beyond what uniqueness the primary key implies on `canonical_species_id`. Two canonical entries could share the same `species_name` (e.g., different synonyms both made canonical). This is by design — `species_name` is a display field, not an operational identifier.
- No `INSERT` or `UPDATE` RLS policy — this is an admin-only table by intent. Application users can only SELECT.

---

### `canonical_species` — Data Seeding

**File:** NONE — **no seeding migration exists**  
**Status:** Phase B2.1 (future work — not started)

**Governance risk observations:**
- The entire Phase 2.2 identity system depends on `canonical_species` being populated before any alias or collapse mapping is seeded (FK constraint: `plant_aliases.canonical_species_id REFERENCES canonical_species`).
- No canonical species CSV, JSON, or SQL seed file has been defined yet.
- `PLANT_0001`-format ID assignment requires a numbering authority — no governance document defines who generates these IDs or what numbering range is allocated.
- `inventory_version` column exists for dataset tracking but no versioning convention has been documented.

---

### `canonical_species_id` FK Columns — Propagation to Operational Tables

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Section D  
**Purpose:** Adds `canonical_species_id TEXT NULLABLE REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL` to 4 operational tables: `care_tasks`, `care_logs`, `journal_entries`, `health_logs`.  
**Status:** UNAPPLIED

**Runtime impact:** After migration, these columns exist but remain `NULL` for all rows. Application code does not populate them yet (Phase 2.2 activation required).

**Governance risk observations:**
- `ON DELETE SET NULL` means deleting a canonical species entry does not cascade-delete care tasks or logs — it simply NULLs the FK. This preserves historical data but severs the canonical link permanently. Appropriate for an identity table that should never delete entries anyway (`identity_status = 'deprecated'` is the governance-safe alternative).
- All 4 columns are nullable by design — no backfill is required at migration time.
- Post-migration, `care_logs` rows inserted by `useWaterPlant()` will still have `canonical_species_id = NULL` because the application code does not yet populate this field (known gap documented in topology audit).

---

### `plant_care_profiles` — Canonical FK Column Addition

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Section B1  
**Purpose:** Adds `canonical_species_id` FK to `plant_care_profiles`, enabling profile lookup by canonical ID rather than by `ilike(species_name)`.  
**Status:** UNAPPLIED

**Runtime impact:** After migration, the column exists but is `NULL` for all 46 existing care profile rows. The ilike lookup path continues to operate unchanged. The canonical lookup path in `lib/careProfiles.ts` remains commented out until Phase 2.2.

**Governance risk observations:**
- 46 existing care profile rows need a FK backfill to assign their `canonical_species_id`. This backfill cannot happen until `canonical_species` table is populated (step 4 in migration order). No backfill migration file exists yet.
- Until the backfill is complete, the `canonical_species_id` column on `plant_care_profiles` is cosmetically present but operationally useless. The ilike fallback remains the active path.

---

## 4 — ALIAS SYNCHRONIZATION MIGRATIONS

### `plant_aliases` — Table Creation

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Section A2  
**Purpose:** Creates the `plant_aliases` table — the recognition and onboarding normalization layer.  
**Status:** UNAPPLIED (table does not exist in live Supabase)

**What it creates:**
```sql
CREATE TABLE IF NOT EXISTS plant_aliases (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name            TEXT        NOT NULL,
  canonical_species_name TEXT       NOT NULL,
  canonical_species_id  TEXT        NOT NULL
                          REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE,
  alias_type            TEXT        NOT NULL
                          CHECK (alias_type IN (
                            'common_name','cultivar_name','regional_name',
                            'nursery_name','beginner_name'
                          )),
  language_region       TEXT,
  search_priority       INTEGER     NOT NULL DEFAULT 0,
  alias_confidence      FLOAT       NOT NULL DEFAULT 1.0
                          CHECK (alias_confidence BETWEEN 0 AND 1),
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- + 3 btree indexes + RLS policy
```

**Runtime impact:** Zero until data is seeded. No application code queries this table yet.

**Governance risk observations:**
- `ON DELETE CASCADE` from `canonical_species`: if a canonical species entry is ever deleted, ALL its aliases are deleted automatically. This is aggressive — it could silently destroy alias data if a canonical entry is mistakenly deleted. The governance protection is that canonical entries should be `deprecated` rather than deleted.
- The `alias_name` btree index does not support `ilike '%text%'` substring search efficiently. The GIN trigram index (`PRE_DATASET_HARDENING_MIGRATION_v1.sql` §B2) addresses this, but must be run after `supabase-migration-v2.sql` creates the table.
- `canonical_species_name` is a denormalized display helper — it must be kept in sync with `canonical_species.species_name` if species names ever change. No trigger or constraint enforces this sync.
- No `UNIQUE` constraint on `(alias_name, canonical_species_id)` — the same alias string could map to the same canonical species multiple times (e.g., `alias_type = 'common_name'` and `alias_type = 'nursery_name'` both with `alias_name = 'Snake Plant'` pointing to the same canonical). This is probably acceptable, but it means deduplication must be handled at the seeding layer.

---

### `plant_aliases` — Data Seeding

**File:** NONE — **no alias seeding migration exists**  
**Status:** Phase B2.2 (future work — not started)

**Governance risk observations:**
- Alias seeding is a prerequisite for Phase 2.2 alias-based species autocomplete.
- Alias seeding cannot begin until `canonical_species` table is populated (FK constraint).
- No alias dataset (CSV, JSON) has been defined or sourced yet.
- The GIN trigram index (`PRE_DATASET_HARDENING_MIGRATION_v1.sql` §B2) is designed to be built before alias data is seeded, so construction is instant. If aliases are seeded first and the index is added after, construction will be slower proportional to dataset size.

---

### `plant_aliases` — Index Hardening (Trigram)

**File:** `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` — Section B  
**Purpose:** Creates `pg_trgm` extension and GIN trigram index on `plant_aliases.alias_name` for accelerated `ilike` search.  
**Status:** UNAPPLIED — depends on `supabase-migration-v2.sql` being applied first (table must exist)

**Runtime impact:** Zero until alias data is seeded. When aliases are seeded, all `ILIKE '%text%'` queries on `alias_name` use the index instead of a sequential scan.

---

## 5 — COLLAPSE_MAPPINGS MIGRATIONS

### `collapse_mappings` — Table Creation

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Section A3  
**Purpose:** Creates the `collapse_mappings` table — the operational normalization layer mapping variant species inputs to one canonical identity.  
**Status:** UNAPPLIED (table does not exist in live Supabase)

**What it creates:**
```sql
CREATE TABLE IF NOT EXISTS collapse_mappings (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  collapsed_species_name      TEXT    NOT NULL,
  canonical_species_name      TEXT    NOT NULL,
  canonical_species_id        TEXT    NOT NULL
                                REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE,
  collapse_reason             TEXT,
  operational_similarity      FLOAT   CHECK (operational_similarity BETWEEN 0 AND 1),
  consumer_recognition_overlap FLOAT  CHECK (consumer_recognition_overlap BETWEEN 0 AND 1),
  collapse_confidence         FLOAT   CHECK (collapse_confidence BETWEEN 0 AND 1),
  review_notes                TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- + 2 indexes + RLS policy
```

**Runtime impact:** Zero until data is seeded. No application code queries this table.

**Governance risk observations:**
- `ON DELETE CASCADE` from `canonical_species`: same risk as `plant_aliases` — deleting a canonical entry deletes all its collapse mappings.
- Three confidence score columns (`operational_similarity`, `consumer_recognition_overlap`, `collapse_confidence`) are all nullable. No constraint enforces that any of them are populated. A collapse mapping with all three as `NULL` provides no confidence signal.
- No `UNIQUE` constraint on `collapsed_species_name` — the same input species could collapse to multiple canonical targets. The Collapse Governance Ruleset (`PLANTMON — COLLAPSE GOVERNANCE RULESET v1`) prohibits multi-hop collapse chains, but the DB does not enforce this. Enforcement must be at the seeding governance layer.
- `canonical_species_name` is denormalized (same sync risk as in `plant_aliases`).

---

### `collapse_mappings` — Data Seeding

**File:** NONE — **no collapse_mappings seeding migration exists**  
**Status:** Phase B2.3 (future work — not started, lower priority than aliases for MVP)

**Governance risk observations:**
- The Collapse Governance Ruleset (`PLANTMON — COLLAPSE GOVERNANCE RULESET v1`) is a comprehensive governance document defining what may and may not be collapsed. However, no corresponding data file has been generated from it yet.
- Collapse mappings are optional for MVP — the alias system alone is sufficient for initial Phase 2.2 onboarding. Collapse mappings add the normalization layer for species variants (e.g., multiple Monstera cultivars collapsing to one operational identity).

---

## 6 — PLANT_CARE_PROFILES PROPAGATION MIGRATIONS

### Additive Column Migrations — Phase 2.1

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Sections B1–B7  
**Purpose:** Adds 20+ new columns to the existing `plant_care_profiles` table.  
**Status:** UNAPPLIED

**Columns added by section:**

| Section | Columns Added |
|---|---|
| B1 | `canonical_species_id` (FK) |
| B2 | `watering_frequency_spring`, `_summer`, `_autumn`, `_winter` |
| B3 | `fertilizing_frequency_spring`, `_summer`, `_autumn`, `_winter` |
| B4 | `watering_method`, `watering_method_description`, `fertilizing_method`, `fertilizing_method_description`, `repotting_method`, `repotting_signs`, `repotting_method_description`, `repotting_frequency_months` |
| B5 | `plant_profile`, `seasonal_adjustments`, `care_alerts` |
| B6 | `placement_guidance`, `suggested_location` |
| B7 | CHECK constraint expansion (light_requirement + difficulty_level) |

**Runtime impact:** After migration, all 46 existing care profile rows have all new columns set to `NULL`. The ilike lookup path continues to return these rows with `NULL` values in new columns, which is safe because `lib/careProfiles.ts` only reads the legacy columns currently.

**Governance risk observations:**
- All 20+ new columns are nullable — no backfill is required at migration time. This is correct for additive safety but means the columns are operationally inert until data is authored.
- The seasonal frequency columns (`watering_frequency_spring` etc.) require a data authoring pass against all 46 existing care profiles before the seasonal scheduler can be activated. This is a significant content authoring task.
- The semantic intelligence columns (`plant_profile`, `seasonal_adjustments`, `care_alerts`) require authored text content per species. No content generation plan exists yet.
- Section B7 (CHECK constraint expansion) is the operationally riskiest part of the migration: it `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`. If the live DB's `plant_care_profiles` table has a differently-named CHECK constraint (e.g., from an earlier schema iteration), the `DROP` will silently do nothing and the `ADD` will create a second constraint. Two CHECK constraints on the same column are additive in PostgreSQL — the row must satisfy both.

---

### plant_care_profiles — `canonical_species_id` FK Backfill

**File:** NONE — **no backfill migration exists**  
**Status:** Phase B2.1 (future work — must be done after canonical_species seeding)

**What it would do:** For each row in `plant_care_profiles`, look up the matching `canonical_species_id` from the `canonical_species` table by `species_name` matching, then `UPDATE plant_care_profiles SET canonical_species_id = ... WHERE species_name = ...`.

**Governance risk observations:**
- This backfill requires the `canonical_species` table to be seeded first.
- The match must be exact (or controlled approximate) — a fuzzy `species_name` match between care profiles and canonical species could assign the wrong canonical ID to a profile, causing mis-scheduled care for all plants of that species.
- 46 care profiles exist. Each needs exactly one canonical species assignment. Some species names in care profiles may differ slightly from canonical species names (e.g., `Rosmarinus officinalis` in care profiles vs whatever name the canonical dataset uses). A curated mapping file may be needed.
- Once backfilled, `plant_care_profiles.canonical_species_id` must be kept in sync if care profile species names are ever corrected.

---

### Enum Value Normalization — Legacy → Canonical

**File:** NONE — **no normalization migration exists**  
**Status:** Future work (not scoped, not planned for MVP)

**What it would do:** `UPDATE plant_care_profiles SET light_requirement = 'low_light' WHERE light_requirement = 'low'`, etc. for all 6 legacy → canonical enum mappings.

**Governance risk observations:**
- 46 existing rows use legacy values. Until normalized, the dual-value CHECK constraint and TypeScript union types must remain active.
- Normalization is a prerequisite for deprecating `LightRequirementLegacy`, `DifficultyLevelLegacy`, and related union types from the TypeScript codebase.
- Safe to defer — the coexistence layer handles both values. But deprecation cannot happen until this migration runs.

---

## 7 — COEXISTENCE-RELATED MIGRATIONS

The Phase 2.1 migration (`supabase-migration-v2.sql`) is itself the primary coexistence migration. Every design decision in it was made to allow old and new schema states to coexist safely.

### Coexistence Design Decisions in `supabase-migration-v2.sql`

| Design Decision | SQL Pattern | Coexistence Purpose |
|---|---|---|
| All new columns are nullable | `ADD COLUMN IF NOT EXISTS col TEXT` | Existing rows are unaffected; no data migration required |
| New FK columns use `ON DELETE SET NULL` | `REFERENCES canonical_species ON DELETE SET NULL` | Losing a canonical entry doesn't delete operational data |
| `CREATE TABLE IF NOT EXISTS` for all 3 new tables | `IF NOT EXISTS` guard | Safe to re-run; idempotent |
| `ADD COLUMN IF NOT EXISTS` for all column additions | `IF NOT EXISTS` guard | Safe to re-run; idempotent |
| `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` for enum expansion | Replaces CHECK with expanded set | Old enum values remain valid; new values become accepted |
| `CREATE INDEX IF NOT EXISTS` for all new indexes | `IF NOT EXISTS` guard | Safe to re-run; no duplicate index error |
| `DROP POLICY IF EXISTS` + `CREATE POLICY` for RLS | Replaces policy cleanly | Policy can be updated without error if already present |

### Application-Layer Coexistence Migration

**File:** `artifacts/mobile/hooks/usePlants.ts` — Phase 2.1 shim block  
**Purpose:** Strips Phase 2.1 fields from Supabase inserts until the columns exist in the live DB.  
**Type:** Application code, not SQL

This is the only "migration" that has been applied — it was applied at the code level (not DB level) during Phase B1.5A. It bridges the gap between TypeScript types (Phase 2.1) and the live DB (still v0.1).

**Governance risk:** This shim must be removed at the same moment (or immediately after) `supabase-migration-v2.sql` is confirmed applied. If removed before the migration, PostgREST will return 400 errors. If left after the migration, Phase 2.1 fields will never be persisted.

---

## 8 — UNAPPLIED OR STALE MIGRATIONS

### Confirmed Unapplied Migrations

| File | Evidence of Non-Application | Risk if Left Unapplied |
|---|---|---|
| `artifacts/mobile/supabase-migration-v2.sql` | `canonical_species`, `plant_aliases`, `collapse_mappings` tables do not exist in live DB. Phase 2.1 columns (`canonical_species_id`, `user_entered_name` etc.) do not exist on `plants`, `care_tasks` etc. | Phase 2.2 identity activation impossible. User-entered species names not preserved. Seasonal scheduler infrastructure absent. |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Depends on `supabase-migration-v2.sql` (`plant_aliases` table referenced). Indexes defined here are not present in the live DB. | Duplicate active care tasks possible (no UNIQUE enforcement). Alias search will use sequential scans. Per-user canonical queries inefficient. |

### Confirmed Never-To-Be-Applied

| File | Reason |
|---|---|
| `artifacts/mobile/supabase-setup.sql` | Destructive (`DROP TABLE … CASCADE`). Safe only for fresh installs. Live DB has user data. |

### Effectively Stale (Applied in a Different Layer)

| Migration | Layer | Notes |
|---|---|---|
| Phase B1.5A compatibility shim | Application code (`hooks/usePlants.ts`) | Not a SQL migration — applied via code change. Shim is active and correct for current state. Will become stale after `supabase-migration-v2.sql` is applied. |

### Future Work That Appears "Missing"

The following migrations do not exist but should be created before Phase 2.2 activation:

| Missing Migration | Priority | Blocks |
|---|---|---|
| `canonical_species` seeding | CRITICAL | Everything in Phase 2.2 |
| `plant_care_profiles` canonical FK backfill | HIGH | Canonical care profile lookup |
| `plant_aliases` seeding | HIGH | Species autocomplete / alias onboarding |
| Existing `plants` canonical backfill | HIGH | Identity activation for legacy plants |
| Existing `care_tasks` canonical backfill | MEDIUM | Scheduler analytics |
| Enum value normalization (light/difficulty) | LOW | Deprecating legacy union types |
| `collapse_mappings` seeding | LOW | Optional for MVP |

---

## 9 — MIGRATION ASSUMPTIONS THAT MAY CONFLICT WITH LIVE SUPABASE

### Assumption 1: Live DB is on Exact v0.1 Baseline Schema

`supabase-migration-v2.sql` assumes the live DB has the exact v0.1 schema — specifically that `plant_care_profiles` has a CHECK constraint named `plant_care_profiles_light_requirement_check` and `plant_care_profiles_difficulty_level_check`.

**Conflict risk:** If the live DB has a differently-named CHECK constraint (e.g., from a manual Supabase UI operation that auto-generates constraint names), the `DROP CONSTRAINT IF EXISTS` in §B7 will silently fail (do nothing), and then the `ADD CONSTRAINT` will create a SECOND constraint. PostgreSQL allows multiple CHECK constraints on the same column — both must pass. If the old constraint only accepts legacy values, new canonical values will be blocked even after the migration.

**Detection query:**
```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'plant_care_profiles'
  AND constraint_type = 'CHECK';
```

---

### Assumption 2: Live DB `care_tasks.task_type` CHECK is Named `care_tasks_task_type_check`

`supabase-migration-v2.sql` §E uses `DROP CONSTRAINT IF EXISTS care_tasks_task_type_check`. Same risk as Assumption 1.

**Detection query:**
```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'care_tasks'
  AND constraint_type = 'CHECK';
```

---

### Assumption 3: `canonical_species` Table Does Not Exist in Live DB

The migration uses `CREATE TABLE IF NOT EXISTS canonical_species`. If someone has manually created a `canonical_species` table in the live Supabase DB (even with a different schema), the `IF NOT EXISTS` guard will silently skip creation. The migration would appear to succeed but the table would have the wrong schema.

**Risk:** LOW — no reason this table would exist in v0.1 live DB.

---

### Assumption 4: `plant_care_profiles.species_name` Is UNIQUE in Live DB

`supabase-setup.sql` creates `plant_care_profiles` with `species_name TEXT NOT NULL UNIQUE`. The live DB should have this constraint. However, if it was ever dropped or if the live DB was set up differently, the ilike lookup could return non-deterministic results.

`PRE_DATASET_HARDENING_MIGRATION_v1.sql` §E adds a conditional guard to detect and restore this constraint if missing.

**Detection query:**
```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'plant_care_profiles'
  AND constraint_type = 'UNIQUE';
```

---

### Assumption 5: RLS Policy Names Match Expected Strings

`PRE_DATASET_HARDENING_MIGRATION_v1.sql` §D uses `DROP POLICY IF EXISTS "care_tasks: insert own" ON care_tasks`. If the live DB has these policies with slightly different names (e.g., a previous schema version used different naming), the `DROP` will silently do nothing and the `CREATE` will add a SECOND overlapping policy.

PostgreSQL evaluates multiple policies with OR semantics for permissive policies — two INSERT policies means a row is allowed if EITHER policy permits it. The net result is still ownership-scoped, but the policy list becomes messy.

**Detection query:**
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename IN ('care_tasks', 'care_logs')
ORDER BY tablename, policyname;
```

---

### Assumption 6: `plant_aliases` Table Exists When Hardening Migration Runs

`PRE_DATASET_HARDENING_MIGRATION_v1.sql` §B2 creates a GIN index on `plant_aliases.alias_name`. If `supabase-migration-v2.sql` has not been applied yet (table doesn't exist), §B2 will fail with a `relation "plant_aliases" does not exist` error.

**Mitigation:** The report for `PRE_DATASET_HARDENING_MIGRATION_v1.sql` explicitly documents the prerequisite. No DB-level guard exists.

---

### Assumption 7: Live DB Has 46 Care Profile Rows With Legacy Enum Values

The dual-value CHECK constraint expansion in `supabase-migration-v2.sql` §B7 is specifically designed to accept both the legacy values present in the 46 existing rows AND the new canonical values. If the live DB has different enum values (e.g., someone manually updated rows to use canonical values before the constraint was expanded), the `DROP CONSTRAINT + ADD CONSTRAINT` could fail if those rows violate the new constraint definition.

**Risk:** LOW — canonical values are a superset of legacy values in the expanded constraint. The constraint only fails if a row has a value not in either set (unlikely through normal application usage).

---

### Assumption 8: `auth.users` Table and Auth Triggers Are Configured in Supabase

`plants` has `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`. This FK references the Supabase `auth.users` table. All migrations assume Supabase Auth is enabled for the project. If running on a fresh Supabase project without Auth enabled, the FK creation will fail.

**Risk:** LOW — Supabase Auth is the existing authentication mechanism. This is only a risk for a fresh project setup.

---

## GOVERNANCE SUMMARY

| Category | Status | Critical Gaps |
|---|---|---|
| Structural migrations | DEFINED — unapplied | `supabase-migration-v2.sql` must run before any Phase 2.2 work |
| Hardening migrations | DEFINED — unapplied | Depends on structural migration |
| Canonical species seeding | NOT DEFINED | Blocking: entire Phase 2.2 depends on this |
| Alias seeding | NOT DEFINED | Blocking: species autocomplete |
| Collapse mappings seeding | NOT DEFINED | Non-blocking for MVP |
| Care profile FK backfill | NOT DEFINED | High priority post-seeding |
| Plants/tasks canonical backfill | NOT DEFINED | High priority at Phase 2.2 activation |
| Enum value normalization | NOT DEFINED | Low priority — coexistence layer handles it |
| Migration tracking mechanism | ABSENT | No schema_migrations table, no migration runner |
| Migration ordering enforcement | ABSENT | Documentation-only ordering |
| Constraint name assumption risk | MEDIUM | Pre-run detection queries recommended |

---

*This document is read-only migration lineage documentation. No files were modified in its generation. Reflects project state as of Phase B2.0.*
