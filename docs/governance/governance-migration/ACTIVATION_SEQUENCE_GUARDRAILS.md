# PLANTMON — Activation Sequence Guardrails

**Classification:** Governance Migration Authority  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + `MIGRATION_EXECUTION_PROTOCOL.md` + `ACTIVATION_BOUNDARY_REGISTRY.md` + `RUNTIME_COMPATIBILITY_CONTRACT.md` + `MIGRATION_ROLLBACK_STRATEGY.md` + `STALE_ASSUMPTION_REGISTRY.md`  

This document is the authoritative activation sequencing guardrail specification for PLANTMON. It defines the doctrine distinguishing activation categories, the required ordering of all activation events from the current phase through seasonal scheduling, the explicitly forbidden orderings and the failure modes they produce, the runtime protections that constrain every activation, and the governance escalation conditions that block or pause activation sequences. No code, schema, or runtime behavior was modified in its generation.

**Critical framing:** Activation is irreversible once user-facing consequences occur. The coexistence architecture was designed to make every activation event deliberate, sequential, and independently verifiable. The guardrails in this document protect that design — they are not bureaucratic overhead, they are the mechanism by which a complex multi-phase architecture can be activated incrementally without mass disruption to existing users and their plants.

---

## ACTIVATION DOCTRINE

### Three Activation Categories

PLANTMON's activation model distinguishes three categories of activation that are often conflated but must be treated as independent events with independent readiness criteria, independent governance checks, and independent rollback characteristics.

---

### Category 1 — Infrastructure Activation

**Definition:** An infrastructure activation is the application of a migration SQL file that creates schema objects required for a future feature. The objects created are structurally present in the live DB but have zero runtime effect — they are inert.

**Characteristics:**
- Occurs via a governed migration execution (full 8-step lifecycle)
- The schema objects exist after activation but no application code reads or writes them
- The coexistence shim ensures the new objects are not touched by existing application code
- Behavioral tests before and after infrastructure activation produce identical results
- Infrastructure activation is reversible (via rollback) until the non-rollbackable threshold is crossed

**Current infrastructure activations (authorized for Phase B2.1):**
- `supabase-migration-v2.sql` — creates `canonical_species`, `plant_aliases`, adds Phase 2.1 columns to `plants`, `care_tasks`, `care_logs`, `plant_care_profiles` (the §B7 recreation)
- `PRE_DATASET_HARDENING_MIGRATION_v1.sql` — creates GIN and UNIQUE indexes on `plant_aliases`

**What infrastructure activation does NOT do:**
- Does not populate any new table or column with data
- Does not change any application routing decision
- Does not alter any user-visible behavior
- Does not close the rollback window (rollback remains available)

**The infrastructure-only guarantee:** After an infrastructure activation, every PLANTMON behavioral test must pass with results identical to pre-activation. This is the coexistence-safe test from `MIGRATION_EXECUTION_PROTOCOL.md §Principle 1` — the runtime validation tests RTV-01 through RTV-10 in the postcheck runbook.

---

### Category 2 — Runtime Activation

**Definition:** A runtime activation is a code deployment that wires application logic to schema objects that were previously inert. Runtime activation transitions a system from the INACTIVE state to the ACTIVE state as described in `ACTIVATION_BOUNDARY_REGISTRY.md`.

**Characteristics:**
- Occurs via a code deployment (mobile app update, API server deployment)
- The schema objects already exist from a prior infrastructure activation
- The deployment removes a shim, uncomments a routing slot, or adds a new code path
- After deployment, the activated system begins affecting user-visible behavior
- Runtime activation is partially irreversible: the code can be redeployed with the activation removed, but any data written during the activation window (canonical IDs, alias resolutions) cannot be retracted without a data migration

**Planned runtime activations:**
- Phase 2.2A: Remove Phase 2.1 shim from `usePlants.ts`; uncomment canonical routing slot in `careProfiles.ts` — begins canonical species ID propagation for new plants
- Phase 2.2B: Wire `plant_aliases` lookup into species resolution path — alias-based plant creation
- Phase 2.3A: Wire `care_tasks.canonical_species_id` write path — canonical care logging
- Phase 2.3B: Wire `collapse_mappings` resolution — archetype-based care profiles
- Phase B3+: Seasonal scheduling activation (dependency on `getDaysUntilWatering` fix first)

**What runtime activation requires before it may proceed:**
- The corresponding infrastructure activation must be complete (schema objects must exist)
- Dataset seeding must be complete for systems that depend on reference data
- All prerequisite runtime activations in the sequence must be confirmed active
- The `getDaysUntilWatering` fix must be deployed before any scheduler-affecting runtime activation
- Tier 1 governance authorization per `ACTIVATION_BOUNDARY_REGISTRY.md`

---

### Category 3 — Operational Activation

**Definition:** An operational activation is the population of reference data that enables a runtime-active system to function correctly. It is neither schema change nor code change — it is a data event that enables the already-wired runtime to produce correct outputs.

**Characteristics:**
- Occurs via SQL INSERT/UPDATE statements executed against reference tables
- The tables and indexes must already exist (prior infrastructure activation)
- The application code may or may not already be wired to use the data
- Operational activation is reversible (DELETE the seeded rows) until users have created plants based on the reference data, at which point the `plant_care_profiles` data becomes load-bearing

**Current operational activations (planned for Phase B2.1):**
- Phase B2.1 dataset seeding: INSERT into `canonical_species`, INSERT into `plant_aliases` — populates reference data that `careProfiles.ts` routing will use after Phase 2.2A runtime activation
- `plant_care_profiles` canonical_species_id backfill: UPDATE `plant_care_profiles SET canonical_species_id = ...` — links reference profiles to their canonical species entries

**What operational activation does NOT require:**
- It does not require the consuming code to be runtime-active (seeding can occur while routing is still commented out)
- It does not trigger runtime behavior (seeded data in `canonical_species` does not cause any live app behavior until Phase 2.2A code is deployed)

**The operational activation / runtime activation independence:** This is a critical architectural property. `canonical_species` can be seeded (operational activation) while the canonical routing slot is still inactive (runtime activation not yet applied). This allows reference data to be validated, reviewed, and corrected before any user is affected.

---

## REQUIRED ACTIVATION ORDERING

The following sequence defines the required order for all planned PLANTMON activation events. Each step lists its schema prerequisites, data prerequisites, code prerequisites, and the minimum governance authorization required before it may begin. No step may begin until all its prerequisites are confirmed complete.

---

### Step A1 — Phase 2.1 Schema Migration (Infrastructure Activation)

**Migration:** `supabase-migration-v2.sql`  
**Activation category:** Infrastructure  
**Current status:** PENDING  

**Prerequisites (all must be confirmed):**
- `supabase-setup.sql` was applied and is the current DB baseline (confirmed by table inventory)
- Phase B1 coexistence shim is active in `usePlants.ts` (confirmed in code)
- pg_dump backup of `plant_care_profiles` has been captured (required for §B7 rollback)
- Precheck runbook executed with all blocks passing and no abort conditions
- `plant_care_profiles.user_id` column confirmed absent (ABORT-A04 cleared)
- CHECK constraint name on `plant_care_profiles` captured and confirmed matching migration SQL

**What this step creates:**
- `canonical_species` table (empty)
- `plant_aliases` table (empty)
- Phase 2.1 columns on `plants` (canonical_species_id, user_entered_name, canonical_species_name, species_resolution_method) — all NULL
- `canonical_species_id` on `care_tasks` — NULL
- `canonical_species_id` on `care_logs` — NULL
- `canonical_species_id` on `plant_care_profiles` — NULL

**What this step does NOT do:**
- Does not populate any new table or column
- Does not change any routing decision
- Does not alter any user-visible behavior

**Confirmation test:** Plant creation succeeds, countdown is unchanged, watering works — identical to pre-A1 behavior (RTV-01 through RTV-10).

---

### Step A2 — Hardening Migration (Infrastructure Activation)

**Migration:** `PRE_DATASET_HARDENING_MIGRATION_v1.sql`  
**Activation category:** Infrastructure  
**Current status:** PENDING — blocked by A1  

**Prerequisites (all must be confirmed):**
- A1 complete: `plant_aliases` table exists (DEP-01 check from precheck runbook)
- `plant_aliases` is empty (no premature seeding has occurred)
- GIN index does not yet exist (PC-IDX-02 check)

**What this step creates:**
- GIN index on `plant_aliases.alias_name` — enables efficient fuzzy text search
- UNIQUE index on `plant_aliases` active alias uniqueness constraint

**What this step does NOT do:**
- Does not populate `plant_aliases`
- The GIN index has nothing to index yet (empty table) — no performance effect until seeding

**Why A2 must precede dataset seeding:** Inserting rows into `plant_aliases` before the GIN index exists will work, but all rows will be inserted without index entries. Building the GIN index after bulk seeding requires a full index build pass — significantly slower than building the index before seeding and letting insertions populate it incrementally. A2 before seeding is the correct order.

---

### Step A3 — Dataset Seeding (Operational Activation)

**Event:** INSERT into `canonical_species`, INSERT into `plant_aliases`  
**Activation category:** Operational  
**Current status:** PENDING — blocked by A1 and A2  

**Prerequisites (all must be confirmed):**
- A1 complete: `canonical_species` and `plant_aliases` tables exist
- A2 complete: GIN and UNIQUE indexes exist on `plant_aliases`
- Seed data source files reviewed and validated (species names, alias spellings, watering frequencies match `plant_care_profiles` baseline)
- `canonical_species` row count = 0 (no prior seeding)
- `plant_aliases` row count = 0 (no prior seeding)
- Phase 2.2A runtime activation NOT YET applied (seeding must occur while routing is still inactive — allowing data validation before users are affected)

**What this step creates:**
- Reference rows in `canonical_species` for all governed plant species
- Reference rows in `plant_aliases` mapping common name variants to canonical species IDs
- Optionally: UPDATE `plant_care_profiles SET canonical_species_id = ...` linking existing profiles to canonical species

**What this step does NOT do:**
- Does not change any application routing
- Does not populate any user-data table
- Does not affect any existing plant's scheduling or display

**The seeding / runtime activation independence guarantee:** A3 may be applied multiple times (inserting new species, adding new aliases) before A4 (Phase 2.2A runtime activation). Each seeding event is independently verifiable. Users are not affected by any seeding event because the routing code that reads `canonical_species` and `plant_aliases` is not yet active.

**Post-seeding validation (required before proceeding to A4):**
```sql
-- Confirm seeding completed successfully:
SELECT COUNT(*) FROM canonical_species;     -- expected: N (target species count)
SELECT COUNT(*) FROM plant_aliases;         -- expected: M (target alias count)

-- Confirm no aliases are orphaned (FK integrity):
SELECT COUNT(*) FROM plant_aliases pa
LEFT JOIN canonical_species cs ON cs.id = pa.canonical_species_id
WHERE cs.id IS NULL;
-- Expected: 0

-- Spot-check an ilike that the Phase 2.2A routing will perform:
SELECT cs.canonical_name, pa.alias_name
FROM plant_aliases pa
JOIN canonical_species cs ON cs.id = pa.canonical_species_id
WHERE pa.alias_name ILIKE '%monstera%';
-- Expected: rows for Monstera deliciosa and variants
```

---

### Step A4 — Canonical Propagation (Runtime Activation — Phase 2.2A)

**Event:** Code deployment removing Phase 2.1 shim from `usePlants.ts`; uncommenting canonical routing slot in `careProfiles.ts`  
**Activation category:** Runtime  
**Current status:** FUTURE — blocked by A1, A2, A3, and code prerequisites  

**Prerequisites (all must be confirmed before deployment):**
- A1 complete: Phase 2.1 columns exist on `plants`
- A3 complete: `canonical_species` and `plant_aliases` are seeded with validated reference data
- `getDaysUntilWatering` fix confirmed deployed (RAD-001 — reads `next_due_at` directly OR is confirmed read-only safe; this fix is the highest-priority independent improvement)
- Coexistence validation passed: all existing plants have `canonical_species_id = NULL` (canonical isolation confirmed)
- Phase 2.1 shim removal reviewed: the removal must not break the `plants` INSERT for any existing code path
- TypeScript optional chaining confirmed for all Phase 2.1 column reads: no hard-dereference of `canonical_species_id` without null guard

**What this activation does:**
- New plant creation writes `user_entered_name = species_name` (user's input preserved)
- New plant creation attempts alias resolution → if match found, writes `canonical_species_id` and `canonical_species_name`
- New plant creation writes `species_resolution_method` (`ilike_match`, `alias_match`, `no_match`)
- Existing plants retain `canonical_species_id = NULL` (no backfill at activation time — backfill is Step A5)

**What this activation does NOT do:**
- Does not modify any existing plant
- Does not change any existing care task's `frequency_days`
- Does not write to `care_tasks.canonical_species_id` (that is Step A5)

**Rollback window status after A4:** Closes for new plants. The first new plant created post-A4 writes a non-null `canonical_species_id` — the non-rollbackable threshold from `MIGRATION_ROLLBACK_STRATEGY.md §Non-Rollbackable Event 1` is crossed. `supabase-migration-v2.sql` can no longer be safely rolled back without destroying the new plant's canonical association.

---

### Step A5 — Alias Activation (Runtime Activation — Phase 2.2B)

**Event:** Code deployment wiring `plant_aliases` lookup into species resolution path as a second resolution tier  
**Activation category:** Runtime  
**Current status:** FUTURE — blocked by A4  

**Prerequisites:**
- A4 complete and confirmed stable (at least one usage cycle with zero HTTP 400s on plant creation)
- `plant_aliases` seeding validated (spot-checks on common name variants passed)
- GIN index confirmed active on `plant_aliases.alias_name` (PC-POST-IDX-02)

**What this activation does:**
- Species resolution now has two tiers: (1) ilike on `plant_care_profiles.species_name`, (2) alias lookup on `plant_aliases.alias_name`
- Common name variants ("Pothos", "Golden Pothos", "Devil's Ivy") now resolve to their canonical species
- `species_resolution_method` values will now include `alias_match` in addition to `ilike_match` and `no_match`

**What this activation does NOT do:**
- Does not change behavior for species already resolving via ilike (tier 1 still takes precedence)
- Does not alter any existing plant

---

### Step A6 — Scheduler Rebinding (Runtime Activation — Phase 2.3A)

**Event:** Code deployment wiring `care_tasks.canonical_species_id` write path; optional backfill of `frequency_days` from canonical care profiles  
**Activation category:** Runtime  
**Current status:** FUTURE — blocked by A4, A5, and the `getDaysUntilWatering` fix  

**Prerequisites (all must be confirmed before deployment):**
- A4 and A5 complete
- `getDaysUntilWatering` fix confirmed deployed and tested (REQUIRED — no Class 5 migration or activation may proceed without this fix; see `MIGRATION_EXECUTION_PROTOCOL.md §Constraint C1`)
- `next_due_at` read/write consistency verified: the fix reads `next_due_at` directly; writes match the computed value
- Scheduler continuity baseline captured: all active care tasks' `frequency_days` values recorded before activation
- Tier 1 authorization for scheduler rebinding (Class 5 governance requirement)

**What this activation does:**
- New watering events write `canonical_species_id` to `care_logs` (Phase 2.3A)
- Optionally: `frequency_days` updated for existing plants whose canonical profile differs from their current value

**Rollback characteristics:** Once `frequency_days` is rebinding for existing plants, the original values cannot be reliably restored without a species-by-species re-derivation (per `MIGRATION_ROLLBACK_STRATEGY.md §Non-Rollbackable Event 3`). This is an operationally irreversible step for affected plants.

---

### Step A7 — Archetype Activation (Runtime Activation — Phase 2.3B)

**Event:** Code deployment wiring `collapse_mappings` resolution into care profile selection  
**Activation category:** Runtime  
**Current status:** FUTURE — blocked by A4, A5, A6, and collapse_mappings schema creation  

**Prerequisites:**
- A4, A5, A6 complete
- `collapse_mappings` table exists (a migration not yet authored must be applied first)
- `collapse_mappings` seeded with validated archetype data
- TypeScript `CollapseMapping` interface in `types/canonical.ts` confirmed matching DB schema

**What this activation does:**
- Care profile resolution gains a third tier: canonical → collapse_mapping → archetype profile
- Species with high similarity collapse to a shared care archetype rather than maintaining distinct profiles
- Care recommendations for collapsed species become archetype-derived

---

### Step A8 — Seasonal Scheduling (Runtime Activation — Phase B3+)

**Event:** Code deployment wiring seasonal watering adjustment computation  
**Activation category:** Runtime  
**Current status:** FUTURE — blocked by A6 and `seasonal_watering_adjustment` DB column creation  

**Prerequisites:**
- A6 complete (scheduler rebinding active)
- `getDaysUntilWatering` fix confirmed deployed (REQUIRED — without this fix, seasonal scheduling writes `next_due_at` but the UI still reads `last_completed_at + frequency_days`; the seasonal adjustment is silently discarded)
- `seasonal_watering_adjustment` DB column created (this column is typed on `PlantCareProfile` in TypeScript but has no corresponding DB column in any current SQL file — a migration must be authored before this activation is possible)
- Seasonal calibration data present in `plant_care_profiles` (seeded and validated)

**What this activation does:**
- `next_due_at` computation for watering tasks incorporates a seasonal multiplier
- Summer frequencies increase; winter frequencies decrease based on species profile
- The `getDaysUntilWatering` function begins reading `next_due_at` rather than computing from `last_completed_at + frequency_days`

---

### Activation Sequence Summary Table

| Step | Event | Category | Blocked by | Rollback window |
|---|---|---|---|---|
| A1 | supabase-migration-v2.sql | Infrastructure | (none — current phase) | OPEN until A4 |
| A2 | Hardening migration | Infrastructure | A1 | OPEN until A4 |
| A3 | Dataset seeding | Operational | A1, A2 | OPEN (data DELETE is safe before A4) |
| A4 | Phase 2.2A canonical propagation | Runtime | A1, A3, getDaysUntilWatering fix | CLOSES at first new plant post-A4 |
| A5 | Phase 2.2B alias activation | Runtime | A4 | Partial close — new alias resolutions |
| A6 | Phase 2.3A scheduler rebinding | Runtime | A4, A5, getDaysUntilWatering fix | CLOSES for rebound plants |
| A7 | Phase 2.3B archetype activation | Runtime | A4, A5, A6, collapse_mappings schema | Partial close — archetype resolutions |
| A8 | Phase B3+ seasonal scheduling | Runtime | A6, getDaysUntilWatering fix, seasonal_watering_adjustment column | CLOSES for adjusted plants |

---

## EXPLICITLY FORBIDDEN ACTIVATION ORDERS

The following orderings are structurally or operationally unsafe. Each is documented with the specific failure mode it produces, distinguishing between silent failures (no immediate error, but incorrect behavior) and hard failures (immediate error or data loss).

---

### Forbidden Order F1 — Alias Routing Before Seeding

**Forbidden sequence:** Apply A5 (alias routing activation) before A3 (dataset seeding)

**Failure mode:** Silent degradation

**What happens:** The alias resolution code path is wired and active, but `plant_aliases` is empty. Every species lookup that reaches the alias tier finds zero rows. The resolution falls through to `no_match`, and the plant receives `frequency_days = 7` (fallback). No error is raised. Users entering "Pothos" instead of "Epipremnum aureum" silently receive a 7-day fallback schedule instead of the correct species profile.

**Why this is worse than it appears:** The silent 7-day fallback is indistinguishable from the correct behavior for species that genuinely have a 7-day profile. Users creating plants during the empty-alias window cannot know their schedules are wrong. If the alias seeding occurs later, existing plants created during the window are not retroactively corrected — they retain their `species_resolution_method = 'no_match'` and their 7-day `frequency_days` permanently.

**The activation guard:** A3 (seeding) must be confirmed complete with a row count validation before A5 is deployed. The required pre-activation check:
```sql
SELECT COUNT(*) FROM plant_aliases;
-- Must be > 0 before A5 deployment is authorized
```

---

### Forbidden Order F2 — Scheduler Rebinding Before Scheduler Fix

**Forbidden sequence:** Apply A6 (scheduler rebinding) before the `getDaysUntilWatering` fix (RAD-001)

**Failure mode:** Silent data inconsistency with user-visible consequence

**What happens:** A6 writes canonical-derived `frequency_days` values to care tasks. In some cases, the canonical profile frequency differs from the ilike-derived frequency the plant had at creation — for example, a plant created with 7-day fallback now has its canonical profile's 14-day frequency written. The `getDaysUntilWatering` function reads `last_completed_at + frequency_days * ms` — it correctly picks up the new `frequency_days = 14` and computes the new countdown. So far, this works.

But seasonal scheduling (A8) writes a different `next_due_at` than `last_completed_at + frequency_days`. After A8, `getDaysUntilWatering` must read `next_due_at` directly — not compute from `last_completed_at + frequency_days`. If the fix is not deployed before A8, the seasonal adjustment is written to `next_due_at` but `getDaysUntilWatering` ignores it. The UI shows a non-seasonal countdown even though the DB contains seasonal data.

**The compounding failure:** A6 applied before the fix does not immediately cause a visible error — but it makes A8 dangerous. A8 applied before the fix produces the silent `next_due_at` / UI countdown divergence. The divergence grows over time as seasonal adjustments accumulate. A plant with a correct 21-day `next_due_at` (summer adjustment) displays "7 days" in the UI (unadjusted computation). The user waters correctly but the UI is lying about the schedule.

**The activation guard:** The `getDaysUntilWatering` fix (RAD-001) is a REQUIRED prerequisite for A6 AND A8. No Class 5 migration or activation may proceed without confirmed deployment of this fix. Governance documentation at every relevant gate must confirm: "getDaysUntilWatering fix deployed and verified."

---

### Forbidden Order F3 — Canonical Propagation Before Coexistence Validation

**Forbidden sequence:** Apply A4 (Phase 2.2A canonical propagation) before verifying that canonical isolation holds (all Phase 2.1 columns are NULL on all existing plants)

**Failure mode:** Hard failure or data integrity violation

**What happens — hard failure scenario:** If any Phase 2.1 column has a non-null value on any existing plant row (due to a DEFAULT that silently populated rows during migration, or an unauthorized write), removing the Phase 2.1 shim causes a double-write problem. The shim was protecting against an absent column — now the column exists and the shim's stripping was ensuring zero writes. If the column already has a non-null value from a prior unauthorized write, A4 activation causes the canonical routing to see that pre-existing value as an already-resolved canonical ID — producing incorrect species resolution for the affected plants.

**What happens — coexistence validation skipped scenario:** The shim is removed before confirming that `canonical_species` and `plant_aliases` are seeded. The canonical routing slot is active but references empty tables. New plants are written with `canonical_species_id = NULL` and `species_resolution_method = 'no_match'` — not because the species is unknown, but because the reference tables are empty. The user enters "Monstera deliciosa" and the app silently treats it as an unknown species.

**The activation guard:** Before A4 deployment, coexistence validation must confirm:
```sql
SELECT COUNT(*) FROM plants WHERE canonical_species_id IS NOT NULL;
-- Must be 0 — confirms no prior canonical writes

SELECT COUNT(*) FROM canonical_species;
-- Must be > 0 — confirms seeding is complete

SELECT COUNT(*) FROM plant_aliases;
-- Must be > 0 — confirms alias data is available
```

Both the isolation check AND the seeding check must pass before A4 may proceed.

---

### Forbidden Order F4 — Seasonal Scheduling Before `next_due_at` Repair

**Forbidden sequence:** Apply A8 (seasonal scheduling) before the `getDaysUntilWatering` fix (RAD-001) AND before confirming `next_due_at` write/read consistency

**Failure mode:** Silent UI/data divergence, worsening over time

**What happens:** Seasonal scheduling writes a `next_due_at` value that is different from `last_completed_at + frequency_days`. For example, in summer a plant with 10-day base frequency might have `next_due_at = last_completed_at + 14 days` (extended for summer heat). The DB correctly stores the 14-day `next_due_at`. The `getDaysUntilWatering` function reads `last_completed_at + frequency_days * ms = last_completed_at + 10 days` — ignoring `next_due_at` entirely. The UI tells the user to water in 10 days. The DB wants watering in 14 days. The plant is watered 4 days early. The DB records the watering event, resets `next_due_at` for the new cycle, but the over-watering has already occurred.

**The cumulative harm:** Over a growing season, a plant that should be watered every 14 days (summer adjustment) is watered every 10 days because the UI ignores the seasonal `next_due_at`. For moisture-sensitive species, this produces overwatering stress. The user is following the app — the app is wrong.

**Why this is the most important independent fix:** The `getDaysUntilWatering` / `next_due_at` divergence (RAD-001) is harmful even before seasonal scheduling — if `next_due_at` is ever written with a value different from `last_completed_at + frequency_days * ms`, the UI shows the wrong countdown. The fix is the highest-priority independent improvement in the governance corpus and is a hard prerequisite for A6, A7, and A8.

---

### Forbidden Order F5 — collapse_mappings Activation Before Schema Creation

**Forbidden sequence:** Apply A7 (archetype activation) before the `collapse_mappings` table exists

**Failure mode:** Hard failure (runtime error on archetype resolution attempt)

**What happens:** The TypeScript interface `CollapseMapping` exists in `types/canonical.ts`. If the archetype routing code is deployed before the `collapse_mappings` table is created, the Supabase client query against a non-existent table returns an error. Depending on error handling, this either crashes the care profile resolution or silently falls through — leaving the plant with a fallback schedule instead of an archetype-derived schedule.

**The activation guard:** `collapse_mappings` table must be confirmed present before A7 deployment:
```sql
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'collapse_mappings'
) AS table_exists;
-- Must be true before A7 deployment
```

---

### Forbidden Order F6 — Seasonal Column Activation Before DB Column Creation

**Forbidden sequence:** Apply A8 (seasonal scheduling) before the `seasonal_watering_adjustment` DB column exists in `plant_care_profiles`

**Failure mode:** Silent fallback (no DB error because the column is declared nullable in TypeScript types but the DB returns null — the seasonal adjustment is always `null`, always ignored)

**What happens:** The TypeScript type `PlantCareProfile` includes `seasonal_watering_adjustment?: number`. The application code reads this field from the Supabase query result. If the DB column does not exist, `SELECT *` from `plant_care_profiles` does not include the field — the TypeScript value is `undefined`. The optional chaining `careProfile.seasonal_watering_adjustment ?? 1.0` returns `1.0` (the neutral multiplier). Seasonal scheduling is silently a no-op — no error, but no seasonal adjustment either.

**Why this is classified as forbidden despite being silent:** Users would be told they have seasonal scheduling when they do not. The feature announcement would be inaccurate. More critically: the governance documents (including `STALE_ASSUMPTION_REGISTRY.md`) include `seasonal_watering_adjustment` as a known missing DB column — any activation of seasonal scheduling without first confirming the column exists violates the governance contract.

**The activation guard:** Before A8, confirm the column exists:
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'plant_care_profiles'
    AND column_name = 'seasonal_watering_adjustment'
) AS column_exists;
-- Must be true before A8 deployment
```

---

## RUNTIME PROTECTION GUARANTEES

Every activation step, regardless of category or complexity, must preserve the following four runtime properties for all existing users. These are the same properties specified in `MIGRATION_ROLLBACK_STRATEGY.md §Runtime Preservation Rules`, restated here from the activation perspective — confirming what each activation step is explicitly prohibited from disrupting.

---

### Protection GP-1 — Coexistence Preservation

**Guarantee:** At every activation step, the coexistence mechanisms that protect inactive systems remain intact until the specific activation event that governs their removal.

**What this means per step:**

| Step | Coexistence protection status |
|---|---|
| A1 (infrastructure) | Phase 2.1 shim remains active; new columns exist but are write-protected |
| A2 (hardening) | Same as A1 — hardening adds indexes, not columns |
| A3 (seeding) | Same as A1 — data in canonical tables is invisible to the app; routing is still commented |
| A4 (canonical propagation) | Shim removal is the activation — this step intentionally ends Phase 2.1 coexistence protection for new plants only; existing plants retain NULL canonical columns |
| A5+ | Successive coexistence protections (alias routing gate, scheduler gate) remain until their specific activation steps |

**The coexistence preservation test at each step:** Before any deployment, confirm that removing the coexistence protection for the current step does not affect systems that are not yet scheduled for activation. Specifically: removing the Phase 2.1 shim (A4) must not activate alias routing (A5), scheduler rebinding (A6), or archetype resolution (A7) — those routing slots must still be inactive.

---

### Protection GP-2 — Onboarding Continuity

**Guarantee:** Plant creation must succeed at every activation step, for both recognized and unrecognized species, with a correct care schedule assigned.

**What each activation step must preserve:**

| Step | Onboarding continuity requirement |
|---|---|
| A1 | `plant_care_profiles` row count ≥ pre-migration baseline; ilike resolution works |
| A2 | `plant_care_profiles` unchanged — hardening adds indexes, not data |
| A3 | Seeding adds rows to `canonical_species` and `plant_aliases` — must not DELETE any `plant_care_profiles` row; ilike resolution continues unchanged |
| A4 | Onboarding path through the NEW canonical routing must also succeed; recognized species get canonical ID; unrecognized species get `no_match` + fallback schedule |
| A5 | Alias tier addition must not break ilike tier; "Monstera deliciosa" via ilike still works |
| A6 | Scheduler rebinding must produce correct `frequency_days` from canonical profile; must not produce NULL or zero |
| A7 | Archetype resolution must fall back gracefully for species not in any collapse mapping |
| A8 | Seasonal adjustment must be a multiplier on the base frequency, not a replacement; if seasonal data is absent, base frequency applies |

**The onboarding continuity test:** At every activation step, perform RTV-01 (recognized species) and RTV-02 (unrecognized species) from the postcheck runbook. Both must pass.

---

### Protection GP-3 — Scheduler Continuity

**Guarantee:** No existing plant's countdown may change as a result of an activation step that does not explicitly govern scheduler state changes.

**Which activation steps govern scheduler state changes (and thus may change countdowns):**
- A6 (scheduler rebinding) — explicitly authorizes `frequency_days` changes for plants whose canonical profile differs
- A8 (seasonal scheduling) — explicitly authorizes `next_due_at` changes incorporating seasonal multipliers

**All other steps must leave scheduling data unchanged:**

| Step | Scheduler continuity requirement |
|---|---|
| A1 | No scheduling columns touched — confirmed by precheck SCHED-01 through SCHED-04 |
| A2 | No scheduling tables touched — indexes only |
| A3 | No scheduling tables touched — seeding is to canonical and alias tables only |
| A4 | New plants receive canonical-derived `frequency_days` from `plant_care_profiles` via the new routing; existing plants' `frequency_days` unchanged; no existing countdown changes |
| A5 | Existing plants unchanged; new plants using alias resolution receive the same profile data as ilike resolution (both source from `plant_care_profiles`) |

**The scheduler continuity test:** At A4, confirm that all pre-existing plants show countdowns within ±1 day of their pre-activation baseline (per the SCHED-02 precheck query). A countdown that changes by more than 1 day without a corresponding watering event indicates an unauthorized scheduler modification.

---

### Protection GP-4 — Rollback-Safe Activation

**Guarantee:** Each activation step is designed so that rollback of the step does not produce a state worse than the pre-activation state. Specifically: rollback of an activation step must not require rollback of a prior activation step.

**Rollback-safety profile per step:**

| Step | Rollback-safe? | Rollback method | Post-rollback state |
|---|---|---|---|
| A1 | YES (while canonical isolation holds) | SQL DDL rollback per rollback strategy Category R2 | Returns to Phase B1 schema |
| A2 | YES (always) | DROP INDEX statements | Returns to post-A1 schema |
| A3 | YES (while A4 not yet deployed) | DELETE seeded rows | Returns to empty canonical tables |
| A4 | CONDITIONAL — open until first non-null canonical write | Redeploy shim; optional schema rollback if no users affected | Returns to Phase 2.1 shim-protected state |
| A5 | CONDITIONAL — reverting code removes alias tier | Redeploy without alias routing | Alias lookups return to falling-through |
| A6 | PARTIALLY CONDITIONAL | Code revert; `frequency_days` restoration is species-by-species | Original `frequency_days` may not be accurately restorable |
| A7 | CONDITIONAL | Code revert; archetype resolution inactive | Returns to canonical-only resolution |
| A8 | PARTIALLY CONDITIONAL | Code revert; `next_due_at` retains seasonal values (requires re-read) | Seasonal values in DB but UI reverts to non-seasonal countdown |

**The rollback-safety cascade rule:** If A4 rollback is triggered, A5 must also be rolled back (if deployed), because A5 depends on the Phase 2.1 columns existing. A4 rollback removes those columns. Any rollback of A1 (schema) must be preceded by rollback of A4 and A5 (code). Rollback of a later step does not require rollback of earlier steps unless the earlier step created a prerequisite that the later step depends on.

---

## GOVERNANCE ESCALATION CONDITIONS

### Conditions Requiring Full Governance Review

The following conditions, if encountered at any activation step, require pausing the activation sequence and returning to full governance review before proceeding. "Full governance review" means: re-reading the full governance document corpus, confirming all authorization conditions, re-running the relevant precheck queries, and obtaining Tier 1 re-authorization.

| Code | Condition | Reason |
|---|---|---|
| **ESC-01** | Any user-data row count decreased during an activation event | Data loss — the highest-severity governance event; all activation sequences suspended |
| **ESC-02** | Any Phase 2.1 column has a non-null value on an existing plant before A4 is deployed | Unauthorized canonical write occurred; activation ordering guarantee violated |
| **ESC-03** | Plant creation returns HTTP 400 at any activation step | An activation step broke the onboarding path; core user flow is down |
| **ESC-04** | `canonical_species` or `plant_aliases` are non-empty before A3 is explicitly applied | Unauthorized seeding occurred outside the governance lifecycle |
| **ESC-05** | The `getDaysUntilWatering` function is confirmed reading `next_due_at` incorrectly after its fix was declared deployed | The fix is not working; A6 and A8 are blocked until re-confirmed |
| **ESC-06** | A governance document describes a system as INACTIVE but the live app is exhibiting behavior consistent with that system being ACTIVE | Unauthorized activation occurred; the `ACTIVATION_BOUNDARY_REGISTRY.md` is stale |
| **ESC-07** | An activation step is applied out of sequence (e.g., A5 applied before A4 is confirmed complete) | Activation ordering violation; the entire sequence must be audited |
| **ESC-08** | Any new trigger is found on `plants`, `care_tasks`, `care_logs`, or `plant_care_profiles` that was not created by an authorized migration | Unauthorized schema modification; activation must pause until the trigger is explained |
| **ESC-09** | `plant_care_profiles` row count decreases at any point after A1 | §B7 recreation integrity failure; ilike resolution is degraded |
| **ESC-10** | A countdown for an existing plant changes by more than 1 day at an activation step that does not govern scheduler state | Unauthorized scheduler mutation; A6 and A8 blocked until source identified |

---

### Conditions That Block Activation

The following conditions block the specific activation step they pertain to. They do not require a full governance review but must be resolved before the blocked step may proceed.

| Code | Blocks step | Condition | Resolution |
|---|---|---|---|
| **BLK-01** | A1 | `plant_care_profiles` user_id column exists (ABORT-A04) | §B7 redesign required before A1 may proceed |
| **BLK-02** | A1 | CHECK constraint name in migration SQL does not match live DB (ABORT-A03) | Revise migration SQL to use actual constraint name |
| **BLK-03** | A2 | `plant_aliases` table absent (A1 not complete) | Complete A1 first |
| **BLK-04** | A3 | `plant_aliases` indexes absent (A2 not complete) | Complete A2 first |
| **BLK-05** | A4 | `getDaysUntilWatering` fix not deployed | Deploy the fix; confirm with code review |
| **BLK-06** | A4 | `canonical_species` is empty | Complete A3 first |
| **BLK-07** | A4 | Canonical isolation not confirmed (non-null canonical_species_id on any plant) | Investigate source of non-null value before proceeding |
| **BLK-08** | A6 | A4 not complete and confirmed stable | Complete A4 and confirm zero HTTP 400s over a usage cycle |
| **BLK-09** | A6 | `getDaysUntilWatering` fix not deployed | Same as BLK-05 — this fix blocks both A4 (soft) and A6 (hard) |
| **BLK-10** | A7 | `collapse_mappings` table absent | Create the table via a governed migration before A7 |
| **BLK-11** | A8 | `seasonal_watering_adjustment` DB column absent | Create the column via a governed migration before A8 |
| **BLK-12** | A8 | `getDaysUntilWatering` fix not deployed | This fix is an absolute prerequisite for A8; seasonal scheduling without it is silently a no-op |
| **BLK-13** | All steps | The migration execution ledger has an entry with `execution_status = 'partial'` for any prerequisite migration | Resolve the partial migration before any downstream activation |

---

### Conditions Requiring Freeze Supersession

The governance documents frozen at Phase B2.0 describe a system state that changes with each activation event. The following activation events require explicit updates to specific frozen documents before the next activation step may begin. "Freeze supersession" means appending a dated update section to the document — not deleting or replacing the original freeze content.

| Activation event | Documents requiring supersession |
|---|---|
| A1 complete (supabase-migration-v2.sql applied) | `OPERATIONAL_BASELINE_MANIFEST.md` (schema baseline updated), `STALE_ASSUMPTION_REGISTRY.md` (canonical table absence resolved), `ACTIVATION_BOUNDARY_REGISTRY.md` (schema readiness updated for canonical/alias routing), `COEXISTENCE_STATE_FREEZE.md` (coexistence state updated: columns now exist as NULL) |
| A2 complete (hardening applied) | `OPERATIONAL_BASELINE_MANIFEST.md` (index inventory updated) |
| A3 complete (dataset seeding) | `STALE_ASSUMPTION_REGISTRY.md` (empty canonical tables assumption resolved), `ACTIVATION_BOUNDARY_REGISTRY.md` (data readiness updated: canonical and alias tables now seeded), `OPERATIONAL_BASELINE_MANIFEST.md` (row counts updated) |
| A4 complete (Phase 2.2A canonical propagation) | `ACTIVATION_BOUNDARY_REGISTRY.md` (Phase 2.2A status: ACTIVE), `RUNTIME_COMPATIBILITY_CONTRACT.md` (guarantee RCC-08 canonical isolation no longer absolute — new plants may have canonical IDs), `COEXISTENCE_STATE_FREEZE.md` (Phase 2.1 shim removed — coexistence architecture superseded), `MIGRATION_ROLLBACK_STRATEGY.md` (rollback window section: window closed for new plants), `STALE_ASSUMPTION_REGISTRY.md` (Phase 2.1 shim active assumption: superseded) |
| A6 complete (scheduler rebinding) | `RUNTIME_COMPATIBILITY_CONTRACT.md` (RCC-04 through RCC-06 scheduler guarantees updated), `STALE_ASSUMPTION_REGISTRY.md` (getDaysUntilWatering debt: resolved or documented as resolved) |
| A8 complete (seasonal scheduling) | `RUNTIME_COMPATIBILITY_CONTRACT.md` (all scheduler guarantees updated to reflect seasonal adjustments), `OPERATIONAL_BASELINE_MANIFEST.md` (seasonal scheduling active state recorded) |

**The supersession timing requirement:** Freeze supersession must be completed within 24 hours of the activation event completing. The next activation step must not begin until the supersession documents for the prior step are updated. This ensures the governance document corpus never describes a state that is more than one activation step behind the live system.

**The supersession record format:** Each supersession appends a section to the target document in the format:
```
## Post-[ActivationStep]-[Date] Update

Activation event: [step name]
Activation date: [YYYY-MM-DD]
Applied by: [name]
Superseded statements: [list of specific original statements that are now false]
Replacement statements: [what is now true]
Reference: MIGRATION_EXECUTION_LEDGER.md entry for [migration or deployment]
```

---

## ACTIVATION SEQUENCE HEALTH CHECKLIST

Before each activation step, confirm the prior step's health by completing this abbreviated checklist. This is the minimal check — the full precheck/postcheck runbooks apply for migration steps.

```
Step prior to current: _______________

□ ASH-01: Prior step's postcheck was completed and marked PASS
□ ASH-02: Freeze supersession for prior step is complete (within 24 hours)
□ ASH-03: No ESC-class escalation conditions are open from any prior step
□ ASH-04: No BLK-class blocking conditions apply to the current step
□ ASH-05: getDaysUntilWatering fix status confirmed (deployed / not-yet-needed)
□ ASH-06: Current step's Tier 1 authorization confirmed in governance corpus
□ ASH-07: Rollback approach for current step is documented and ready
□ ASH-08: Runtime protection guarantees GP-1 through GP-4 are intact (confirmed by targeted query)

All 8 checks must pass before the current activation step begins.
Any single failing check requires resolution before proceeding.
```

---

*This document is a read-only activation sequence guardrail specification. No runtime systems were activated, no routing was uncommented, no scheduler behavior was modified, and no onboarding behavior was altered in its generation. The activation events described here are future governance events. None of the steps A1 through A8 have been executed as of this document's authoring date — A1 (supabase-migration-v2.sql) is the next pending event in the sequence.*
