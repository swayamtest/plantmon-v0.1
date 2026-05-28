# PLANTMON — Stale Assumption Registry

**Classification:** Governance Reconciliation Audit  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + full governance baseline corpus + `SUPABASE_REPLIT_ALIGNMENT_MATRIX.md`  

This document is an exhaustive registry of assumptions embedded in Replit source files, governance documents, and runtime logic that are either already stale, conditionally stale (become stale at a specific future event), or structurally stale (were always incorrect regardless of phase). It does not fix any assumption. It records each with precision, assigns a staleness classification, and defines the condition under which it becomes harmful.

**Staleness classifications used in this document:**

| Classification | Meaning |
|---|---|
| **HARMLESS** | The assumption is technically incorrect but is mechanically compensated by a coexistence mechanism; no current or future runtime risk |
| **GOVERNANCE DEBT** | The assumption creates documentation ambiguity, misleads future developers, or requires manual reconciliation at activation time; no current runtime risk |
| **ACTIVATION RISK** | The assumption will produce incorrect behavior if an activation event proceeds without correcting it first |
| **MIGRATION RISK** | The assumption will produce a data corruption, schema conflict, or deployment failure if a migration executes without correcting it first |

---

## REPLIT ASSUMPTIONS

Assumptions embedded in TypeScript source files, configuration, and application logic that imply a schema, data, or runtime state that differs from the actual live Supabase topology.

---

### RA-001 — `Plant.canonical_species_id` typed as if column may exist

**File:** `artifacts/mobile/types/plant.ts`  
**Assumption:** `canonical_species_id?: string | null | undefined` on the `Plant` type implies the column either already exists or may be present in a PostgREST response  
**Actual state:** Column is absent from `plants` in the live DB; the key is never present in any PostgREST response  
**Why it exists:** Forward-declaration for Phase 2.1 — typed ahead of the migration to enable TypeScript compilation without errors when Phase 2.1 code is written  
**Staleness type:** HARMLESS  
**Becomes harmful when:** Never — the optional type (`?`) correctly handles both absent (pre-migration, key undefined) and null (post-migration, unset) states  
**Compensating mechanism:** Phase 2.1 shim strips this field on all writes; TypeScript optional chaining prevents any read-side crash

---

### RA-002 — `Plant.user_entered_name` typed as if column may exist

**File:** `artifacts/mobile/types/plant.ts`  
**Assumption:** `user_entered_name?: string | null | undefined` on the `Plant` type  
**Actual state:** Column absent from live DB  
**Why it exists:** Forward-declaration for Phase 2.1  
**Staleness type:** HARMLESS  
**Becomes harmful when:** Never at read time. Becomes GOVERNANCE DEBT at edit-form time post-Phase-2.2 — the edit form reads `species_name` not `user_entered_name` to pre-populate the SPECIES field; this overwrites the raw input on edit  
**Compensating mechanism:** Shim strips on write; optional typing on read

---

### RA-003 — `Plant.canonical_species_name` typed as if column may exist

**File:** `artifacts/mobile/types/plant.ts`  
**Assumption:** `canonical_species_name?: string | null | undefined`  
**Actual state:** Column absent from live DB  
**Why it exists:** Forward-declaration for Phase 2.1  
**Staleness type:** HARMLESS  
**Compensating mechanism:** Shim strips on write; optional typing on read

---

### RA-004 — `Plant.species_resolution_method` typed with all four enum values

**File:** `artifacts/mobile/types/plant.ts` and `types/canonical.ts`  
**Assumption:** `species_resolution_method?: SpeciesResolutionMethod | null | undefined` where `SpeciesResolutionMethod = "ilike_species_name" | "alias_lookup" | "canonical_id_lookup" | "default_fallback"`  
**Actual state:** Column absent from live DB. `"alias_lookup"` and `"canonical_id_lookup"` are unreachable values — the routing functions that would produce them are comment-gated and their schema prerequisites are unmet  
**Why it exists:** Forward-declaration for Phase 2.2 — all four resolution methods typed ahead of their respective activation phases  
**Staleness type:** GOVERNANCE DEBT  
**Becomes harmful when:** If a developer reads the type and assumes `"alias_lookup"` or `"canonical_id_lookup"` can be produced by the current runtime — they cannot. The type implies broader capability than the runtime delivers  
**Compensating mechanism:** Shim strips on write; context discarded before the value would be assigned anyway

---

### RA-005 — `PlantCareProfile.canonical_species_id` typed as if column may exist

**File:** `artifacts/mobile/types/plant.ts`  
**Assumption:** `canonical_species_id?: string | null | undefined` on `PlantCareProfile`  
**Actual state:** Column absent from `plant_care_profiles` in live DB; `lookupByCanonicalId` which would use it is comment-gated  
**Staleness type:** HARMLESS  
**Compensating mechanism:** Comment-gated routing slot; optional typing

---

### RA-006 — `PlantCareProfile.seasonal_watering_adjustment` typed with no SQL home

**File:** `artifacts/mobile/types/plant.ts`  
**Assumption:** `seasonal_watering_adjustment?: number | null` on `PlantCareProfile` implies a future DB column  
**Actual state:** No CREATE TABLE or ALTER TABLE statement for this column exists in `supabase-setup.sql`, `supabase-migration-v2.sql`, or `PRE_DATASET_HARDENING_MIGRATION_v1.sql` — it is a TypeScript-only forward-declaration with no corresponding SQL  
**Staleness type:** ACTIVATION RISK  
**Becomes harmful when:** Phase B2.3 (seasonal scheduling) is activated. If `getDaysUntilWatering` or any scheduler function attempts to read this field from a PostgREST response, it will always be `undefined` (key absent) regardless of whether data exists in `plant_care_profiles`, because the column does not exist and no migration adds it  
**Required action before B2.3:** Author an ALTER TABLE or migration SQL that adds `seasonal_watering_adjustment` to `plant_care_profiles`

---

### RA-007 — `CollapseMapping` interface has no SQL definition anywhere

**File:** `artifacts/mobile/types/canonical.ts`  
**Assumption:** `CollapseMapping { id, variant_name, canonical_name, collapse_confidence, operational_similarity, consumer_recognition_overlap, ... }` implies a future `collapse_mappings` table  
**Actual state:** No CREATE TABLE for `collapse_mappings` in any SQL file. The table is absent from the live DB, absent from `supabase-migration-v2.sql`, and absent from `PRE_DATASET_HARDENING_MIGRATION_v1.sql`  
**Staleness type:** GOVERNANCE DEBT → MIGRATION RISK at Phase B2.3B  
**Becomes harmful when:** Phase B2.3B begins. Any developer tasked with implementing collapse routing would need to author the migration SQL from scratch — the TypeScript interface is a schema design artifact without a migration path  
**Required action before B2.3B:** Author a CREATE TABLE for `collapse_mappings` in a new migration file

---

### RA-008 — `CanonicalSpecies` and `PlantAlias` interfaces declared but tables absent

**File:** `artifacts/mobile/types/canonical.ts`  
**Assumption:** Interfaces imply tables will be created by applying the pending migration  
**Actual state:** Both tables are in `supabase-migration-v2.sql` (unapplied). The assumption is correct but conditionally — it depends on the migration being applied  
**Staleness type:** HARMLESS (currently); GOVERNANCE DEBT if migration application is delayed beyond Phase 2.2 activation  
**Compensating mechanism:** All routing to these tables is comment-gated

---

### RA-009 — `user_entered_name` value at form time is identical to `species_name`

**File:** `artifacts/mobile/components/PlantForm.tsx`  
**Assumption:** `user_entered_name: speciesName.trim() || undefined` — the field is intended to preserve the user's raw input separate from the normalized canonical species name  
**Actual state:** Both `species_name` and `user_entered_name` read from the same `speciesName` state variable with the same expression. They are byte-for-byte identical at form submission time. The distinction is meaningless in Phase B2.0  
**Staleness type:** GOVERNANCE DEBT  
**Becomes harmful when:** Phase 2.2 activates and `species_name` is normalized to a canonical species name. At that point, `user_entered_name` should diverge from `species_name` — but the form currently makes them identical. The distinctness must be implemented in the form before Phase 2.2 activates

---

### RA-010 — `generateDefaultCareTasks` accepts `_canonicalSpeciesId` but never uses it

**File:** `artifacts/mobile/lib/careProfiles.ts`  
**Assumption:** The underscore-prefixed parameter signature `generateDefaultCareTasks(plantId, speciesName, _canonicalSpeciesId?)` implies the function will use this parameter when provided  
**Actual state:** Parameter is accepted and prefixed with `_` (TypeScript convention for intentionally unused). It is never forwarded to any routing slot, never included in any INSERT, never used in any conditional. Any caller that passes a canonical ID receives identical output to a caller that passes nothing  
**Staleness type:** GOVERNANCE DEBT  
**Becomes harmful when:** Phase 2.2 activation — if a developer activates canonical routing without connecting the `_canonicalSpeciesId` parameter through to the routing slot, canonical resolution is silently bypassed at task generation time even though the routing slot is uncommented

---

### RA-011 — `resolveSpeciesProfile` returns `SpeciesResolutionContext` that is always discarded

**File:** `artifacts/mobile/lib/careProfiles.ts`  
**Assumption:** The return type `{ profile, context: { method, resolved } }` implies the context is consumed by callers  
**Actual state:** Every caller destructures only `profile` and discards `context`. No call site in the codebase consumes `context.method` or `context.resolved`  
**Staleness type:** GOVERNANCE DEBT  
**Becomes harmful when:** Phase 2.2 shim removal — at that point, `context.method` needs to be wired through to `PlantInput.species_resolution_method` to persist the resolution audit trail. If a developer removes the shim without also wiring the context, resolution method is silently lost despite the column now existing in the DB

---

### RA-012 — All 10 `runtimeValidation.ts` functions have zero call sites

**File:** `artifacts/mobile/lib/runtimeValidation.ts`  
**Assumption:** Function names like `getSchemaMigrationStatus`, `getPlantIdentityStatus`, `summarizeIdentityStatus` imply these functions are called somewhere and their outputs are consumed  
**Actual state:** Zero call sites anywhere in the application. All 10 functions are compiled, type-checked, and correct — but inert  
**Staleness type:** GOVERNANCE DEBT  
**Becomes harmful when:** The scheduler or onboarding activation depends on `getSchemaMigrationStatus()` as a gate. If the function is never wired to a call site, the migration status gate never fires — activation could proceed without schema validation. Additionally, `getPlantIdentityStatus()` is a prerequisite for archetype-aware onboarding (Phase B2.3+), and `summarizeIdentityStatus()` is a prerequisite for any diagnostic surface

---

### RA-013 — `lookupCareProfile(speciesName)` wrapper implies archetype routing is active

**File:** `artifacts/mobile/lib/careProfiles.ts`  
**Assumption:** A public function called `lookupCareProfile` with a generalized name implies it routes to the best available care profile by whatever mechanism is active  
**Actual state:** The function is a legacy wrapper over `resolveSpeciesProfile` that accepts only `speciesName` and discards the `canonical_species_id` routing path — it will never route to alias or canonical paths regardless of what the caller passes  
**Staleness type:** GOVERNANCE DEBT  
**Becomes harmful when:** A developer outside the governance context uses `lookupCareProfile` after Phase 2.2 activates, expecting it to use the canonical routing chain. The function name suggests general-purpose resolution; the implementation is permanently species-name-only. Post-Phase-2.2, this wrapper should either be updated to accept `canonical_species_id` or deprecated in favor of direct `resolveSpeciesProfile` calls

---

### RA-014 — `PLANT_SELECT` comment implies join is always safe

**File:** `artifacts/mobile/hooks/usePlants.ts`  
**Assumption:** `const PLANT_SELECT = "*, care_tasks(*)"` — the wildcard select implies all columns will be returned and their types will match the TypeScript `Plant` interface  
**Actual state:** Pre-migration, Phase 2.1 columns are absent — PostgREST omits keys for absent columns, so the TypeScript interface has `undefined` where `null` would appear post-migration. The `*` selector is forward-safe but creates a subtle type behavior difference: pre-migration `plant.canonical_species_id === undefined`; post-migration `plant.canonical_species_id === null`  
**Staleness type:** HARMLESS  
**Becomes harmful when:** Never — TypeScript's `?: string | null | undefined` correctly models both states. But any code that uses `=== null` to check for unset (instead of `== null` or nullish coalescing) will behave differently pre- vs. post-migration

---

## GOVERNANCE ARTIFACT DRIFT

Governance documents that contain statements that are accurate at freeze time but will become stale at specific future events, or that were written with assumptions that do not precisely match the live Supabase topology.

---

### GAD-001 — `OPERATIONAL_BASELINE_MANIFEST.md` — "unapplied" migration status becomes stale on first execution

**Document:** `governance-baseline/OPERATIONAL_BASELINE_MANIFEST.md`  
**Drifting statement:** All sections documenting `supabase-migration-v2.sql` and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` as PENDING/UNAPPLIED  
**Drift trigger:** Either migration applied to the live DB  
**Staleness type:** GOVERNANCE DEBT  
**Risk:** The manifest becomes a false historical record if not updated after migration application — a developer consulting it post-migration would see "UNAPPLIED" and incorrectly believe the migration is still pending  
**Required action:** Update the manifest immediately after any migration is applied, marking the applied migration with its execution timestamp

---

### GAD-002 — `MIGRATION_EXECUTION_LEDGER.md` — execution state section becomes stale on application

**Document:** `governance-baseline/MIGRATION_EXECUTION_LEDGER.md`  
**Drifting statement:** §Migration Authority State table showing both migrations as PENDING  
**Drift trigger:** Either migration applied  
**Staleness type:** GOVERNANCE DEBT  
**Risk:** Same as GAD-001 — ledger loses accuracy as a tracking document  
**Required action:** The ledger is the primary migration tracking document; it must be updated with execution timestamp, applied-by, and pre-application verification results after each migration event

---

### GAD-003 — `COEXISTENCE_STATE_FREEZE.md` — Phase 2.1 shim described as active after shim removal

**Document:** `governance-baseline/COEXISTENCE_STATE_FREEZE.md`  
**Drifting statement:** §Coexistence Mechanisms — Phase 2.1 shim listed as Mechanism 1 with full active description  
**Drift trigger:** Shim removed from `useCreatePlant` and `useUpdatePlant`  
**Staleness type:** ACTIVATION RISK  
**Risk:** After shim removal, any developer consulting this document would see the shim listed as an active protection and might incorrectly believe writes are still stripped — leading to false confidence that Phase 2.1 columns are safe to send without schema verification  
**Required action:** Supersede the coexistence state freeze document after shim removal; do not edit in place — create a new dated freeze for Phase B2.2

---

### GAD-004 — `SCHEDULER_BASELINE_SNAPSHOT.md` — computation model becomes stale after `getDaysUntilWatering` fix

**Document:** `governance-baseline/SCHEDULER_BASELINE_SNAPSHOT.md`  
**Drifting statement:** §Watering Computation Model — documents `getDaysUntilWatering` as reading `last_completed_at + frequency_days`  
**Drift trigger:** The `getDaysUntilWatering` fix (reads `next_due_at` directly)  
**Staleness type:** GOVERNANCE DEBT  
**Risk:** Post-fix, the document incorrectly describes the active scheduler computation. A developer optimizing or debugging the scheduler would follow the documented (wrong) computation path  
**Required action:** Update the computation model section after the fix is deployed; this is the highest-frequency expected update in the scheduler baseline

---

### GAD-005 — `ONBOARDING_BASELINE_SNAPSHOT.md` — inactive routing descriptions become stale after uncomment

**Document:** `governance-baseline/ONBOARDING_BASELINE_SNAPSHOT.md`  
**Drifting statements:** §Inactive Runtime Resolution Layers — alias lookup, canonical routing described as double-commented and inactive  
**Drift trigger:** Either routing slot uncommented  
**Staleness type:** GOVERNANCE DEBT  
**Risk:** After activation, the document still describes the routing as "double-commented" — a new developer would look for comment barriers that no longer exist  
**Required action:** Supersede or update after any routing layer activation; the activation event is also the document update trigger

---

### GAD-006 — `RUNTIME_AUTHORITY_DECLARATION.md` — Tier 2/3 alignment statement becomes stale after any activation

**Document:** `governance-baseline/RUNTIME_AUTHORITY_DECLARATION.md`  
**Drifting statement:** §Authority Summary — "The governance hierarchy is self-consistent at Phase B2.0"  
**Drift trigger:** Any migration application (changes Tier 2), any shim removal (changes Tier 3), any routing activation (changes Tier 4)  
**Staleness type:** GOVERNANCE DEBT  
**Risk:** The authority summary is a snapshot — it describes B2.0 alignment. After any activation event, the document's authority claims may not reflect the new tier state  
**Required action:** Issue a new dated `RUNTIME_AUTHORITY_DECLARATION.md` after each phase transition; the old document should be archived, not edited

---

### GAD-007 — `SUPABASE_REPLIT_ALIGNMENT_MATRIX.md` — all matrices become stale on migration application

**Document:** `governance-reconciliation/SUPABASE_REPLIT_ALIGNMENT_MATRIX.md`  
**Drifting statements:** All five-way alignment matrices, all 🟡 and ⬜ cells for Phase 2.1 columns  
**Drift trigger:** `supabase-migration-v2.sql` applied  
**Staleness type:** GOVERNANCE DEBT  
**Risk:** Post-migration, the alignment matrix shows columns as absent from the live schema when they now exist — inverting the safety story and creating false urgency to apply already-applied migrations  
**Required action:** Regenerate the alignment matrix after each migration application

---

### GAD-008 — Comments in `careProfiles.ts` describe Phase 2.2 activation as future-only

**File:** `artifacts/mobile/lib/careProfiles.ts`  
**Drifting statements:** Inline comments on commented-out routing slots (e.g., `// Phase 2.2 — uncomment when alias table seeded`) describe conditions that must be met before uncommenting  
**Drift trigger:** Conditions met but comments not removed  
**Staleness type:** ACTIVATION RISK  
**Risk:** If a developer uncomments the routing slots but leaves the "Phase 2.2 — uncomment when..." comment in place, the comment becomes permanently misleading — future developers see a "future" label on active code and may re-comment it thinking it was accidentally enabled  
**Required action:** Remove activation condition comments simultaneously with the code uncomment; the comment serves as a gate, not a historical note

---

### GAD-009 — Phase 2.1 shim comments describe stripped fields as "absent from schema"

**File:** `artifacts/mobile/hooks/usePlants.ts`  
**Drifting statement:** Inline comment near the shim describing stripped fields as absent from the live DB schema  
**Drift trigger:** `supabase-migration-v2.sql` applied — columns are then present in the schema, but shim continues stripping them (shim removal is a separate activation event)  
**Staleness type:** ACTIVATION RISK  
**Risk:** After migration but before shim removal, the comment says "column absent" when the column now exists. A developer who reads the comment to understand why the shim is needed would receive the wrong explanation — they might incorrectly conclude the shim is no longer needed and remove it prematurely  
**Required action:** Update shim comments after migration application to reflect: "column exists post-migration; shim maintained until canonical routing is fully activated and validated"

---

## RUNTIME ASSUMPTION DRIFT

Assumptions embedded in runtime logic about how the system behaves that are conditionally correct today but will become incorrect when specific activation events occur.

---

### RAD-001 — Scheduler assumes `next_due_at` is always derivable from `last_completed_at + frequency_days`

**Location:** `getDaysUntilWatering` — `artifacts/mobile/types/plant.ts:238–249`  
**Current assumption:** `next_due_at` in the DB will always equal `last_completed_at + frequency_days * ms` — so computing from `last_completed_at` and the static interval is equivalent to reading `next_due_at`  
**Condition that makes it true:** Only while the seasonal scheduler is inactive and no external system writes a different `next_due_at`  
**When it becomes false:** The moment any system writes a season-adjusted or manually-overridden `next_due_at` — the two computations produce different values, and the UI shows the wrong countdown  
**Staleness type:** ACTIVATION RISK  
**Severity:** HIGH — triggers silent data divergence; no runtime error, no user notification  
**Fix availability:** Independent of schema migration; can be deployed at any time

---

### RAD-002 — Scheduler assumes `frequency_days` is immutable after task creation

**Location:** `getDaysUntilWatering`, `useWaterPlant`, all countdown displays  
**Current assumption:** Once set at plant creation, `frequency_days` never changes; there is no UI to edit it and no system that updates it  
**When it becomes false:** Canonical rebinding (Phase B2.2) — when a plant's `canonical_species_id` is resolved, its `care_tasks.frequency_days` should be updated to match the canonical profile  
**Staleness type:** ACTIVATION RISK  
**Severity:** MEDIUM — if rebinding writes a new `frequency_days` but `getDaysUntilWatering` still uses the old `last_completed_at + old_frequency` computation, the countdown is wrong for the transition period  
**Fix dependency:** Requires RAD-001 fix first — once `getDaysUntilWatering` reads `next_due_at`, rebinding becomes safe because the scheduler reads the DB-authoritative value

---

### RAD-003 — Scheduler assumes device clock is the authoritative time source

**Location:** All `Date.now()` calls across `careProfiles.ts`, `usePlants.ts`, `types/plant.ts`  
**Current assumption:** `Date.now()` on the user's device produces a reliable, consistent timestamp that matches the DB's `now()` function  
**Condition that makes it approximately true:** Most mobile devices have NTP-synchronized clocks within a few seconds  
**When it becomes false:** Device clock drift, manual time change, or DST transition — all produce countdown values that diverge from the DB-authoritative timestamps  
**Staleness type:** GOVERNANCE DEBT  
**Severity:** LOW (currently); would become MEDIUM if notifications or server-side scheduling are introduced (clock disagreement between device and server)

---

### RAD-004 — Onboarding routing assumes `plant_care_profiles` is the only resolution table

**Location:** `resolveSpeciesProfile` in `careProfiles.ts`  
**Current assumption:** The resolution pipeline terminates at `lookupBySpeciesNameIlike` or falls to default — there is no other table to consult  
**When it becomes false:** When `plant_aliases` is seeded and alias routing is activated — a third resolution path (alias → canonical ID → care profile) becomes available  
**Staleness type:** GOVERNANCE DEBT (currently — routing is comment-gated)  
**Severity:** LOW — the comment gate prevents any premature activation; the assumption becomes relevant only at Phase B2.2B activation time

---

### RAD-005 — Onboarding assumes all plants will have `canonical_species_id = NULL` until Phase 2.2

**Location:** Phase 2.1 shim logic; `getPlantIdentityStatus` in `runtimeValidation.ts`  
**Current assumption:** No plant will ever have a non-null `canonical_species_id` in the current runtime  
**When it becomes false:** If a direct DB edit or a backfill script assigns canonical IDs to existing plants before Phase 2.2 activates — the shim would strip any canonical ID passed through the onboarding form, but the plant's existing DB row would have a value that the form would then overwrite with NULL on the next edit (since the edit form reads `species_name` not `canonical_species_id`)  
**Staleness type:** ACTIVATION RISK  
**Severity:** MEDIUM — a premature canonical ID assignment via direct DB write could be silently overwritten by the next in-app plant edit

---

### RAD-006 — Onboarding assumes `care_logs.canonical_species_id` is not writable at runtime

**Location:** `useWaterPlant` INSERT in `artifacts/mobile/hooks/usePlants.ts`  
**Current assumption:** `care_logs` receives `{ plant_id, care_task_id, completed_at }` — no canonical field expected  
**When it becomes false:** `supabase-migration-v2.sql` applied — the column exists in the live schema but the INSERT still omits it, writing NULL permanently for every watering event  
**Staleness type:** ACTIVATION RISK  
**Severity:** HIGH — every watering between migration application and the one-line fix creates a permanent canonical history orphan; the damage compounds with each watering event  
**Fix availability:** One-line code change; no schema dependency; can be deployed before or concurrent with migration application

---

### RAD-007 — Canonical propagation assumes it is impossible without code + schema change

**Location:** All Phase 2.1 shim code; architecture comments in governance docs  
**Current assumption:** Canonical IDs cannot appear anywhere in the runtime without both a schema migration and code activation  
**When it becomes partially false:** A direct Supabase Dashboard SQL UPDATE on any `plants` row could set `canonical_species_id` to a non-null value before Phase 2.2 activates — but the shim would strip it on the next in-app edit, and no in-app code would route differently based on the DB value  
**Staleness type:** GOVERNANCE DEBT  
**Severity:** LOW — only relevant to admins with direct DB access; the coexistence mechanisms handle it correctly (the value is present in the DB but ignored by all code paths)

---

### RAD-008 — `care_logs` notes field is assumed to be intentionally unwritten

**Location:** `useWaterPlant` INSERT — no `notes` field in payload  
**Current assumption:** User cannot annotate a watering event with notes; the `notes` column on `care_logs` is a schema placeholder  
**When it becomes false:** If a "watering notes" UI field is added without also updating the `useWaterPlant` INSERT, the UI field would accept input that is never persisted  
**Staleness type:** GOVERNANCE DEBT  
**Severity:** LOW — the column exists; no feature depends on it; the gap is additive not destructive

---

## MIGRATION ASSUMPTION DRIFT

Assumptions embedded in the pending SQL files and governance documents about what the schema state will be at the time of migration execution.

---

### MAD-001 — `supabase-migration-v2.sql` assumes `plant_care_profiles` has a specific CHECK constraint name

**File:** `supabase-migration-v2.sql §B7`  
**Assumption:** The migration DROP-and-recreates `plant_care_profiles`, including the `light_requirement` CHECK constraint. It assumes either that the original constraint name is known, or that PostgreSQL will handle the constraint name automatically  
**Actual risk:** PostgreSQL auto-generates CHECK constraint names like `plant_care_profiles_light_requirement_check` when no explicit name is given in the original `CREATE TABLE`. If the live DB has this auto-generated name and the migration recreates the constraint under a different name (or vice versa), the result is a duplicate constraint — the old constraint name remains, the new constraint is added, and the column now has two overlapping CHECK constraints  
**Staleness type:** MIGRATION RISK  
**Severity:** HIGH — duplicate CHECK constraints do not cause immediate errors but can cause inconsistent validation behavior and are difficult to detect without inspecting `pg_constraint` directly  
**Pre-migration required action:** Run `SELECT conname FROM pg_constraint WHERE conrelid = 'plant_care_profiles'::regclass AND contype = 'c'` before executing the migration; verify constraint names; resolve any mismatch before proceeding

---

### MAD-002 — `supabase-migration-v2.sql` assumes no existing RLS policies conflict with new ones

**File:** `supabase-migration-v2.sql` — all `CREATE POLICY` statements  
**Assumption:** The new tables (`canonical_species`, `plant_aliases`, `collapse_mappings`) will have no pre-existing RLS policies when the migration runs  
**Actual risk:** If any of these tables were manually created in the live DB (e.g., during development testing) and policies were applied, the migration's `CREATE POLICY` statements would fail with "policy already exists"  
**Staleness type:** MIGRATION RISK  
**Severity:** MEDIUM — if this occurs, the migration fails mid-execution, leaving the schema in a partially-applied state  
**Pre-migration required action:** Verify these tables do not exist in the live DB before running the migration: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('canonical_species', 'plant_aliases', 'collapse_mappings')`

---

### MAD-003 — `PRE_DATASET_HARDENING_MIGRATION_v1.sql` assumes `supabase-migration-v2.sql` is applied first

**File:** `PRE_DATASET_HARDENING_MIGRATION_v1.sql`  
**Assumption:** The UNIQUE partial index on `plant_aliases` and the GIN index on `canonical_species_id` assume the tables and columns they reference already exist  
**Actual risk:** If `PRE_DATASET_HARDENING_MIGRATION_v1.sql` is applied before `supabase-migration-v2.sql`, every statement that references `plant_aliases`, `canonical_species`, or `canonical_species_id` will fail with "relation does not exist" or "column does not exist"  
**Staleness type:** MIGRATION RISK  
**Severity:** HIGH — applying in wrong order causes complete migration failure; no partial recovery without manual cleanup  
**Required ordering:** `supabase-migration-v2.sql` must be applied and verified before `PRE_DATASET_HARDENING_MIGRATION_v1.sql`

---

### MAD-004 — `supabase-migration-v2.sql` assumes `collapse_mappings` table creation satisfies all collapse routing prerequisites

**File:** `supabase-migration-v2.sql` — if `collapse_mappings` were to be added here  
**Actual state:** `collapse_mappings` is NOT in `supabase-migration-v2.sql` — the table has no SQL definition anywhere. The assumption embedded in the TypeScript type system is that applying the migration will bring the schema into alignment with the TypeScript model. This is incorrect for `collapse_mappings`  
**Staleness type:** GOVERNANCE DEBT → MIGRATION RISK at Phase B2.3B  
**Severity:** MEDIUM — a developer applying `supabase-migration-v2.sql` expecting it to be the complete Phase 2.1 migration will find that `collapse_mappings` still does not exist post-migration; TypeScript types reference a table that no migration creates  
**Required action before B2.3B:** Author a separate migration or amend `supabase-migration-v2.sql` to include `CREATE TABLE collapse_mappings`

---

### MAD-005 — Governance documents assume migrations are applied manually with full attention

**Documents:** `MIGRATION_EXECUTION_LEDGER.md`, `RUNTIME_AUTHORITY_DECLARATION.md §Migration Safety`  
**Assumption:** Every migration is applied via the Supabase Dashboard SQL Editor with human review of the pre-application verification queries  
**Actual risk:** No technical enforcement prevents running the SQL in an automated script, a Supabase Edge Function, or a `pnpm` script without the pre-application checks. If automation is introduced without governance awareness, the CHECK constraint name risk (MAD-001) and the ordering dependency (MAD-003) could be triggered accidentally  
**Staleness type:** GOVERNANCE DEBT  
**Severity:** MEDIUM — automation is not currently present; risk is of future deviation from documented protocol  
**Compensating mechanism:** `RUNTIME_AUTHORITY_DECLARATION.md §Migration Safety` documents the protected property; `MIGRATION_EXECUTION_LEDGER.md` documents the verification protocol. Neither has enforcement authority.

---

### MAD-006 — `plant_care_profiles` seed data assumed to be authored before canonical backfill

**Documents:** `COEXISTENCE_STATE_FREEZE.md §Future Activation Dependencies`, `ONBOARDING_BASELINE_SNAPSHOT.md §Future Activation Dependencies`  
**Assumption:** `plant_care_profiles` will be seeded with species data before `canonical_species_id` is backfilled into `plant_care_profiles` rows  
**Actual risk:** If `canonical_species_id` values are assigned to `canonical_species` rows and then backfilled into `plant_care_profiles` before the profile rows exist, the FK relationship is violated — or more precisely, `plant_care_profiles` rows must exist before their `canonical_species_id` can be set  
**Staleness type:** ACTIVATION RISK  
**Severity:** MEDIUM — the ordering is correct in all governance documents, but no technical enforcement ensures seeding precedes backfill  
**Required ordering:** Seed `plant_care_profiles` with species + care data → seed `canonical_species` with IDs → backfill `plant_care_profiles.canonical_species_id` → seed `plant_aliases`

---

### MAD-007 — Migration ledger has no tracking table in the live DB

**Document:** `governance-baseline/MIGRATION_EXECUTION_LEDGER.md`  
**Assumption:** The ledger documents migration state in a Replit governance file — but there is no corresponding `schema_migrations` table in the live Supabase DB  
**Actual risk:** The only source of truth for "has this migration been applied?" is either the governance document (which may be stale) or direct schema inspection (which requires knowing which objects to check for). If the ledger falls out of sync with the live DB, there is no automated way to detect the discrepancy  
**Staleness type:** GOVERNANCE DEBT  
**Severity:** MEDIUM — recoverable via schema inspection, but the absence of a migration tracking table means there is no DB-native audit trail  
**Required action:** Create a `schema_migrations` table as part of the governance hardening plan documented in `RUNTIME_AUTHORITY_DECLARATION.md §Migration Hardening`

---

## GOVERNANCE RISK ASSESSMENT

### Complete Risk Register

| ID | Assumption | Classification | Severity | Trigger | Action required |
|---|---|---|---|---|---|
| RA-001 | `Plant.canonical_species_id` typed | HARMLESS | LOW | Never | None |
| RA-002 | `Plant.user_entered_name` typed; edit form reads `species_name` | HARMLESS → GOVERNANCE DEBT | LOW | Phase 2.2 activation | Fix edit form pre-population before Phase 2.2 |
| RA-003 | `Plant.canonical_species_name` typed | HARMLESS | LOW | Never | None |
| RA-004 | `SpeciesResolutionMethod` includes unreachable values | GOVERNANCE DEBT | LOW | Developer misreads type | Comment or document unreachable values |
| RA-005 | `PlantCareProfile.canonical_species_id` typed | HARMLESS | LOW | Never | None |
| RA-006 | `PlantCareProfile.seasonal_watering_adjustment` typed with no SQL | ACTIVATION RISK | HIGH | Phase B2.3 activation | Author ALTER TABLE before B2.3 |
| RA-007 | `CollapseMapping` has no SQL definition anywhere | GOVERNANCE DEBT → MIGRATION RISK | MEDIUM | Phase B2.3B | Author CREATE TABLE before B2.3B |
| RA-008 | `CanonicalSpecies` / `PlantAlias` typed; tables absent | HARMLESS | LOW | Never (migration covers it) | None |
| RA-009 | `user_entered_name === species_name` at form time | GOVERNANCE DEBT | LOW | Phase 2.2 | Diverge form values before Phase 2.2 |
| RA-010 | `_canonicalSpeciesId` param accepted but never used | GOVERNANCE DEBT | MEDIUM | Phase 2.2 activation | Wire param through to routing slot at activation |
| RA-011 | `SpeciesResolutionContext` returned but always discarded | GOVERNANCE DEBT | MEDIUM | Phase 2.2 shim removal | Wire context through to DB write at shim removal |
| RA-012 | All `runtimeValidation.ts` functions have zero call sites | GOVERNANCE DEBT | MEDIUM | Phase 2.2 / B2.3 | Add call sites before using as activation gates |
| RA-013 | `lookupCareProfile` name implies general archetype routing | GOVERNANCE DEBT | LOW | Post-Phase-2.2 developer confusion | Deprecate or rename after Phase 2.2 |
| RA-014 | `PLANT_SELECT = "*"` implies type-safe responses always | HARMLESS | LOW | Never | None |
| GAD-001 | Manifest shows migrations as PENDING | GOVERNANCE DEBT | MEDIUM | Migration applied | Update manifest immediately after migration |
| GAD-002 | Ledger shows migrations as PENDING | GOVERNANCE DEBT | MEDIUM | Migration applied | Update ledger immediately after migration |
| GAD-003 | Coexistence freeze shows shim as active | ACTIVATION RISK | HIGH | Shim removed | Supersede freeze document after shim removal |
| GAD-004 | Scheduler snapshot shows old computation model | GOVERNANCE DEBT | MEDIUM | `getDaysUntilWatering` fixed | Update computation model section |
| GAD-005 | Onboarding snapshot shows routing as double-commented | GOVERNANCE DEBT | MEDIUM | Routing slot uncommented | Supersede onboarding snapshot after activation |
| GAD-006 | Authority declaration shows B2.0 self-consistency | GOVERNANCE DEBT | LOW | Any activation event | Issue new dated declaration per phase |
| GAD-007 | Alignment matrix shows pre-migration states | GOVERNANCE DEBT | MEDIUM | Migration applied | Regenerate matrix after migration |
| GAD-008 | `careProfiles.ts` comments say "uncomment when" on active code | ACTIVATION RISK | MEDIUM | Code uncommented without comment removal | Remove activation condition comments simultaneously |
| GAD-009 | Shim comments say "column absent" after migration applied | ACTIVATION RISK | HIGH | Migration applied | Update shim comments immediately after migration |
| RAD-001 | Scheduler reads `last_completed_at + freq` not `next_due_at` | ACTIVATION RISK | HIGH | Seasonal scheduler activates | Fix `getDaysUntilWatering` before B2.3 (independent now) |
| RAD-002 | `frequency_days` assumed immutable | ACTIVATION RISK | MEDIUM | Canonical rebinding activated | Fix requires RAD-001 fix first |
| RAD-003 | Device clock assumed authoritative | GOVERNANCE DEBT | LOW | Server-side notifications added | Introduce server clock reference at that point |
| RAD-004 | `plant_care_profiles` assumed to be only resolution table | GOVERNANCE DEBT | LOW | Phase B2.2B activation | No action needed; comment-gate handles it |
| RAD-005 | All plants assumed to have `canonical_species_id = NULL` | ACTIVATION RISK | MEDIUM | Direct DB edit assigns canonical ID prematurely | Do not run backfill scripts before Phase 2.2 activates |
| RAD-006 | `care_logs` INSERT omits `canonical_species_id` | ACTIVATION RISK | HIGH | `supabase-migration-v2.sql` applied | One-line fix — deploy before or with migration |
| RAD-007 | Canonical propagation assumed impossible without code + schema | GOVERNANCE DEBT | LOW | Direct DB write by admin | Informational; coexistence handles it |
| RAD-008 | `care_logs.notes` assumed intentionally unwritten | GOVERNANCE DEBT | LOW | "Watering notes" UI feature added | Update INSERT at feature time |
| MAD-001 | CHECK constraint name assumed known or irrelevant | MIGRATION RISK | HIGH | `supabase-migration-v2.sql` applied | Run detection query before migration |
| MAD-002 | No RLS policy conflicts assumed on new tables | MIGRATION RISK | MEDIUM | `supabase-migration-v2.sql` applied | Verify tables absent before migration |
| MAD-003 | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` ordering assumed | MIGRATION RISK | HIGH | Wrong-order application | Always apply `migration-v2` first |
| MAD-004 | `supabase-migration-v2.sql` assumed to cover all TypeScript types | GOVERNANCE DEBT → MIGRATION RISK | MEDIUM | Phase B2.3B | Author `collapse_mappings` CREATE TABLE |
| MAD-005 | Manual migration process assumed to always include pre-checks | GOVERNANCE DEBT | MEDIUM | Automation introduced | Encode pre-checks in any automation script |
| MAD-006 | Profile seed assumed to precede canonical backfill | ACTIVATION RISK | MEDIUM | B2.2A seeding begins | Enforce ordering; document in execution checklist |
| MAD-007 | Migration state tracked only in governance doc, not live DB | GOVERNANCE DEBT | MEDIUM | Ledger falls out of sync | Create `schema_migrations` table |

---

### Priority Action Summary

**Immediate (no prerequisites — can act now):**

| ID | Action |
|---|---|
| RAD-006 | One-line fix: add `canonical_species_id` to `useWaterPlant` care_logs INSERT — prevents permanent history gap post-migration |
| RAD-001 | Fix `getDaysUntilWatering` to read `next_due_at` — prevents silent divergence at seasonal activation; independent of all migration and schema dependencies |

**Before `supabase-migration-v2.sql` is applied:**

| ID | Action |
|---|---|
| MAD-001 | Run CHECK constraint name detection query; resolve name mismatch |
| MAD-002 | Verify canonical tables absent from live DB |
| GAD-009 | Pre-draft updated shim comments for post-migration state |

**Before shim removal:**

| ID | Action |
|---|---|
| GAD-003 | Prepare superseding coexistence state freeze document |
| GAD-009 | Apply updated shim comments |
| RA-011 | Wire `SpeciesResolutionContext.method` through to `PlantInput.species_resolution_method` |
| RA-010 | Wire `_canonicalSpeciesId` parameter through to `generateDefaultCareTasks` routing slot |

**Before Phase 2.2 activation:**

| ID | Action |
|---|---|
| RA-009 | Diverge `user_entered_name` from `species_name` in `PlantForm` |
| RA-002 | Fix edit form pre-population (reads `species_name`, not `user_entered_name`) |
| RA-012 | Add call sites for `getSchemaMigrationStatus()` and `getPlantIdentityStatus()` |

**Before Phase B2.3 (seasonal scheduling):**

| ID | Action |
|---|---|
| RA-006 | Author `seasonal_watering_adjustment` ALTER TABLE migration |
| MAD-004 | Author `collapse_mappings` CREATE TABLE (if not already in a migration file) |
| RAD-002 | Fix canonical rebinding (requires RAD-001 already deployed) |

---

*This document is a read-only stale assumption registry. No application files, SQL files, schema state, or runtime behavior were modified in its generation. Supersede entries individually as each assumption is resolved; do not delete registry entries — mark them RESOLVED with a resolution date.*
