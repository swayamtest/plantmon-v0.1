# PLANTMON — Migration Authority Declaration

**Classification:** Governance Reconciliation Audit  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + full governance baseline corpus + `RUNTIME_AUTHORITY_DECLARATION.md` + `MIGRATION_EXECUTION_LEDGER.md` + `ACTIVATION_BOUNDARY_REGISTRY.md`  

This document is the authoritative migration governance declaration for PLANTMON at the Phase B2.0 boundary. It defines the doctrine governing how migrations are authored, sequenced, applied, and tracked; establishes the authority hierarchy that governs migration decisions; enumerates the safety constraints that prohibit specific migration patterns; and specifies the future governance infrastructure required before PLANTMON's migration model can scale to Phase B2.2 and beyond. No code, schema, or migration file was modified in its generation.

---

## CURRENT MIGRATION REALITY

### The Schema Is Split Across Two Authority Planes

PLANTMON's schema does not exist in one place. It exists across two planes that are currently out of alignment:

**Plane A — Live Supabase DB (Tier 2 authority — actual current state):**
- Tables: `plants`, `care_tasks`, `care_logs`, `plant_care_profiles`, `health_logs`, `journal_entries` — all defined by `supabase-setup.sql`
- Columns on `plants`: `id`, `user_id`, `display_name`, `species_name`, `room_location`, `notes`, `created_at` — 7 columns
- `canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method` — **ABSENT**
- Tables `canonical_species`, `plant_aliases`, `collapse_mappings` — **ABSENT**
- Migration tracking table: **ABSENT** — no `schema_migrations` table exists

**Plane B — Replit source files (Tier 4 authority — intended future state):**
- `supabase-setup.sql`: defines the Phase B1 schema (live in Plane A)
- `supabase-migration-v2.sql`: defines Phase 2.1 schema additions — **UNAPPLIED**
- `PRE_DATASET_HARDENING_MIGRATION_v1.sql`: defines performance indexes — **UNAPPLIED**
- TypeScript types in `types/plant.ts`, `types/canonical.ts`: declare all Phase 2.1 and Phase 2.2 fields — **FORWARD-DECLARED**

**The alignment gap:** Replit source files describe a world where Phase 2.1 columns exist and canonical tables are present. The live DB describes a world where only the Phase B1 schema is present. These are different worlds. The gap is managed by the Phase 2.1 coexistence shim and is not a system failure — it is the designed pre-migration state.

---

### The Live DB is Authoritative Persistence Topology

The live Supabase DB is the only source of truth for what data actually exists. This authority is non-negotiable and non-bypassable:

| Property | Why live DB is authoritative |
|---|---|
| **What columns accept writes** | PostgREST rejects INSERT/UPDATE fields that reference absent columns — HTTP 400, unconditionally |
| **What columns appear in reads** | `SELECT *` returns exactly the columns the live schema defines — no more, no less |
| **What constraints are enforced** | CHECK, UNIQUE, FK, and NOT NULL constraints enforced by PostgreSQL at write time — TypeScript types have no enforcement authority |
| **What RLS policies are active** | The live policy set governs row-level access — Replit source files cannot override them |
| **Whether a migration has been applied** | Only the live DB schema can confirm this — no source file, no governance document, and no TypeScript type provides a reliable oracle without inspecting `information_schema` directly |

**The live DB's authority creates the migration governance imperative:** Because the DB is authoritative, any change to the DB schema is a consequential, potentially irreversible event. The governance model exists precisely because DB authority is absolute — a bad migration applied to the live DB cannot be undone by reverting source code.

---

### Replit is Not Schema-Authoritative

Replit holds **implementation authority** (Tier 4) over source code, TypeScript types, and application logic. It does not hold **schema authority** (Tier 2) over the live DB.

**The evidence:**

| Claim | Evidence of non-authority |
|---|---|
| TypeScript declares `Plant.canonical_species_id` | The column does not exist in the live DB — the type is forward-declared |
| `supabase-migration-v2.sql` defines `canonical_species` table | The table does not exist in the live DB — the SQL is unapplied |
| `types/canonical.ts` declares `CollapseMapping` | No CREATE TABLE for `collapse_mappings` exists in any SQL file — the type has no migration path |
| `PlantCareProfile.seasonal_watering_adjustment` is typed | No column definition exists in any SQL file — the type has no schema home |

**When Replit held schema authority:** At project inception, `supabase-setup.sql` was the exact definition of the live DB schema. The source file and the live DB were identical. Replit was schema-authoritative.

**When Replit lost schema authority:** When `supabase-migration-v2.sql` was committed to the repo without being applied to the live DB. At that moment, the source files began describing a future state that the live DB had not yet adopted. Replit became implementation-authoritative for the intended state; the live DB remained authoritative for the actual state.

**Replit will regain schema-authority** only when the live DB schema is brought into alignment with the Replit source files — i.e., when all pending migrations are applied and the `CollapseMapping` and `seasonal_watering_adjustment` SQL definitions are authored and applied.

---

### The Coexistence Runtime is Stable

Despite the schema authority gap, the PLANTMON runtime is fully stable at Phase B2.0. The stability is mechanically enforced — not merely documented:

| Stability mechanism | What it protects |
|---|---|
| Phase 2.1 shim (`usePlants.ts:49–66`) | All plant writes are confined to Phase B1 columns; Phase 2.1 column absence cannot cause a 400 error |
| `SELECT *` wildcard query | All plant reads are forward-compatible; absent columns return `undefined`; present columns return their values |
| Double-comment barriers on routing slots | Canonical and alias infrastructure cannot execute — schema absence is irrelevant because the code never queries it |
| Underscore-prefixed `_canonicalSpeciesId` parameter | Even if the parameter is supplied by a caller, it reaches no DB write |
| TypeScript optional typing on all Phase 2.1 fields | Compile-time safety — no `!` dereferences on fields that may be absent |

**Stability is a property of the coexistence mechanisms, not a property of the schema gap.** If the schema gap were larger (more absent columns, more absent tables), the coexistence mechanisms would still protect the runtime. If the coexistence mechanisms were removed without the schema gap being closed, the runtime would fail immediately.

---

## MIGRATION GOVERNANCE DOCTRINE

### Doctrine 1 — Additive Evolution

**Statement:** Every migration must add to the schema without removing or altering the meaning of any existing structure. Tables are not dropped. Columns are not removed. CHECK constraints are not tightened on existing data. Primary key types are not changed.

**Additive operations (permitted):**
- `CREATE TABLE IF NOT EXISTS` — adds a new table
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — adds a nullable column (no DEFAULT that would touch existing rows)
- `CREATE INDEX IF NOT EXISTS` — adds an index without table modification
- `CREATE POLICY IF NOT EXISTS` — adds an RLS policy
- `CREATE UNIQUE INDEX` on a column with no existing duplicates
- `INSERT INTO` for seed data

**Non-additive operations (prohibited in Phase B2.x migrations):**
- `DROP TABLE` — removes a table and all its data
- `ALTER TABLE ... DROP COLUMN` — removes a column and all its data
- `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` on a column with existing NULL values — violates existing rows
- `ALTER TABLE ... ALTER COLUMN ... TYPE` — changes column type; may reject existing data
- `ALTER TABLE ... RENAME COLUMN` — breaks all existing queries using the old name
- `DROP POLICY` followed by `CREATE POLICY` with different conditions — changes RLS enforcement retroactively

**The additive doctrine protects live user data.** Every row in the live `plants`, `care_tasks`, and `care_logs` tables was created by real users. A non-additive migration that drops a column, changes a constraint, or alters a type puts real user data at risk. The additive doctrine treats the live DB as an append-only surface — new structure is added; existing structure is preserved.

**The one known non-additive operation in pending migrations:**  
`supabase-migration-v2.sql §B7` drops and recreates `plant_care_profiles`. This is non-additive by definition — it is a `DROP TABLE` + `CREATE TABLE`. The table contains no user data (it is a reference table seeded by the development team, not written by users) — but the operation still requires pre-flight verification that the table is in the expected state, that the CHECK constraint name is known, and that all existing rows are preserved in the recreation.

---

### Doctrine 2 — Rollback-Safe Sequencing

**Statement:** Every migration must be applied in a sequence where each step can be safely reversed, and no step depends on a subsequent step to produce a valid intermediate state.

**Sequencing rules:**

| Rule | Rationale |
|---|---|
| `supabase-migration-v2.sql` before `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | The hardening migration creates indexes on tables that `migration-v2` creates; wrong order produces "relation does not exist" |
| Seed `plant_care_profiles` before seeding `canonical_species` | Care profiles must exist before canonical IDs are assigned to them |
| Seed `canonical_species` before seeding `plant_aliases` | Aliases FK to `canonical_species`; inserting an alias with an unknown canonical ID violates the FK |
| Apply column additions before removing coexistence shims | The shim protects against absent columns; removing the shim before adding the columns produces immediate 400 errors |
| `getDaysUntilWatering` fix before any seasonal `next_due_at` writer | The fix must be in production before any write diverges `next_due_at` from the static computation |

**Rollback-safe sequencing means each applied migration leaves the system in a valid, operable state.** After `supabase-migration-v2.sql` is applied (without runtime activation), the app should operate identically to before — the new columns appear as `null` in SELECT responses; the shim still strips them from writes; no routing slot activates. The intermediate state between infrastructure activation and runtime activation must be a fully functional state.

**The corollary:** No migration should be designed such that the app is broken in the interval between the migration being applied and the code being deployed. If a migration adds a NOT NULL column without a default, the app is broken in that interval — every INSERT fails until the code is deployed to populate the column. For PLANTMON, all new columns are nullable (`NULL` allowed), ensuring that post-migration, pre-code-deployment is always a valid intermediate state.

---

### Doctrine 3 — Coexistence-Safe Migration Discipline

**Statement:** Every migration must be designed so that the PLANTMON mobile app continues to operate correctly both before and after the migration is applied, without any code change.

**Coexistence-safe design requirements:**

| Requirement | Implementation |
|---|---|
| New columns must be nullable | `ALTER TABLE ... ADD COLUMN foo TEXT NULL` — not `NOT NULL` — so existing rows are valid post-migration |
| New tables must not be queried by existing code | All new table queries are comment-gated; migration-created tables cannot affect existing code paths |
| Existing column behavior must not change | No type changes, no constraint tightening, no rename — existing queries continue to produce the same results |
| `SELECT *` returns must remain valid | New nullable columns appear as `null` in `SELECT *` responses; TypeScript optional types absorb them silently |
| RLS policies on new tables must not block existing queries | New table policies govern only the new tables; they cannot affect queries against `plants`, `care_tasks`, or `care_logs` |

**Coexistence-safe migration discipline means the migration can be applied at any time during normal app operation** — no maintenance window required, no coordinated deployment, no code freeze. The live app continues to serve requests before, during, and after the migration executes.

**The `plant_care_profiles` DROP-and-recreate violates this doctrine for its duration.** There is a brief window during the recreation where the table does not exist and any in-flight ilike lookup would fail. For a low-traffic development-phase app, this window is operationally negligible — but it is technically a coexistence-safe violation. The mitigation: run the migration during a low-traffic period and verify the table was successfully recreated before any plant creation is attempted.

---

### Doctrine 4 — Activation-Safe Schema Evolution

**Statement:** No migration may change the DB schema in a way that activates a previously-inactive runtime system, triggers new application behavior, or exposes previously-unreachable data to the application without a corresponding deliberate runtime activation event.

**Activation-safe schema evolution means infrastructure and runtime activation are always independent.** Applying `supabase-migration-v2.sql` creates `plant_aliases` with zero rows. No application code queries `plant_aliases`. The alias routing slot is comment-gated. Zero behavior change results. The migration is activation-safe.

**What would violate activation-safe schema evolution:**

| Violation | Why it violates the doctrine |
|---|---|
| Adding a NOT NULL DEFAULT column that forces a value on existing rows | Forces existing rows into a new state that the app did not create — implicit data mutation |
| Adding a trigger that auto-populates `canonical_species_id` on INSERT | Triggers an automatic write to a field the app is not ready to handle — implicit runtime activation |
| Adding a view that wraps `plants` and `plant_aliases` that the app inadvertently queries | If the view name matches a table the app queries, the query is silently re-routed — implicit routing activation |
| Adding a DEFAULT value to `canonical_species_id` that populates all existing rows | Existing rows now have canonical IDs that the app (shim still active) will strip on next edit — implicit propagation that silently destroys IDs on edit |

**The activation-safe doctrine directly supports the coexistence runtime stability guarantee.** If every migration is activation-safe, then migration application can never cause a coexistence violation — the mechanisms protecting the runtime (shim, comment gates, optional types) remain unaffected by schema changes.

---

## MIGRATION AUTHORITY HIERARCHY

### Tier 1 — PRD Governance Authority over Migrations

**Domain:** Which migrations are planned, what they contain, in what order they are applied, and what application behavior changes they authorize.

**Tier 1 asserts:**
- The existence of `supabase-migration-v2.sql` and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` is PRD-authorized
- The activation sequence (Phase 2.1 → B2.1 → B2.2A → B2.2B → B2.3 → B2.3B) is PRD-authoritative
- No migration may be authored or applied for a phase that has not been PRD-authorized
- The migration for `collapse_mappings` (CREATE TABLE) has not yet been PRD-authorized as a concrete SQL artifact — the TypeScript interface exists but the migration is not yet scoped
- The migration for `seasonal_watering_adjustment` (ALTER TABLE) has not yet been PRD-authorized as a concrete SQL artifact

**PRD authority over migrations means:** A developer cannot write and apply a migration for Phase B2.3B features simply because the TypeScript interface exists. The interface is a design artifact. The migration is an execution artifact. PRD authorization is required before a migration moves from design to execution.

---

### Tier 2 — Live Supabase Schema Authority

**Domain:** Whether a migration has actually been applied, what the current schema state is, what constraints are enforced, and what PostgREST will accept.

**Tier 2 asserts:**
- The current schema reflects `supabase-setup.sql` only — no Phase 2.1 columns, no canonical tables
- `supabase-migration-v2.sql` is PENDING — its declared objects do not yet exist
- `PRE_DATASET_HARDENING_MIGRATION_v1.sql` is PENDING — its declared indexes do not yet exist
- The authoritative verification of migration state is `information_schema.columns` and `pg_tables` queries against the live DB — not governance documents, not TypeScript types
- The governance documents (`MIGRATION_EXECUTION_LEDGER.md`, `OPERATIONAL_BASELINE_MANIFEST.md`) are secondary records — they are accurate when current but subordinate to live DB inspection when in doubt

**Tier 2 authority creates the migration verification imperative:** Before any activation event that depends on a migration being applied, the live DB must be inspected directly to confirm the migration's objects exist. Governance documents may be stale; the live DB is always current.

---

### Tier 3 — Runtime Coexistence Authority

**Domain:** Whether a migration is safe to apply given the current runtime state, and what post-migration state the coexistence mechanisms will produce.

**Tier 3 asserts:**
- `supabase-migration-v2.sql` can be applied at any time — the coexistence mechanisms ensure the app continues to function identically before and after
- The Phase 2.1 shim continues to protect all writes after the migration is applied — it strips the new columns whether or not they exist in the schema
- After migration application, Tier 3 coexistence transitions from "protecting against absent columns" to "protecting against premature canonical write" — the mechanism is identical, only the threat it addresses changes
- No migration may be applied that would break the four active coexistence invariants (shim, SELECT *, comment gates, underscore params)

**Tier 3 authority over migration safety means:** Even if Tier 1 (PRD) authorizes a migration and Tier 2 (live DB) is ready to accept it, Tier 3 can veto application if the migration would violate coexistence. Example: a migration that adds a NOT NULL DEFAULT on `canonical_species_id` would force existing rows into a non-null state — the shim would then silently destroy these values on the next edit, since the shim strips canonical IDs from UPDATE payloads. Tier 3 vetoes this migration pattern.

---

### Tier 4 — Replit Implementation Authority over Migration SQL

**Domain:** The correctness of migration SQL authorship — whether the SQL correctly implements the PRD-authorized schema change, whether it is idempotent, whether it includes pre-flight checks, whether it handles the CHECK constraint name correctly.

**Tier 4 asserts:**
- `supabase-migration-v2.sql` is correctly authored — its SQL is valid and implements the Phase 2.1 schema as designed
- The `plant_care_profiles` DROP-and-recreate in `supabase-migration-v2.sql §B7` requires pre-flight CHECK constraint name verification before execution — this is a Tier 4 implementation concern
- `PRE_DATASET_HARDENING_MIGRATION_v1.sql` is correctly authored for its stated purpose
- The missing `collapse_mappings` CREATE TABLE is a Tier 4 authorship gap — the design exists (TypeScript interface) but the SQL implementation has not been authored
- The missing `seasonal_watering_adjustment` ALTER TABLE is a Tier 4 authorship gap

**Tier 4 authority means:** The migration SQL is correct if it correctly implements the Tier 1 design. It is safe if Tier 3 approves its application. It is applicable if Tier 2 confirms its prerequisites are met. All four tiers must agree before a migration can be applied.

---

### The Four-Tier Migration Authority Gate

A migration is authorized to execute only when all four tiers confirm readiness:

```
Tier 1 (PRD) confirms:        migration is for an authorized phase
         ↓
Tier 4 (Replit) confirms:     SQL is correctly authored; pre-flight checks drafted
         ↓
Tier 3 (Coexistence) confirms: migration does not violate any coexistence invariant
         ↓
Tier 2 (Supabase) confirms:   prerequisites exist in live DB; pre-flight checks pass
         ↓
MIGRATION MAY EXECUTE
```

At Phase B2.0, `supabase-migration-v2.sql` has passed Tier 1 (PRD-authorized), Tier 4 (correctly authored), and Tier 3 (coexistence-safe) — but Tier 2 (pre-flight: CHECK constraint detection) has not been executed. Migration execution is pending Tier 2 pre-flight completion.

---

## MIGRATION SAFETY CONSTRAINTS

### Constraint 1 — Prohibition on Destructive Cleanup

**Prohibited operations:**
- `DROP TABLE` on any user-data table (`plants`, `care_tasks`, `care_logs`, `health_logs`, `journal_entries`)
- `DROP COLUMN` on any column in a user-data table
- `TRUNCATE TABLE` on any user-data table
- `DELETE FROM` user-data tables without a specific governing data management event
- `ALTER TABLE ... DROP CONSTRAINT` on any constraint protecting user data

**Rationale:** Every row in `plants`, `care_tasks`, `care_logs`, `health_logs`, and `journal_entries` was created by a real user. Destructive operations on these tables permanently destroy user data. No migration in the PLANTMON governance corpus is authorized to perform destructive operations on user-data tables.

**The `plant_care_profiles` exception:** `plant_care_profiles` is a reference table seeded by the development team — it contains no user-authored rows. `supabase-migration-v2.sql §B7` drops and recreates this table. This is permitted only because the table contains zero user data. The permission is conditional: before execution, a SELECT COUNT(*) must confirm zero user-authored rows exist (distinguishable from development-seeded rows by the absence of user_id columns).

**What does NOT trigger this constraint:**
- `DROP TABLE IF NOT EXISTS` on a table that does not yet exist (no-op)
- `DROP INDEX IF EXISTS` on an index that does not contain data
- `DROP POLICY IF EXISTS` (policies contain no data)

---

### Constraint 2 — Prohibition on Premature NOT NULL Enforcement

**Prohibited operation:** `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` on any column where existing rows may contain NULL values, without a verified preceding UPDATE that fills all nulls.

**Rationale:** The Phase 2.1 columns (`canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method`) will be added as nullable (`NULL` allowed). After they are added but before Phase 2.2 activates and populates them, every existing plant row will have `NULL` for all four columns. If a subsequent migration attempts `SET NOT NULL` before all rows are populated, PostgreSQL rejects the operation and the migration fails — leaving the schema in a partially-applied state.

**The safe sequence for eventual NOT NULL enforcement (future, not current):**

```
Step 1: ALTER TABLE ... ADD COLUMN canonical_species_id TEXT NULL    ← nullable, Phase 2.1
Step 2: UPDATE plants SET canonical_species_id = ... WHERE ...        ← backfill, Phase B2.2A
Step 3: Verify: SELECT COUNT(*) FROM plants WHERE canonical_species_id IS NULL → 0
Step 4: ALTER TABLE ... ALTER COLUMN canonical_species_id SET NOT NULL ← enforce, Phase B2.x
```

Step 4 is not planned for any current phase. It is documented here as the only safe future path to NOT NULL enforcement, not as an authorized upcoming event.

---

### Constraint 3 — Prohibition on Automatic Rebinding via Migration

**Prohibited operations:**
- A migration trigger that automatically recalculates `care_tasks.frequency_days` when `plants.canonical_species_id` is set
- A migration DEFAULT that populates `care_tasks.canonical_species_id` from `plants.canonical_species_id` automatically
- A migration function that updates existing `care_tasks.frequency_days` based on canonical profile lookups
- Any `ON UPDATE` cascade that propagates canonical changes to care tasks automatically

**Rationale:** Care schedule rebinding is a Tier 1 Phase B2.2 feature that requires deliberate activation through the application layer. A DB-level trigger that automates rebinding would:
1. Bypass the Tier 3 coexistence layer — rebinding could occur without the coexistence mechanisms being ready
2. Fire for every existing row the moment `canonical_species_id` is backfilled — a mass care schedule change for all users simultaneously
3. Produce different behavior from the application layer's future rebinding logic — creating two divergent rebinding paths
4. Be invisible to the application — changes fire without any React Query cache invalidation, producing stale UI state

**The rebinding contract:** All care schedule changes are application-layer events. `useWaterPlant`, `useUpdatePlant`, and any future `useRebindPlant` hook are the only authorized mechanisms for changing `care_tasks` data.

---

### Constraint 4 — Prohibition on Implicit Routing Activation via Migration

**Prohibited operations:**
- A migration that adds a row to `plant_care_profiles` with a `species_name` that matches a common species and a different `watering_frequency_days` than what was previously returned — silently altering the care schedule for all future plants with that species
- A migration that alters the `species_name` column on `plant_care_profiles` (renames or normalizes values) — breaking existing ilike lookups that use the old names
- A migration that adds a UNIQUE constraint to a column that existing code queries with an ilike (not unique) pattern — changing the effective query behavior

**Rationale:** The ilike lookup is the active species resolution path. Every change to `plant_care_profiles` structure or data directly affects the resolution behavior for every future plant creation. Changes to this table are routing changes, not just data changes — they must be treated as activation events subject to Tier 1 PRD authorization.

**What IS permitted without activation concern:**
- Adding new rows to `plant_care_profiles` for species not yet present — additive; does not affect existing lookups
- Correcting `watering_frequency_days` on existing rows if the current value is a data error — but only with explicit documentation that the change is a data correction, not a routing activation

---

### Constraint 5 — Prohibition on Scheduler Mutation via Migration

**Prohibited operations:**
- A migration trigger on `care_tasks` that recalculates `next_due_at` automatically on any INSERT or UPDATE
- A migration DEFAULT on `next_due_at` that computes a value based on `Date.now()` or `NOW()` (PostgreSQL server time) rather than application-provided values
- A migration function that batch-updates all `care_tasks.next_due_at` values to a seasonally-adjusted future timestamp
- A migration that adds a `seasonal_multiplier` column to `care_tasks` and populates it via a trigger

**Rationale:** The scheduler is entirely application-layer in the current design. `next_due_at` is written by the application on task creation and on every watering event. DB-level scheduler mutations would:
1. Cause `next_due_at` values in the DB to diverge from what the application computed — the `next_due_at` write/read divergence risk (documented throughout the governance corpus) would materialize immediately
2. Silently change the schedule for every plant without any React Query cache invalidation
3. Use PostgreSQL `NOW()` as the time source rather than `Date.now()` — introducing a clock source split where different scheduler events use different time authorities

**The scheduler authority contract:** All scheduler timing decisions are application-layer events using `Date.now()` as the clock source. No DB trigger, default, or function may override application-computed timestamps.

---

## FUTURE MIGRATION REQUIREMENTS

### Requirement 1 — Migration Ledgering

**Current state:** Migration state is tracked in `governance-baseline/MIGRATION_EXECUTION_LEDGER.md` — a Replit source file. The live DB has no `schema_migrations` table. The only way to confirm whether a migration has been applied is direct schema inspection (`information_schema.columns`, `pg_tables`).

**Required future state:**

```sql
-- To be created as the first operation in a future governance migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL UNIQUE,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by    TEXT NOT NULL,
  phase         TEXT NOT NULL,
  checksum      TEXT,
  notes         TEXT
);
```

**Why a DB-native migration ledger is required:**
- The governance document (`MIGRATION_EXECUTION_LEDGER.md`) can become stale — it is a human-maintained record
- A DB-native table is authoritative by definition — it exists in the same system it tracks
- Future tooling (even a simple SELECT) can confirm migration state without reading governance files
- The ledger is the prerequisite for any future migration automation — you cannot build a migration runner without a tracking table

**Ledger population protocol:** After every migration is applied, immediately insert:
```sql
INSERT INTO schema_migrations (filename, applied_by, phase, notes)
VALUES ('supabase-migration-v2.sql', 'developer-name', 'B2.1', 'Phase 2.1 canonical infrastructure');
```

---

### Requirement 2 — Execution Tracking

**Current state:** Migration execution has no audit trail beyond:
1. The governance document `MIGRATION_EXECUTION_LEDGER.md` (manually maintained)
2. The Supabase Dashboard query history (ephemeral — not retained indefinitely)
3. Direct schema inspection (detects current state; cannot detect when or by whom changes were made)

**Required execution tracking elements:**

| Tracking element | Purpose | How to implement |
|---|---|---|
| Migration filename | Identifies which migration was applied | `schema_migrations.filename` |
| Applied timestamp | When the migration was executed | `schema_migrations.applied_at DEFAULT NOW()` |
| Applied-by identifier | Who executed the migration | `schema_migrations.applied_by` (developer name or automated system name) |
| Pre-flight results | Output of pre-application verification queries | `schema_migrations.notes` (JSON or text summary) |
| Post-flight verification | Confirmed schema objects after application | Additional row with `filename = 'supabase-migration-v2.sql (verified)'` or inline in notes |
| Rollback SQL reference | Where the rollback script is stored | Governance document reference in notes |

**The minimum viable execution record** for `supabase-migration-v2.sql`:
```
filename:    supabase-migration-v2.sql
applied_at:  [timestamp]
applied_by:  [developer]
phase:       B2.1
notes:       Pre-flight: light_requirement CHECK constraint confirmed as
             plant_care_profiles_light_requirement_check (no conflict).
             RLS policy names verified non-conflicting.
             plant_care_profiles row count before: N, after: N (preserved).
             Post-flight: canonical_species table confirmed present,
             plant_aliases table confirmed present,
             canonical_species_id column confirmed on plants.
```

---

### Requirement 3 — Activation Sequencing Discipline

**Current state:** Activation sequencing is documented in `ACTIVATION_BOUNDARY_REGISTRY.md` and `COEXISTENCE_STATE_FREEZE.md` but is enforced only by documentation — no technical gate prevents out-of-order activation.

**Required activation sequencing gates:**

| Gate | Implementation approach |
|---|---|
| Pre-migration gate | The `getSchemaMigrationStatus()` function in `runtimeValidation.ts` (currently zero call sites) checks for Phase 2.1 column existence; it must be wired to a startup hook or admin screen that prevents Phase 2.2 activation if migration is undetected |
| Post-migration validation gate | Before any routing slot is uncommented, a direct DB inspection must confirm: `canonical_species_id` column exists on `plants`, `plant_aliases` table exists, `canonical_species` table has rows |
| Shim removal gate | Shim removal must be blocked if any of: migration unapplied, `plant_care_profiles.canonical_species_id` unbackfilled, `canonical_species_id` wiring incomplete |
| Seasonal activation gate | `getDaysUntilWatering` must read `next_due_at` (verified by code review) before any seasonal writer is deployed |

**The activation checklist format (for each phase):**

```
Phase B2.2A Activation Checklist:
  □ supabase-migration-v2.sql applied and verified (schema inspection)
  □ schema_migrations table confirms migration recorded
  □ canonical_species seeded (SELECT COUNT(*) > 0)
  □ plant_care_profiles.canonical_species_id backfilled (SELECT COUNT(*) WHERE canonical_species_id IS NOT NULL > 0)
  □ getDaysUntilWatering reads next_due_at (code review)
  □ care_logs canonical_species_id write added (code review)
  □ context.method wired to PlantInput.species_resolution_method (code review)
  □ ALL FOUR confirmed → shim removal + routing uncomment deploy as single unit
```

---

### Requirement 4 — Observability

**Current state:** Once a migration is applied, there is no in-app signal that the migration occurred, no diagnostic surface for developers to inspect current schema state, and no runtime behavior that changes to reflect the new schema capabilities.

**Required observability elements:**

| Observability element | Purpose | Implementation path |
|---|---|---|
| `getSchemaMigrationStatus()` call site | Confirms migration state at app startup or on demand | Wire to a developer/admin screen; log output to console in dev mode |
| `getPlantIdentityStatus()` call site | Reports per-plant canonical resolution state post-B2.2A | Wire to plant detail screen (debug mode) or admin dashboard |
| `summarizeIdentityStatus()` call site | Aggregate report of resolution method distribution across all plants | Wire to admin screen; run after backfill to verify coverage |
| `schema_migrations` SELECT | Dev-mode startup log of applied migrations | Query `schema_migrations` at app launch in `__DEV__` mode; log results |
| Resolution method distribution query | `SELECT species_resolution_method, COUNT(*) FROM plants GROUP BY 1` | Run post-Phase-2.2 activation to confirm alias/canonical routing is producing expected output |

**The absence of observability is a governance risk.** Without call sites for `getSchemaMigrationStatus()` and without a `schema_migrations` table, a developer cannot confirm the migration state from within the app or from the DB. They are flying blind. Observability is not a nice-to-have — it is the mechanism by which migration governance is verified at runtime.

---

### Requirement 5 — Rollback Planning

**Current state:** No rollback SQL has been authored for either pending migration. If `supabase-migration-v2.sql` produces an unexpected result (e.g., the CHECK constraint name conflict, or data loss in the `plant_care_profiles` recreation), there is no pre-authored script to reverse the damage.

**Required rollback artifacts:**

**Rollback for `supabase-migration-v2.sql` (to be authored before application):**

```sql
-- Rollback: supabase-migration-v2.sql
-- Author before applying the migration. Verify against live schema before applying rollback.

-- 1. Drop canonical tables (no user data)
DROP TABLE IF EXISTS plant_aliases;
DROP TABLE IF EXISTS canonical_species;
-- Note: collapse_mappings was never in this migration; no drop needed

-- 2. Remove Phase 2.1 columns from plants
ALTER TABLE plants DROP COLUMN IF EXISTS canonical_species_id;
ALTER TABLE plants DROP COLUMN IF EXISTS canonical_species_name;
ALTER TABLE plants DROP COLUMN IF EXISTS user_entered_name;
ALTER TABLE plants DROP COLUMN IF EXISTS species_resolution_method;

-- 3. Remove Phase 2.1 columns from care_tasks and care_logs
ALTER TABLE care_tasks DROP COLUMN IF EXISTS canonical_species_id;
ALTER TABLE care_logs DROP COLUMN IF EXISTS canonical_species_id;

-- 4. Restore plant_care_profiles if recreated
-- WARNING: This step requires the original plant_care_profiles DDL and data backup.
-- Pre-migration: pg_dump plant_care_profiles; store backup before executing migration.
-- Post-rollback: restore from backup.
```

**Rollback for `PRE_DATASET_HARDENING_MIGRATION_v1.sql`:**

```sql
-- Rollback: PRE_DATASET_HARDENING_MIGRATION_v1.sql

-- 1. Drop performance indexes
DROP INDEX IF EXISTS idx_plant_aliases_alias_name_gin;
DROP INDEX IF EXISTS idx_plant_aliases_unique_active;
-- Add any other indexes created by this migration

-- 2. Revert RLS policies if modified (requires knowing original policy definitions)
-- Pre-migration: document all existing RLS policies before applying migration
```

**The point-of-no-return:** The rollback becomes data-destructive after Phase 2.2A activates and plants have been assigned `canonical_species_id` values. Dropping the `canonical_species_id` column at that point destroys the canonical associations for every plant. The rollback window is: after migration application, before Phase 2.2A runtime activation. Once runtime activation has occurred and real user data has been written to canonical fields, the rollback requires a coordinated data migration, not just DDL reversal.

**The `plant_care_profiles` backup imperative:** Before `supabase-migration-v2.sql §B7` is executed, a `pg_dump` of `plant_care_profiles` must be captured. This is the only user-authored content that could be lost in the DROP-and-recreate. Development-seeded rows can be re-seeded from source files; but if any application user has written to this table (currently impossible due to RLS, but worth confirming), those rows cannot be recovered without a backup.

---

## MIGRATION AUTHORITY SUMMARY

| Authority tier | Domain | Current state | Migration authority |
|---|---|---|---|
| **Tier 1 — PRD** | Which migrations are planned and authorized | `supabase-migration-v2.sql` and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` authorized; `collapse_mappings` and `seasonal_watering_adjustment` SQL not yet authorized | No migration may be applied without Tier 1 authorization for its phase |
| **Tier 2 — Live Supabase** | Whether migration prerequisites exist in the live DB | Both migrations PENDING; zero Phase 2.1 objects in live DB | Live DB inspection is the authoritative migration state oracle |
| **Tier 3 — Coexistence** | Whether migration is safe given current runtime | Both pending migrations are coexistence-safe with one known risk (CHECK constraint); runtime stable post-application | Coexistence layer continues to protect runtime after migration application |
| **Tier 4 — Replit** | Whether migration SQL is correctly authored | Both migrations correctly authored; two authorship gaps: `collapse_mappings` CREATE TABLE absent, `seasonal_watering_adjustment` ALTER TABLE absent | Migration SQL must be complete before Tier 2 application |

**The migration governance model at Phase B2.0 is structurally sound but operationally immature.** The doctrine is defined. The authority hierarchy is clear. The safety constraints are documented. What is missing is the infrastructure to enforce the doctrine programmatically: the `schema_migrations` table, the rollback SQL artifacts, the pre-flight verification protocol execution, and the call sites for `getSchemaMigrationStatus()`. These infrastructure items are the migration governance requirements that must be established before Phase B2.2 activation.

---

*This document is a read-only migration governance authority declaration. No application files, SQL files, migration files, or schema state were modified in its generation. Supersede by issuing a new dated declaration after any migration is applied, any migration is authored, or the migration governance infrastructure is upgraded.*
