# PLANTMON — Migration Rollback Strategy

**Classification:** Governance Migration Authority  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + `MIGRATION_EXECUTION_PROTOCOL.md` + `MIGRATION_AUTHORITY_DECLARATION.md` + `RUNTIME_COMPATIBILITY_CONTRACT.md` + `ACTIVATION_BOUNDARY_REGISTRY.md` + `MIGRATION_POSTCHECK_RUNBOOK.md`  

This document is the authoritative rollback governance model for PLANTMON. It defines the principles that constrain rollback decisions, the categories of rollback that correspond to migration types, the events that permanently foreclose safe rollback, the decision framework for choosing between rollback vs. forward continuation, and the runtime properties that every rollback must preserve. No code, schema, or migration file was modified in its generation.

**Critical framing:** Rollback is not the default response to a failed migration. It is one of three possible responses — the others being hotfix-forward and coexistence continuation. Choosing the wrong response can cause more damage than the original migration failure. This document exists to ensure the choice is deliberate, governed, and irreversibility-aware.

---

## ROLLBACK GOVERNANCE PRINCIPLES

### Principle 1 — Rollback-Safe Sequencing

**Statement:** Rollback operations must be executed in the reverse order of the forward migration — last forward operation first, first forward operation last. No rollback operation may depend on a schema object that the rollback itself has already dropped.

**Why sequencing matters for rollback:**

Forward migrations are additive and sequentially dependent — `plant_aliases` can be created after `canonical_species` because the FK target exists. Rollback reverses this dependency: `plant_aliases` must be dropped before `canonical_species` because dropping `canonical_species` first would orphan the FK in `plant_aliases`, potentially causing a constraint violation during the DROP.

**The PLANTMON rollback dependency chain for `supabase-migration-v2.sql`:**

```
Forward order (applied):
  §B1: CREATE TABLE canonical_species
  §B2: CREATE TABLE plant_aliases (FK → canonical_species)
  §B3: ALTER TABLE plants ADD COLUMN canonical_species_id
  §B4: ALTER TABLE plants ADD COLUMN user_entered_name
  §B5: ALTER TABLE plants ADD COLUMN canonical_species_name
  §B6: ALTER TABLE plants ADD COLUMN species_resolution_method
  §B7: DROP TABLE plant_care_profiles; CREATE TABLE plant_care_profiles (recreate)
  §B8: ALTER TABLE care_tasks ADD COLUMN canonical_species_id
  §B9: ALTER TABLE care_logs ADD COLUMN canonical_species_id
  §B10: ALTER TABLE plant_care_profiles ADD COLUMN canonical_species_id
  §B11+: CREATE POLICY / ENABLE RLS on new tables

Rollback order (reverse):
  §B11+: DROP POLICY on canonical_species, plant_aliases
  §B10: ALTER TABLE plant_care_profiles DROP COLUMN canonical_species_id
  §B9: ALTER TABLE care_logs DROP COLUMN canonical_species_id
  §B8: ALTER TABLE care_tasks DROP COLUMN canonical_species_id
  §B7: DROP TABLE plant_care_profiles; RESTORE FROM pg_dump backup
  §B6: ALTER TABLE plants DROP COLUMN species_resolution_method
  §B5: ALTER TABLE plants DROP COLUMN canonical_species_name
  §B4: ALTER TABLE plants DROP COLUMN user_entered_name
  §B3: ALTER TABLE plants DROP COLUMN canonical_species_id
  §B2: DROP TABLE plant_aliases          ← must precede §B1
  §B1: DROP TABLE canonical_species      ← must be last
```

**Sequencing violation risk:** Dropping `canonical_species` (§B1) before dropping `plant_aliases` (§B2) attempts to remove the FK target while a table with an active FK to it still exists. PostgreSQL will reject the DROP with a "table is referenced by foreign key constraint" error. The rollback stalls mid-execution.

**Atomicity requirement:** The rollback for `supabase-migration-v2.sql §B7` (the `plant_care_profiles` DROP-and-recreate) is not a DROP — it is a restore from the `pg_dump` backup captured in Step 3 of the execution lifecycle. This restore must occur as an atomic operation: DROP the new `plant_care_profiles`, then immediately restore the original from backup. There is no intermediate state where `plant_care_profiles` is absent — if the DROP succeeds but the restore fails, the table is gone.

---

### Principle 2 — Coexistence Preservation

**Statement:** A migration rollback must not break the coexistence mechanisms that currently protect the runtime. After rollback, the four coexistence invariants must be restored exactly: Phase 2.1 shim protects absent columns, `SELECT *` returns no unexpected columns, comment-gated slots remain inactive, TypeScript optional types match the restored schema.

**How rollback re-creates a coexistence-safe state:**

After `supabase-migration-v2.sql` is rolled back, the schema returns to the Phase B1 state — the state that existed before the migration. The coexistence mechanisms that were protecting the app before the migration are unchanged in the code. The shim strips Phase 2.1 columns whether they exist or not. The comment gates prevent canonical routing whether the tables exist or not. TypeScript optional types handle both `undefined` (column absent) and `null` (column present but unset) correctly.

**Rollback restores coexistence by removing the columns the shim was protecting against.** After rollback:

| Pre-migration | Post-migration | Post-rollback |
|---|---|---|
| `plants.canonical_species_id`: absent | `plants.canonical_species_id`: NULL | `plants.canonical_species_id`: absent |
| Shim strips it (absent column = 400 risk) | Shim strips it (present column = safe) | Shim strips it (absent column = 400 risk again) |
| SELECT * returns undefined for this field | SELECT * returns null | SELECT * returns undefined again |

**What rollback does NOT restore:** Any phase of code deployment that was tied to the migration. If a code change was deployed simultaneously with the migration (e.g., a new TypeScript type that hard-dereferences a Phase 2.1 field without optional chaining), the code rollback must accompany the schema rollback. The coexistence preservation principle applies to code state as well as schema state.

---

### Principle 3 — Scheduler Continuity Preservation

**Statement:** A migration rollback must not alter the care scheduling data of any existing plant. `care_tasks.frequency_days`, `care_tasks.last_completed_at`, and `care_tasks.next_due_at` must be identical before and after the rollback.

**Why rollback cannot safely alter scheduling data:**

The Phase B1 schema does not include `care_tasks.canonical_species_id`. Rolling back `supabase-migration-v2.sql` drops this column — but the column is NULL for all rows (canonical isolation guarantee). Dropping a column that is NULL for all rows has zero effect on scheduling data. The scheduling fields (`frequency_days`, `last_completed_at`, `next_due_at`) are untouched.

**The scheduler continuity preservation guarantee during rollback:**

```
Before rollback:
  care_tasks row: { id, plant_id, task_type, frequency_days=10, last_completed_at=T,
                    next_due_at=T+10d, active_status=true, canonical_species_id=NULL }

After rollback (DROP COLUMN canonical_species_id):
  care_tasks row: { id, plant_id, task_type, frequency_days=10, last_completed_at=T,
                    next_due_at=T+10d, active_status=true }

getDaysUntilWatering result: unchanged
UI countdown: unchanged
```

Rollback of the current authorized migrations preserves scheduler continuity by construction — the columns being dropped contain only NULL values, and no rollback operation touches the scheduling fields.

**The scheduler continuity risk unique to rollback of future migrations:** A future Class 5 (scheduler-affecting) migration whose rollback includes DML (e.g., `UPDATE care_tasks SET frequency_days = old_value WHERE ...`) introduces a risk not present in the current authorized migrations. That rollback would alter scheduling data for live plants. This risk is documented here for future reference, not as a current threat.

---

### Principle 4 — Onboarding Continuity Preservation

**Statement:** After rollback, plant creation must succeed with identical behavior to before the migration was applied. The ilike lookup must continue to work. The 7-day fallback must remain. The `plants` INSERT payload must be accepted by PostgREST.

**The critical §B7 onboarding continuity risk:**

`supabase-migration-v2.sql §B7` drops and recreates `plant_care_profiles`. If this section must be rolled back, the restoration path is a `pg_dump` restore — not an SQL reversal. The rollback is only onboarding-safe if the pg_dump backup is available and contains the complete pre-migration data.

If the pg_dump backup is absent or incomplete:
- Rollback of §B7 must be reconsidered as a hotfix-forward operation
- A hotfix migration must recreate `plant_care_profiles` and re-seed the reference data from source files
- Onboarding continuity is broken in the interval between the §B7 DROP and the completion of the hotfix — during this window, every plant creation receives the 7-day fallback

**The onboarding continuity check after rollback:**

```sql
-- Run immediately after rollback completion:
SELECT COUNT(*) FROM plant_care_profiles;
-- Must match pre-migration baseline from PC-DAT-02.
-- If lower: onboarding continuity is impaired; ilike lookup is degraded.

SELECT species_name, watering_frequency_days
FROM plant_care_profiles
WHERE species_name ILIKE '%monstera%';
-- Must return at least 1 row.
-- If 0 rows: common species have lost their profiles.
```

---

## MIGRATION ROLLBACK CATEGORIES

### Category R1 — Additive Schema Migration Rollback

**Applies to:** `PRE_DATASET_HARDENING_MIGRATION_v1.sql` (Class 1: Additive)

**Rollback approach:** Drop-only reversal. The rollback consists entirely of `DROP INDEX IF EXISTS` statements for each index created by the migration. No data is at risk. No user-visible behavior changes.

**Rollback complexity:** MINIMAL

**Pre-rollback checks:**
- Confirm no seeded data in `plant_aliases` exists — if the dataset has been seeded and users are actively resolving species via alias lookup, dropping the GIN index degrades lookup performance but does not break functionality
- Confirm the hardening migration is the only thing being rolled back — if `supabase-migration-v2.sql` is also being rolled back, `plant_aliases` will be dropped entirely (which also removes its indexes); run only the `supabase-migration-v2.sql` rollback in that case

**Post-rollback state:** Schema returns to post-`supabase-migration-v2.sql` state (tables present, no GIN index). Alias lookups are possible but sequential scan only — performance degraded but functionally correct.

**Rollback irreversibility:** FULLY REVERSIBLE — indexes contain no data; they can be recreated at any time by re-applying the hardening migration.

---

### Category R2 — Canonical Infrastructure Migration Rollback

**Applies to:** `supabase-migration-v2.sql` (Class 2: Coexistence)

**Rollback approach:** Multi-step reversal in reverse order of application. The rollback consists of: RLS policy drops, column drops from user-data tables, table drops for canonical infrastructure tables, and `plant_care_profiles` restore from pg_dump backup.

**Rollback complexity:** HIGH

**Pre-rollback requirements:**
1. pg_dump backup of pre-migration `plant_care_profiles` exists and is verified (taken during Step 3 of the execution lifecycle)
2. Canonical isolation confirmed: `SELECT COUNT(canonical_species_id) FROM plants WHERE canonical_species_id IS NOT NULL` must return 0. If non-zero, rollback is no longer in this category — see Non-Rollbackable Events.
3. New canonical tables are empty: `SELECT COUNT(*) FROM canonical_species; SELECT COUNT(*) FROM plant_aliases;` — both must return 0. If either is non-zero (seeding has occurred), rollback requires a data decision (see Non-Rollbackable Events for seeded data).

**The §B7 restore requirement:** Before executing any DROP in the rollback sequence, confirm the pg_dump backup is accessible and the restore procedure is ready. If the backup is unavailable, do not execute §B7 in the rollback — execute all other drops first, then assess the `plant_care_profiles` restoration path separately.

**Post-rollback state:** Schema returns to Phase B1 — exactly the state defined by `supabase-setup.sql`. All Phase 2.1 columns absent. All canonical tables absent. `plant_care_profiles` data restored to pre-migration content.

**Rollback irreversibility:** CONDITIONALLY REVERSIBLE — rollback is safe if the pre-conditions are met (canonical isolation preserved, tables empty, backup available). It becomes irreversible after Phase 2.2A activation writes canonical IDs to plants.

---

### Category R3 — Onboarding Migration Rollback

**Applies to:** Any migration that modifies the `plants` table structure, `plant_care_profiles` data, or the onboarding code path (classification: Class 6)

**Rollback approach:** Depends on what was modified:

| Modification type | Rollback approach |
|---|---|
| Column added to `plants` (nullable) | `ALTER TABLE plants DROP COLUMN IF EXISTS [column]` — safe if column contains only NULL values |
| `plant_care_profiles` row added | `DELETE FROM plant_care_profiles WHERE species_name = '[added species]'` — safe; removes only the added row |
| `plant_care_profiles` row modified | Restore original `watering_frequency_days` via UPDATE — safe; only affects future plants with that species |
| `plant_care_profiles` DROP-and-recreate (§B7) | pg_dump restore — requires backup |
| NOT NULL constraint added to `plants` | `ALTER TABLE plants ALTER COLUMN [col] DROP NOT NULL` — safe |

**Rollback complexity:** VARIABLE — from MINIMAL (single row delete) to HIGH (§B7 restore)

**Post-rollback state:** Onboarding behavior returns to pre-migration behavior — ilike resolution using pre-migration `plant_care_profiles` data.

**Onboarding continuity risk specific to R3:** Modifying and then rolling back `plant_care_profiles` data creates a care quality gap — plants created in the interval between the modification and the rollback received the modified care profile. Those plants retain their modified `frequency_days` post-rollback because plant creation writes `frequency_days` into `care_tasks`, not into `plants`. A `plant_care_profiles` data rollback does not retroactively alter existing care task data. Plants created in the migration window keep their modified schedule; new plants after rollback receive the pre-modification schedule.

---

### Category R4 — Scheduler-Affecting Migration Rollback

**Applies to:** Any future Class 5 migration (no Class 5 migrations exist in current authorized corpus)

**Rollback approach:** Determined at time of migration authoring. Documented here as a forward-looking constraint.

**Pre-conditions for any R4 rollback:**
1. The `getDaysUntilWatering` fix must have been deployed before the migration was applied (Class 5 pre-condition per `MIGRATION_EXECUTION_PROTOCOL.md §Constraint C1`)
2. The rollback SQL must include DML (not just DDL) if the migration wrote any seasonal adjustment data, rebinding data, or other scheduling DML
3. Any DML rollback must be targeted and plant-specific — not a blanket UPDATE that modifies all plants

**The scheduler continuity preservation challenge for R4 rollbacks:**

A Class 5 migration that writes `next_due_at` values using a seasonal adjustment formula cannot be trivially rolled back by setting `next_due_at` back to `last_completed_at + frequency_days * 86400s` — because `last_completed_at` may have been updated since the migration ran (the user may have watered plants in the interval). The rollback must use the `last_completed_at` value at rollback time, not at migration time. This means the rolled-back schedule reflects the current watering state, not the pre-migration state.

**Rollback complexity:** HIGH to CRITICAL — DML rollbacks for scheduling data carry risk of mass care schedule disruption.

---

### Category R5 — Destructive Migration Rollback

**Applies to:** Any Class 4 migration (prohibited in Phase B2.x per `MIGRATION_AUTHORITY_DECLARATION.md`)

**Rollback approach:** Only possible via pg_dump backup taken before migration execution.

**Rollback complexity:** CRITICAL

**Why destructive migrations have no SQL rollback path:** `DROP TABLE` with user data cannot be reversed with SQL alone — the data is gone. `ALTER TABLE ... DROP COLUMN` with user data cannot be reversed — the column values are gone. The only rollback path is a full or partial database restore from backup. This is why Class 4 migrations against user-data tables are prohibited: their rollback cost is categorically higher than any other migration class.

**If a Class 4 migration is applied against a user-data table in violation of governance:**
1. Assess whether a pg_dump backup was taken before the migration (should always be taken per execution protocol)
2. If backup exists: restore affected table(s) from backup; verify row counts against governance baseline
3. If backup absent: data loss is permanent; escalate to Tier 1; user notification may be required
4. Perform root cause analysis on governance failure that allowed a Class 4 migration to proceed

---

## NON-ROLLBACKABLE EVENTS

### Non-Rollbackable Event 1 — Canonical Propagation

**Definition:** The state reached when `plants.canonical_species_id` has been populated with non-null values for one or more existing plants — either by Phase 2.2A runtime activation (new plants receiving canonical IDs) or by a backfill operation.

**Why rollback is not safe after canonical propagation:**

Rolling back `supabase-migration-v2.sql` after canonical propagation requires dropping `plants.canonical_species_id`. This destroys the canonical associations for every plant that received one. After rollback:
- Every plant that had `canonical_species_id = 'PLANT_0042'` now has no canonical association
- The app (which had Phase 2.2A activated) now has no canonical infrastructure to operate against
- The Phase 2.1 shim was removed as part of Phase 2.2A activation — restoring it without the schema rollback causes a 400 error; restoring both simultaneously requires a coordinated code + schema rollback that is more complex than a forward fix

**The correct response to canonical propagation + migration failure:** Hotfix-forward. Author and apply a corrective migration that repairs the specific failure while preserving canonical associations. Do not roll back a migration that has already propagated canonical data.

**The pre-condition gate:** Canonical propagation can only occur after the Phase 2.1 shim has been removed (Phase 2.2A activation). The rollback window for `supabase-migration-v2.sql` is: between migration application and Phase 2.2A activation. As long as the shim is active, `canonical_species_id` cannot be written to any plant row — the rollback window is open.

---

### Non-Rollbackable Event 2 — Care Log Canonical Orphaning

**Definition:** The state reached when `care_logs.canonical_species_id` has been populated for existing care log rows — meaning watering events have occurred after Phase 2.2A activation and the care log write has been wired.

**Why rollback is not safe:**

Rolling back `supabase-migration-v2.sql` after care log canonical orphaning requires dropping `care_logs.canonical_species_id`. This destroys the canonical associations in every historical care log that was written after Phase 2.2A activation. The care log rows still exist but their canonical context is permanently erased.

This is a weaker non-rollbackable event than canonical propagation — the care logs are not functionally broken (they remain valid care history), but the canonical resolution method embedded in them is lost. The decision to roll back must account for this information loss.

**The correct response:** If care log canonical data has been written, assess whether the information loss is acceptable before proceeding with rollback. If the information loss is acceptable (e.g., Phase 2.2A was recently activated and only a few watering events have occurred), document the loss in the governance ledger and proceed. If the loss is not acceptable (substantial canonical history exists), hotfix-forward.

---

### Non-Rollbackable Event 3 — Scheduler Rebinding

**Definition:** The state reached when `care_tasks.frequency_days` has been updated by a scheduler rebinding event (Phase B2.2 activation) to reflect a canonical-profile-derived interval rather than the original ilike-derived interval.

**Why rollback is not safe:**

Rolling back a migration after scheduler rebinding requires restoring the original `frequency_days` values for all affected plants. The original values are not stored anywhere — the rebinding overwrote them. The only recovery path is:
1. Re-derive the original `frequency_days` from the original ilike lookup (which requires `plant_care_profiles` data and the plant's `species_name`)
2. Apply those re-derived values via a manual UPDATE

This is not a simple DDL rollback — it is a data recovery exercise with a non-trivial failure mode: if the ilike lookup for a plant's species returns a different `watering_frequency_days` than it did at plant creation time (e.g., because `plant_care_profiles` data was updated between creation and rollback), the "restored" schedule is different from the original schedule.

**The correct response:** Scheduler rebinding is a point-of-no-return for the affected care tasks. Rollback of the underlying migration (removing `canonical_species_id` from `care_tasks`) can proceed, but the `frequency_days` values cannot be reliably restored to their pre-rebinding state without a manual, species-by-species recovery effort.

---

### Non-Rollbackable Event 4 — Historical Task Mutation

**Definition:** Any event that modifies the `frequency_days`, `last_completed_at`, or `next_due_at` values of care tasks that have a care history — i.e., tasks where `last_completed_at` is non-null and `care_logs` rows exist.

**Why rollback is not safe:**

A care task with watering history represents a real sequence of care events. Modifying and then rolling back the scheduling fields of such a task produces a final state that does not accurately represent either the original schedule or the modified schedule — it is a third, synthetic state that was never the true schedule at any point in time.

**Concrete example:** A plant was created with `frequency_days = 10`. A scheduler rebinding migration changes it to `frequency_days = 8` (canonical profile). During the 8-day window, the user waters the plant twice, correctly expecting 8-day intervals. A rollback sets `frequency_days = 10`. Now the user's countdowns jump from the 8-day expectation to a 10-day expectation — a silent 2-day extension per cycle, unexplained to the user.

**The correct response:** Historical task mutation is not a rollback problem — it is an activation governance problem. Class 5 (scheduler-affecting) migrations must not be applied until the activation readiness criteria are fully met. Once a scheduler mutation has occurred with user-facing consequences, the response is a user-facing communication and a forward correction, not a silent rollback.

---

## ROLLBACK DECISION FRAMEWORK

### Decision Axis 1 — Is User Data at Risk?

This is the first and overriding question. If any user-data row count has decreased (plants, care_tasks, care_logs, health_logs, journal_entries), rollback is mandatory and immediate — no other analysis applies.

```
Has any user-data row count decreased from pre-migration baseline?
  YES → ROLLBACK IMMEDIATELY (non-negotiable; see Category R2 or R5)
  NO  → Proceed to Decision Axis 2
```

---

### Decision Axis 2 — Is the App Currently Broken for Users?

**Broken** means: plant creation fails, watering fails, plant list fails to load, or any core user flow returns an error.

```
Is any currently-operational user flow broken?
  YES → Is it broken due to a structural schema change (new NOT NULL, wrong constraint)?
          YES → ROLLBACK (the schema change broke the app; rollback restores function)
          NO  → Is it broken due to absent data (tables exist but no profiles)?
                  YES → HOTFIX-FORWARD (restore the data; rollback would remove the tables)
                  NO  → INVESTIGATE (failure may be unrelated to migration)
  NO  → Proceed to Decision Axis 3
```

**Why rollback is preferred over hotfix-forward when the app is structurally broken:** A structural break (wrong constraint, NOT NULL column added, column renamed) cannot be fixed by adding data — it requires altering the schema. If the schema alteration is complex, a rollback (returning to a known-good state) is safer than a forward schema alteration (whose correctness is untested). The exception: if the structural break is simple and well-understood (e.g., a missing `IF NOT EXISTS` caused a partial execution), a targeted forward fix may be safer.

---

### Decision Axis 3 — Has the Non-Rollbackable Threshold Been Crossed?

```
Has canonical propagation occurred?
(i.e., are there any non-null canonical_species_id values in plants?)
  YES → HOTFIX-FORWARD REQUIRED (rollback would destroy canonical associations)
  NO  → Has Phase 2.2A runtime activation occurred?
          YES → ROLLBACK WINDOW IS CLOSING (proceed only if no new plants yet created)
          NO  → Rollback window is open; proceed to Decision Axis 4
```

```
Has dataset seeding occurred?
(i.e., are canonical_species or plant_aliases non-empty?)
  YES → Rollback of supabase-migration-v2.sql requires data decision:
          Are the seeded rows development data or user data?
            Development data (no users affected) → ROLLBACK PERMISSIBLE (drop tables)
            User-adjacent data (aliases affect user resolution) → ASSESS IMPACT
  NO  → Proceed to Decision Axis 4
```

---

### Decision Axis 4 — When Is Coexistence Continuation Safer Than Rollback?

**Coexistence continuation** means: accept the migration as applied, do not roll back, and rely on the coexistence mechanisms to ensure the applied-but-not-yet-activated schema has no user-facing effect.

**Coexistence continuation is safer than rollback when:**

| Condition | Why coexistence continuation is preferred |
|---|---|
| Migration applied successfully, all postchecks pass | The migration is harmless; coexistence mechanisms protect the runtime; rollback is unnecessary risk |
| Migration created new tables/columns but caused no structural break | New nullable columns are inert; canonical isolation holds; no reason to undo correct work |
| Rollback would require §B7 restore but pg_dump backup is unavailable | Rollback is more dangerous than staying (data restoration is guesswork); stay in post-migration state; fix forward |
| The failure is in the governance process (ledger not updated) not the schema | Schema is correct; governance artifact update is a forward action, not a rollback trigger |
| The migration applied correctly but one postcheck query returned an unexpected non-critical result | Investigate the anomaly; if it does not affect user-facing behavior, document and continue |

**Coexistence continuation requires documenting why rollback was not pursued.** The decision to stay in the post-migration state must be recorded in the governance ledger with the specific conditions that made continuation safer than rollback.

---

### Decision Axis 5 — When Is Hotfix-Forward Safer Than Rollback?

**Hotfix-forward** means: author and immediately apply a corrective migration that repairs the specific failure without undoing the entire original migration.

**Hotfix-forward is safer than rollback when:**

| Condition | Why hotfix-forward is preferred |
|---|---|
| Migration partially succeeded (some objects created, others failed) | Rollback of partial success may undo correct work; targeted addition of missing objects is lower risk |
| Migration succeeded but §B7 data was corrupted (wrong rows in plant_care_profiles) | Rollback requires dropping canonical tables (potentially seeded); a `DELETE` + re-seed is less destructive |
| Migration succeeded but a RLS policy is missing | Add the missing policy via a targeted `CREATE POLICY`; no reason to roll back entire migration |
| Migration succeeded but wrong constraint name prevents rollback of §B7 | Fix the constraint name issue directly; do not attempt to run a broken rollback script |
| Non-rollbackable threshold has been crossed but a specific failure exists | Canonical associations must be preserved; forward-fix the specific failure without touching canonical data |
| The failure is a governance process gap, not a schema error | Governance artifacts need updating; this is a forward action, not a rollback trigger |

**Hotfix-forward requires:**
1. The hotfix SQL must be authored, governance-reviewed, and pre-checked before execution (abbreviated lifecycle is acceptable for urgent fixes, but the pre-check and post-check must still be run)
2. The hotfix must be additive (it cannot drop anything that the original migration correctly created)
3. The hotfix execution must be recorded in the governance ledger as a separate migration entry

---

### Rollback Decision Summary Matrix

| Situation | Recommended action | Rationale |
|---|---|---|
| User-data row count decreased | ROLLBACK (mandatory) | Data loss — no analysis required |
| Plant creation returns HTTP 400 (structural) | ROLLBACK | Structural break; schema is incompatible with app |
| Plant creation returns HTTP 400 (data: profiles empty) | HOTFIX-FORWARD | Restore data; don't undo schema |
| Phase 2.1 columns have non-null values on existing rows | ROLLBACK (if no activation yet) | Canonical isolation violation; shim will destroy values on next edit |
| canonical_species_id populated in plants (post Phase 2.2A) | HOTFIX-FORWARD | Non-rollbackable; canonical associations must be preserved |
| All postchecks pass; app works correctly | COEXISTENCE CONTINUATION | Migration is harmless; rollback is unnecessary risk |
| Partial execution (some objects missing) | HOTFIX-FORWARD | Add missing objects; don't undo correct work |
| pg_dump backup missing; §B7 needs rollback | HOTFIX-FORWARD | Rollback of §B7 is not possible without backup |
| Governance artifact not updated | COEXISTENCE CONTINUATION | No schema issue; update the artifact |
| RLS policy missing on new table | HOTFIX-FORWARD | Add the policy; don't roll back the table |
| New CASCADE FK on user-history table discovered | ROLLBACK if no activation yet; HOTFIX-FORWARD if activated | CASCADE FK is a data integrity risk; the correct fix depends on whether activation has occurred |
| Wrong index definition created | HOTFIX-FORWARD | Drop and recreate the specific index; no need to roll back the migration |

---

## RUNTIME PRESERVATION RULES

Every rollback — regardless of category, complexity, or urgency — must preserve the following five runtime properties for all existing users. These properties are non-negotiable. A rollback that violates any of them is categorically worse than the migration failure that triggered it.

---

### Preservation Rule 1 — Existing Plant Continuity

**Definition:** Every plant that existed before the migration and before the rollback must still exist after the rollback. No plant record may be deleted, corrupted, or made inaccessible as a result of rollback operations.

**How PLANTMON rollbacks preserve this property:**

Rollback of `supabase-migration-v2.sql` drops Phase 2.1 columns from `plants`. These columns are NULL for all rows (canonical isolation guarantee). `DROP COLUMN` on a NULL column leaves the row intact — the other columns are unaffected. The `plants` table row count before and after rollback must be identical.

**Verification after rollback:**
```sql
SELECT COUNT(*) FROM plants;
-- Must match the pre-migration baseline from PC-DAT-01.
SELECT id, display_name, species_name, frequency_days_of_first_task
-- (join with care_tasks to confirm each plant still has a valid care task)
```

**Violation scenario:** A rollback that includes `TRUNCATE plants` (prohibited by governance doctrine) or `DROP TABLE plants` (prohibited absolutely) would violate this property. No authorized rollback in the PLANTMON corpus includes either operation.

---

### Preservation Rule 2 — Care Task Continuity

**Definition:** Every active care task that existed before the migration must still be active after the rollback. `task_type`, `frequency_days`, `last_completed_at`, `next_due_at`, and `active_status` must be unchanged.

**How PLANTMON rollbacks preserve this property:**

Rollback of `supabase-migration-v2.sql` drops `care_tasks.canonical_species_id` — a column that is NULL for all rows. Dropping a NULL column leaves all other columns intact. `frequency_days`, `last_completed_at`, and `next_due_at` are not touched by any rollback operation in the current authorized corpus.

**Verification after rollback:**
```sql
SELECT
  COUNT(*) AS total_tasks,
  COUNT(frequency_days) AS tasks_with_frequency
FROM care_tasks
WHERE active_status = true;
-- task counts and frequency populations must match pre-migration baseline

SELECT last_completed_at, next_due_at, frequency_days
FROM care_tasks
WHERE task_type = 'watering' AND active_status = true
ORDER BY plant_id;
-- All values must match pre-migration state (no scheduling data altered)
```

**Violation scenario:** Any rollback that includes `UPDATE care_tasks SET frequency_days = ...` without explicit user-level authorization violates this property. The only authorized mechanism to change a care task's scheduling data is a user-initiated watering event or an explicit Phase B2.2 rebinding event.

---

### Preservation Rule 3 — Onboarding Continuity

**Definition:** After rollback, plant creation must succeed with the same behavior as the pre-migration state — ilike resolution, 7-day fallback, and the `plants` INSERT path all intact.

**How PLANTMON rollbacks preserve this property:**

The critical dependency is `plant_care_profiles`. Rollback of §B7 must restore `plant_care_profiles` to its pre-migration state via pg_dump backup. If the restore succeeds with a row count matching the pre-migration baseline, ilike resolution is fully restored. If the restore is incomplete, onboarding continuity is degraded (some species lose their profiles and receive 7-day fallback).

Rollback of Phase 2.1 columns from `plants` restores the schema to the Phase B1 state. The shim was already protecting against these columns. After rollback, the shim continues to strip them (they are absent again). Plant creation uses the same 5-field INSERT payload it has always used.

**Verification after rollback:**
```sql
SELECT COUNT(*) FROM plant_care_profiles;
-- Must match pre-migration baseline.

SELECT species_name, watering_frequency_days
FROM plant_care_profiles
WHERE species_name ILIKE '%monstera%';
-- Must return rows with correct watering_frequency_days.
```

**Violation scenario:** Rollback that leaves `plant_care_profiles` partially populated (§B7 DROP succeeded, restore failed or was incomplete) breaks onboarding continuity. Plants with species matching the missing profiles receive the 7-day fallback silently. This is a degradation, not a failure — plant creation still succeeds, but care quality is reduced.

---

### Preservation Rule 4 — Scheduler Continuity

**Definition:** After rollback, every plant's watering countdown must return to its pre-migration value (accounting for elapsed time). No plant's `frequency_days` or `next_due_at` may change as a result of the rollback.

**How PLANTMON rollbacks preserve this property:**

Current authorized rollbacks drop only NULL columns from scheduling tables. Since the dropped columns contain no scheduling data (canonical_species_id is NULL for all rows), the DROP operation has no effect on `frequency_days`, `last_completed_at`, or `next_due_at`. The `getDaysUntilWatering` computation — which reads from `last_completed_at` and `frequency_days` — is unaffected.

**Verification after rollback:**
```sql
SELECT
  p.display_name,
  ct.frequency_days,
  ct.last_completed_at,
  ct.next_due_at,
  CEIL(EXTRACT(EPOCH FROM (ct.next_due_at - NOW())) / 86400) AS days_remaining
FROM plants p
JOIN care_tasks ct ON ct.plant_id = p.id
  AND ct.task_type = 'watering'
  AND ct.active_status = true
ORDER BY p.display_name;
-- Compare days_remaining against pre-migration SCHED-02 baseline (adjusted for elapsed time).
-- No plant should show a countdown that is materially different from what it showed
-- before the migration (within ±1 day for time elapsed during execution).
```

**Violation scenario:** A rollback that uses `UPDATE care_tasks SET next_due_at = NOW() + frequency_days * INTERVAL '1 day'` to "fix" a perceived scheduling issue would reset all plants' countdowns to NOW() — a mass scheduling disruption. No authorized rollback in the current corpus includes any DML on `care_tasks`.

---

### Preservation Rule 5 — Care History Continuity

**Definition:** Every row in `care_logs`, `health_logs`, and `journal_entries` that existed before the migration must still exist after the rollback. The historical record of user care events must be inviolable through rollback operations.

**How PLANTMON rollbacks preserve this property:**

Rollback of `supabase-migration-v2.sql` drops `care_logs.canonical_species_id` — a column that is NULL for all rows. Dropping a NULL column leaves all care_logs rows intact. The `watered_at`, `plant_id`, `task_id`, and other fields are unaffected. The `care_logs` row count before and after rollback must be identical.

No authorized rollback in the current corpus includes any operation on `health_logs` or `journal_entries` — these tables are unaffected by any currently-authorized migration.

**Verification after rollback:**
```sql
SELECT
  (SELECT COUNT(*) FROM care_logs) AS care_logs_count,
  (SELECT COUNT(*) FROM health_logs) AS health_logs_count,
  (SELECT COUNT(*) FROM journal_entries) AS journal_entries_count;
-- All counts must match pre-migration baseline from PC-DAT-01.
-- Any decrease is a CRITICAL violation requiring immediate escalation.
```

**The inviolability principle:** Care history rows represent things that actually happened — a user watered their plant on a specific date. No rollback, migration, or schema operation may erase that fact. The care_logs rows are permanent record of the user's relationship with their plant. Any rollback that reduces `care_logs` row count below the pre-migration baseline is a violation of user trust, not merely a governance violation.

---

## ROLLBACK GOVERNANCE SUMMARY

### The Rollback Decision Checklist

Before executing any rollback, confirm each of the following in order:

```
□ R-GATE-01: User-data row counts confirmed unchanged (if decreased → ROLLBACK MANDATORY)
□ R-GATE-02: Canonical propagation status confirmed
              (non-null canonical_species_id in plants → non-rollbackable; hotfix-forward)
□ R-GATE-03: Care history row counts confirmed unchanged
              (care_logs, health_logs, journal_entries not reduced)
□ R-GATE-04: pg_dump backup verified accessible (required for §B7 rollback)
□ R-GATE-05: Rollback SQL sequencing reviewed (last-forward-first-back)
□ R-GATE-06: Decision axis analysis complete (rollback vs. coexistence continuation vs. hotfix-forward)
□ R-GATE-07: Post-rollback runtime preservation checks identified and ready to execute
□ R-GATE-08: Governance ledger entry drafted (to be completed immediately after rollback)
```

### Rollback Irreversibility Horizon

| Phase | Rollback window status | Non-rollbackable threshold |
|---|---|---|
| B2.0 (current) | OPEN — all migrations reversible with pg_dump backup | `supabase-migration-v2.sql` not yet applied |
| Post-migration-v2, pre-B2.2A | OPEN — canonical infrastructure present but inert | Phase 2.1 shim still active; canonical columns all NULL |
| B2.2A activation | CLOSING — first new plants receive canonical IDs | `canonical_species_id` non-null on any plant row |
| Post-B2.2A, pre-backfill | PARTIALLY CLOSED — new plants non-rollbackable; legacy plants still NULL | Decision per-plant; mass rollback not safe |
| Post-backfill | CLOSED — canonical propagation complete | All plants have canonical IDs; rollback destroys all |

**The rollback window closes at the moment the first non-null `canonical_species_id` is written to any `plants` row.** That moment is the Phase 2.2A runtime activation event — the atomic deployment that removes the shim, uncomments canonical routing, and wires canonical ID propagation. Before that moment, `supabase-migration-v2.sql` can be safely rolled back. After that moment, rollback requires hotfix-forward.

---

*This document is a read-only migration rollback strategy. No application files, SQL files, migration files, or schema state were modified in its generation. The rollback SQL scripts referenced in this document are authored during Step 1 of the Migration Execution Protocol (before migration execution begins). This document governs when and how those scripts are used — it does not contain or generate SQL.*
