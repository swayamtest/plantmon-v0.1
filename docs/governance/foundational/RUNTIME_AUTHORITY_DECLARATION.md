# PLANTMON — Runtime Authority Declaration

**Classification:** Governance Baseline Freeze  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus (6 audits) + full governance baseline corpus (5 freeze documents)  

This document is the authoritative governance hierarchy declaration for PLANTMON at the Phase B2.0 boundary. It defines which system holds authority over each domain of runtime behavior, why those authority assignments are correct, what runtime properties are protected, and what governance disciplines must be established before advancing to future phases. No code was modified in its generation.

---

## GOVERNANCE AUTHORITY HIERARCHY

The PLANTMON governance hierarchy has four tiers. Each tier governs a distinct domain. No tier may override a higher tier's domain without a formal governance event (a deliberate, documented decision to change the authority assignment).

---

### Tier 1 — PRD Governance Authority

**Domain:** Intent, activation sequencing, feature scope, coexistence contract  
**Holder:** Product Requirements Document and governance audit corpus  
**Artifacts:** All documents in `governance-audit/` and `governance-baseline/`

The PRD governance tier holds authority over:

| Governed element | Authority assertion |
|---|---|
| Which features are planned | The existence of canonical routing, alias lookup, collapse normalization, and seasonal scheduling is PRD-authoritative — these features are designed and scoped |
| In what order features activate | The activation sequence (Phase 2.1 → B2.1 → Phase 2.2A → 2.2B → B2.3 → B2.3B) is PRD-authoritative |
| What the coexistence contract is | The Phase 2.1 shim, double-commented slots, and underscore-prefixed parameters are PRD-designed — they are not implementation accidents |
| What "done" means for each phase | Acceptance criteria for each activation phase are PRD-authoritative |
| What is NOT yet in scope | Collapse normalization, adaptive recurrence, care intelligence enrichment — their absence is PRD-authoritative, not an oversight |

**PRD authority does not govern:**
- Whether the live Supabase DB has applied a migration (that is Supabase operational authority)
- Whether a specific line of code implements a design correctly (that is Replit implementation authority)
- Whether the runtime is in a coexistence-safe state today (that is coexistence runtime authority)

**Current PRD authority assertion:** The activation phase sequence documented in `COEXISTENCE_STATE_FREEZE.md §Future Activation Dependencies` is the authoritative plan. No activation may proceed out of sequence. No feature not listed in the PRD authority corpus may be added to the live system without a new PRD-tier governance event.

---

### Tier 2 — Supabase Operational Authority

**Domain:** Live schema state, live data state, RLS enforcement, query execution  
**Holder:** The live Supabase project instance  
**Artifacts:** The actual tables, columns, indexes, triggers, RLS policies, and row data in the live Supabase DB

The Supabase operational tier holds authority over:

| Governed element | Authority assertion |
|---|---|
| What columns actually exist | The live schema is the ground truth — TypeScript types are aspirational until the migration is applied |
| What data is actually in the DB | The actual `plant_care_profiles` rows, `plants` rows, and `care_tasks` rows supersede any assumed state |
| Which RLS policies are enforced | The live policy set is authoritative — names and conditions in SQL files are aspirational until applied |
| What PostgREST will accept and return | Determined by the live schema — not by TypeScript type declarations |
| Whether a migration has been applied | Only the live DB schema can confirm this — no source file, no migration history table, no `getSchemaMigrationStatus()` call (which has zero call sites) provides a reliable oracle without querying the live DB |

**Why Supabase is operationally authoritative:**  
The PLANTMON mobile app has no ORM, no migration runner, and no startup SQL execution. The Supabase JS client is a PostgREST HTTP client — it accepts what the live DB serves and rejects what the live DB does not support. Every INSERT, UPDATE, SELECT, and DELETE operation is constrained by the live schema at query time, not by TypeScript types at compile time. The live schema is the only authority that matters at runtime.

**Supabase operational authority does not govern:**
- What the intended future schema is (PRD authority)
- How the application code handles what the DB returns (Replit implementation authority)
- Whether the runtime is in a safe coexistence state (coexistence runtime authority)

**Current Supabase authority assertion:** The live schema reflects `supabase-setup.sql` only. `supabase-migration-v2.sql` and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` are unapplied. Three Phase 2.2 tables are absent. Five Phase 2.1 columns on `plants` are absent. Two columns on `care_tasks` and `care_logs` are absent. This is the authoritative live state — it supersedes any TypeScript type that declares these fields.

---

### Tier 3 — Coexistence Runtime Authority

**Domain:** The operational contract governing what is safe to do right now, given the gap between Tier 1 (intent) and Tier 2 (live state)  
**Holder:** The four active coexistence mechanisms in the application source code  
**Artifacts:** `hooks/usePlants.ts:49–66` (shim), `hooks/usePlants.ts:9` (SELECT *), `lib/careProfiles.ts` (double-commented slots), `lib/careProfiles.ts:192` (underscore parameter)

The coexistence runtime tier holds authority over:

| Governed element | Authority assertion |
|---|---|
| What the app writes to Supabase | The Phase 2.1 shim is the runtime authority — it determines the actual INSERT/UPDATE payload regardless of what `PlantInput` contains |
| What the app reads from Supabase | `PLANT_SELECT = "*, care_tasks(*)"` is the runtime authority — all plant queries use this selector |
| Which resolution paths are active | The commented/uncommented state of routing slots is the runtime authority — `SpeciesResolutionMethod` enum values are irrelevant if the routing slots are commented out |
| Whether Phase 2.2 can activate | The coexistence runtime authority says NO until all activation prerequisites are satisfied — this is not a PRD decision, it is an operational safety constraint |

**Why coexistence topology is authoritative runtime reality:**  
The coexistence mechanisms are the operational boundary between the intended future state (Tier 1) and the live schema state (Tier 2). They exist specifically because Tier 1 and Tier 2 are not yet aligned. The coexistence layer is not a temporary hack — it is a deliberate governance instrument. Removing any coexistence mechanism before its corresponding Tier 2 prerequisite is satisfied violates the governance authority of Tier 3.

Concretely: the Phase 2.1 shim cannot be removed until `supabase-migration-v2.sql` is applied (Tier 2 prerequisite). The canonical routing slots cannot be uncommented until `canonical_species` is seeded and `plant_care_profiles.canonical_species_id` is backfilled (Tier 2 prerequisites). The coexistence layer enforces these sequencing constraints automatically — a developer who removes the shim without the migration applied will immediately see `400 Bad Request` errors. The coexistence layer's enforcement is mechanical, not advisory.

**Coexistence runtime authority does not govern:**
- When migrations will be applied (Tier 2 operational event)
- What the activation sequence is (Tier 1 PRD authority)
- How specific algorithms implement the resolution logic (Tier 4 implementation authority)

**Current coexistence authority assertion:** Four mechanisms are active and must not be altered until their specific activation prerequisites are satisfied. One known coexistence gap exists (edit form `user_entered_name` overwrite, documented in `COEXISTENCE_STATE_FREEZE.md`) — this gap has no current runtime impact and is governed by Tier 4 implementation authority to fix at Phase 2.2 activation time.

---

### Tier 4 — Replit Implementation Authority

**Domain:** Source code correctness, algorithm implementation, TypeScript type fidelity, UI behavior  
**Holder:** The Replit project source files  
**Artifacts:** All `.ts`, `.tsx` files in `artifacts/mobile/`

The Replit implementation tier holds authority over:

| Governed element | Authority assertion |
|---|---|
| How `getDaysUntilWatering` computes | TypeScript implementation — currently reads `last_completed_at + frequency_days` |
| How `PlantForm` validates inputs | TypeScript implementation — presence-only for `display_name` |
| How `resolveSpeciesProfile` orders its routing slots | TypeScript implementation — ilike active, alias/canonical commented out |
| What `PlantInput` type declares | TypeScript type system — aspirational until DB catches up |
| Which UI components render which data | TypeScript/React Native implementation |

**Why Replit is no longer schema-authoritative:**  
When this project was initialized, Replit was both the implementation authority and the schema authority — the `supabase-setup.sql` file in the Replit repo was the exact definition of the live DB schema. That alignment no longer holds. The Replit repo now contains two additional SQL files (`supabase-migration-v2.sql`, `PRE_DATASET_HARDENING_MIGRATION_v1.sql`) that define schema objects which **do not exist** in the live Supabase DB. The Replit source files describe an intended future state. The live Supabase DB is the actual current state. These are different.

The consequence: TypeScript types in Replit (`Plant.canonical_species_id?: string | null`) declare fields that do not exist in the live schema. These types compile correctly and pass type-checking. They are not wrong — they are forward-declarations for a future schema state. But they are not schema-authoritative. The live DB (Tier 2) is schema-authoritative.

**Replit implementation authority does not govern:**
- Whether the schema has been updated (Tier 2 authority)
- Whether the current code is safe to deploy given the current schema (Tier 3 authority)
- Whether a feature is in scope for the current phase (Tier 1 authority)

**Current Replit authority assertion:** The source code correctly implements the Phase B2.0 coexistence design. The Phase 2.1 shim is correctly placed. The Phase 2.2 slots are correctly commented out. The `getDaysUntilWatering` divergence (reads `last_completed_at` instead of `next_due_at`) is a known implementation debt at this tier, documented in `SCHEDULER_BASELINE_SNAPSHOT.md` — its fix is a Tier 4 implementation event that can occur without a Tier 2 schema event.

---

## OPERATIONAL AUTHORITY CLARIFICATION

### Why Supabase is Operationally Authoritative

Supabase holds operational authority for a single concrete reason: **PostgREST mediates every data operation the PLANTMON app performs**, and PostgREST enforces the live schema, not the TypeScript schema.

When the app sends `INSERT INTO plants (canonical_species_id, ...)`, PostgREST checks whether `canonical_species_id` exists on the `plants` table in the live DB. If it does not exist (current state), PostgREST returns HTTP `400 Bad Request`. The TypeScript type system has no authority over this outcome. The intention declared in `PlantInput.canonical_species_id?: string` has no authority over this outcome. Only the live DB schema has authority.

This authority is non-negotiable and non-bypassable:
- It cannot be overridden by TypeScript declarations
- It cannot be overridden by Replit environment variables
- It cannot be overridden by application code logic
- It can only be changed by applying a migration to the live DB

**Supabase's operational authority is also where the highest-risk governance events occur.** Every migration execution, every RLS policy change, every seed operation is a Supabase operational event. These events are irreversible (no automated rollback), manual (no migration runner), and untracked (no migration history table). Supabase's operational authority is consequential in both directions — it is the authority that makes activations real, and the authority under which mistakes cannot be automatically undone.

---

### Why Replit is No Longer Schema-Authoritative

At project inception, `supabase-setup.sql` defined the live schema exactly. The Replit source file was the schema definition. Replit was schema-authoritative.

That condition ended when `supabase-migration-v2.sql` was committed without being applied to the live DB. At that moment:
- Replit source: declares `canonical_species`, `plant_aliases`, `collapse_mappings`, and 5 new columns on `plants`
- Live Supabase DB: contains none of those objects

The Replit source is now **aspirational** — it describes a target state that has not been realized. It is the correct and complete design for Phase 2.1. But it is not the operational reality.

**The practical consequences of this authority gap:**

| Consequence | Impact |
|---|---|
| TypeScript types for Phase 2.1 fields compile and pass type-checking | Correct — types are forward-declarations |
| INSERT operations sending Phase 2.1 fields fail at runtime | The Phase 2.1 shim (Tier 3 authority) prevents this |
| Developers reading the TypeScript types may believe the schema is more advanced than it is | Governance risk — mitigated by this document and the `MIGRATION_EXECUTION_LEDGER.md` |
| `SELECT *` responses do not include Phase 2.1 fields | Handled by TypeScript optional typing — fields absent from response are `undefined` |

Replit will regain schema-authority at the moment `supabase-migration-v2.sql` is applied and the live DB matches the Replit source definition. Until then, the Tier 1 (PRD intent) and Tier 4 (Replit implementation) describe the same target state, while Tier 2 (Supabase live) describes the actual current state. Tier 3 (coexistence) bridges the gap.

---

### Why Coexistence Topology is Authoritative Runtime Reality

The coexistence topology is not a description of what the code is trying to do — it is a description of what the code is actually doing right now, accounting for the gap between Tier 1 intent and Tier 2 live state.

**The coexistence topology is authoritative because it is mechanically enforced:**

The Phase 2.1 shim (`usePlants.ts:49–66`) does not merely attempt to strip Phase 2.1 fields — it strips them unconditionally on every plant creation and edit. There is no condition, no feature flag, and no runtime state that bypasses it. It is structurally authoritative.

The double-commented routing slots (`careProfiles.ts:98–114`) do not merely suppress canonical routing — they make it syntactically impossible to activate without a source code edit. There is no runtime path that reaches them. They are structurally authoritative.

The `SELECT *` query (`usePlants.ts:9`) does not attempt forward-compatibility — it achieves it structurally, because PostgREST returns all existing columns by definition.

**The coexistence topology defines the operational boundary between what is safe and what is not safe to do today:**

| Safe to do today (within coexistence topology) | Unsafe to do today (violates coexistence topology) |
|---|---|
| Apply `supabase-migration-v2.sql` to the live DB | Remove the Phase 2.1 shim without applying the migration first |
| Seed `plant_care_profiles` with new rows | Uncomment `lookupByAlias` without seeding `plant_aliases` |
| Fix `getDaysUntilWatering` to read `next_due_at` | Apply `PRE_DATASET_HARDENING_MIGRATION_v1.sql` before `supabase-migration-v2.sql` |
| Add `canonical_species_id` to `care_logs` INSERT | Uncomment `lookupByCanonicalId` without backfilling `plant_care_profiles` |
| Call `getSchemaMigrationStatus()` from any component | Activate Phase 2.2 routing without Phase 2.1 migration applied |

The coexistence topology is the operational reality. Governance actions that respect it succeed. Governance actions that violate it fail — mechanically, immediately, and visibly (as runtime errors or silent data loss).

---

## RUNTIME ACTIVATION DOCTRINE

Three categories of activation event are distinct in the PLANTMON governance model. They must not be conflated. Each requires different prerequisites, different authorities, and different validation steps.

---

### Infrastructure Activation

**Definition:** A change to the live Supabase DB schema — adding tables, adding columns, creating indexes, enabling extensions, modifying RLS policies.

**Authority:** Tier 2 (Supabase operational authority)  
**Mechanism:** Manual SQL execution in the Supabase Dashboard SQL Editor  
**Reversibility:** Low — no automated rollback; forward-only by default  
**Validation:** Direct DB inspection (information_schema queries)

**Examples of infrastructure activation events:**
- Applying `supabase-migration-v2.sql` (adds 3 tables, 6 columns)
- Applying `PRE_DATASET_HARDENING_MIGRATION_v1.sql` (adds UNIQUE index, GIN index)
- Seeding `plant_care_profiles` with new species rows
- Seeding `canonical_species` with PLANT_0001-format IDs
- Seeding `plant_aliases` with alias rows

**Infrastructure activation does not automatically trigger runtime activation.** Applying `supabase-migration-v2.sql` adds the `canonical_species_id` column to `plants` but does not activate canonical routing. Seeding `plant_aliases` adds alias data but does not activate alias lookup. Infrastructure and runtime activation are independent events.

**Pre-infrastructure-activation requirements (from `MIGRATION_EXECUTION_LEDGER.md`):**
- Run CHECK constraint name detection query before `supabase-migration-v2.sql`
- Run RLS policy name detection query before `PRE_DATASET_HARDENING_MIGRATION_v1.sql`
- Confirm PostgREST schema cache refresh before removing the Phase 2.1 shim

---

### Runtime Activation

**Definition:** A change to the application source code that enables a previously inactive code path — uncommenting routing slots, removing shim strips, wiring function calls to previously-dead call sites.

**Authority:** Tier 4 (Replit implementation authority), constrained by Tier 3 (coexistence runtime authority)  
**Mechanism:** Source code edit, app deployment (Expo build/update)  
**Reversibility:** High — source code is version-controlled; revert is fast  
**Validation:** App behavior testing; React Query cache inspection; Supabase query log review

**Examples of runtime activation events:**
- Removing the Phase 2.1 shim from `useCreatePlant` and `useUpdatePlant`
- Uncommenting `lookupByAlias` function body and alias routing slot
- Uncommenting `lookupByCanonicalId` function body and canonical routing slot
- Rewriting `getDaysUntilWatering` to read `next_due_at`
- Adding `canonical_species_id` to `useWaterPlant`'s `care_logs` INSERT
- Calling `getSchemaMigrationStatus()` from a startup hook

**Runtime activation must not precede its infrastructure activation prerequisites.** Removing the Phase 2.1 shim (runtime activation) without applying `supabase-migration-v2.sql` (infrastructure activation) produces `400 Bad Request` on all plant creation — a full user-facing outage. This is the primary sequencing risk in the PLANTMON activation roadmap.

**Runtime activation does not automatically trigger operational activation.** Uncommenting the alias routing slot (runtime activation) with `plant_aliases` empty (infrastructure data state) produces a system where alias lookup always returns null and falls through to ilike — functionally harmless but wasteful. Effective routing requires data.

---

### Operational Activation

**Definition:** The state in which an activated code path produces meaningful output because both infrastructure activation AND runtime activation are complete AND the required data exists.

**Authority:** Tier 1 (PRD authority) defines when operational activation is expected; Tier 2 + Tier 3 + Tier 4 collectively produce it  
**Mechanism:** All three activation types completed in correct sequence  
**Reversibility:** Low for data consequences (care profiles assigned to plants are not automatically undone)  
**Validation:** End-to-end user flow testing; data integrity queries; resolution method audit

**Operational activation is the only activation that matters to the user.** A user cannot observe infrastructure activation (schema changes are invisible to the app UI). A user cannot observe runtime activation (code changes produce no effect until data supports them). A user observes operational activation — the first time alias routing returns a correct profile for their plant, or the first time a canonical species ID appears on a plant row, or the first time seasonal scheduling adjusts a countdown.

**The three activations for alias routing as a complete example:**

```
Infrastructure activation (Tier 2):
  1. Apply supabase-migration-v2.sql → plant_aliases table exists
  2. Seed plant_aliases with alias rows and search_priority values
  3. Backfill plant_care_profiles.canonical_species_id
  4. Apply PRE_DATASET_HARDENING_MIGRATION_v1.sql → GIN index exists

Runtime activation (Tier 4, constrained by Tier 3):
  5. Uncomment lookupByCanonicalId function body
  6. Uncomment lookupByAlias function body
  7. Uncomment alias routing slot in resolveSpeciesProfile
  8. Uncomment canonical routing slot in resolveSpeciesProfile
  9. Remove Phase 2.1 shim
  10. Wire canonical_species_id through generateDefaultCareTasks

Operational activation (Tier 1 validated):
  → User creates plant with species "monstera" →
    alias lookup finds "monstera" → canonical_species_id = PLANT_0042 →
    lookupByCanonicalId finds profile → frequency_days = 10 →
    plant.canonical_species_id = PLANT_0042 in DB →
    care_tasks.canonical_species_id = PLANT_0042 in DB →
    user sees species-correct countdown
```

Steps 1–4 can proceed without steps 5–10. Steps 5–10 can be deployed without steps 1–4 (harmlessly — alias lookup returns null, falls through to ilike). Operational activation requires all 10 steps in correct order.

---

## GOVERNANCE-PROTECTED RUNTIME PROPERTIES

The following five runtime properties are under active governance protection. They must not be altered, bypassed, or weakened by any implementation change without a deliberate Tier 1 governance event authorizing the change.

---

### Scheduler Continuity

**Protected property:** The active scheduler correctly computes watering urgency for all existing plants in the live system using the static-interval pull-based model.

**What is protected:**
- `getDaysUntilWatering` returns a meaningful, non-error result for every plant in the DB
- `generateDefaultCareTasks` creates exactly one active watering task per plant at creation
- `useWaterPlant` updates `last_completed_at` and `next_due_at` correctly on every watering
- No watering event produces a negative countdown or an infinite-loop state

**What would violate this protection:**
- Activating seasonal scheduling before fixing `getDaysUntilWatering` to read `next_due_at` (divergence failure)
- Removing the `active_status = true` guard in `generateDefaultCareTasks` (duplicate task creation)
- Changing `frequency_days` to a nullable-by-default column without updating the null guard in `getDaysUntilWatering`

**Governance action required to alter:** A Tier 4 implementation event with explicit Tier 1 authorization, preceded by the `getDaysUntilWatering` fix.

---

### Onboarding Trust

**Protected property:** Every plant creation attempt either succeeds with a valid DB record and care task, or fails with a visible error. No plant creation silently produces a corrupt or incomplete record without user notification.

**What is protected:**
- The Phase 2.1 shim prevents `400 Bad Request` on all plant creation (pre-migration)
- `display_name` presence validation ensures no nameless plant is created
- The `generateDefaultCareTasks` duplicate guard prevents double-task creation
- `submitError` banner surfaces any mutation failure to the user

**What would violate this protection:**
- Removing the Phase 2.1 shim before applying `supabase-migration-v2.sql` (silent 400 errors could be mishandled)
- Removing the duplicate guard in `generateDefaultCareTasks` without the DB UNIQUE index as backstop
- Suppressing the `submitError` banner in `new.tsx`

**Governance action required to alter:** Tier 3 coexistence authority must first be satisfied (migration applied) before Tier 4 changes the shim.

---

### Coexistence Safety

**Protected property:** The application operates correctly in the pre-migration schema state. No runtime error occurs due to the absence of Phase 2.1 columns or Phase 2.2 tables.

**What is protected:**
- The Phase 2.1 shim (INSERT/UPDATE safety)
- The `SELECT *` forward-compatible query (SELECT safety)
- The double-commented routing slots (resolution safety)
- The `_canonicalSpeciesId` underscore parameter (task generation safety)
- TypeScript optional typing on all Phase 2.1 fields (compile-time safety)

**What would violate this protection:**
- Any of the four coexistence mechanisms altered without satisfying their respective Tier 2 prerequisites
- Adding a non-optional (`!`) dereference on any Phase 2.1 field in any component
- Changing `PLANT_SELECT` to name specific columns instead of `*` in a way that breaks pre/post-migration compatibility

**Governance action required to alter:** Each coexistence mechanism has specific documented prerequisites in `COEXISTENCE_STATE_FREEZE.md`. Those prerequisites must be satisfied before the mechanism is altered.

---

### Canonical Isolation

**Protected property:** No canonical infrastructure — `canonical_species_id`, `plant_aliases`, `collapse_mappings`, `lookupByCanonicalId`, `lookupByAlias` — can activate at runtime under any condition, without deliberate multi-step code and schema changes.

**What is protected:**
- The double-comment barrier on `lookupByCanonicalId` and `lookupByAlias` (function body + call site)
- The double-comment barrier on canonical and alias routing slots
- The absence of `canonical_species`, `plant_aliases`, and `collapse_mappings` from the live DB
- The shim preventing `canonical_species_id` from being written even if code attempted it

**What would violate this protection:**
- Uncommenting any routing slot or function body without satisfying all upstream prerequisites
- Any feature flag, environment variable, or dynamic import that could route to the commented-out functions at runtime
- Any code that bypasses `resolveSpeciesProfile` to directly query `plant_aliases` or `canonical_species`

**Governance action required to alter:** Tier 1 PRD authorization for the specific phase (B2.2A or B2.2B), followed by all listed infrastructure activation prerequisites.

---

### Migration Safety

**Protected property:** The live Supabase DB is never modified by application code at runtime. All schema changes require deliberate manual execution. No migration runs automatically.

**What is protected:**
- The absence of any migration runner, ORM sync, or startup SQL in the mobile app
- The Drizzle ORM's scope being limited to the api-server's separate `DATABASE_URL`
- The Supabase JS client being a PostgREST HTTP client (cannot push schema)
- The manual migration execution model documented in `MIGRATION_EXECUTION_LEDGER.md`

**What would violate this protection:**
- Adding a startup `useEffect` that executes SQL against the Supabase DB
- Configuring Drizzle to use the Supabase DB connection string
- Adding a Supabase Edge Function that auto-applies migrations on trigger
- Adding a `pnpm run` script that auto-applies migrations without verification

**Governance action required to alter:** A Tier 1 governance event explicitly authorizing the introduction of an automated migration mechanism, with Tier 2 verification and rollback planning.

---

## FUTURE GOVERNANCE REQUIREMENTS

Four governance disciplines must be established before PLANTMON can safely advance through Phase 2.1, Phase 2.2, and beyond. These are not optional improvements — they are prerequisites for operating at higher governance maturity.

---

### Migration Hardening

**Current state:** Level 1 — ad-hoc manual execution with structured documentation  
**Required state:** Level 2 — tracked manual execution with verification protocol

**Required actions:**

| Action | Priority | Notes |
|---|---|---|
| Create `schema_migrations` tracking table in live Supabase DB | HIGH | Document each applied migration with filename, applied timestamp, applied-by |
| Author rollback SQL for each migration | HIGH | `supabase-migration-v2.sql` rollback: DROP the 3 new tables, DROP the 6 new columns, revert `light_requirement` CHECK constraint |
| Establish pre-application verification protocol | HIGH | Run constraint name detection, RLS policy name detection, PostgREST cache check before every migration |
| Define migration idempotency standard | MEDIUM | All future migrations must be fully idempotent (`IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`) |
| Add GIN index to `plant_care_profiles.species_name` | MEDIUM | Current ilike fallback is an unindexed sequential scan; required before post-seeding dataset growth degrades performance |

**The CHECK constraint name risk** (`supabase-migration-v2.sql §B7`) is the single highest-priority pre-application action. It is the only operation in either pending migration that could produce silent data corruption (duplicate CHECK constraint accepting new values but rejecting writes). It must be resolved before `supabase-migration-v2.sql` is applied.

---

### Alignment Discipline

**Current state:** TypeScript types are manually synchronized to schema; no codegen; no drift detection  
**Required state:** Automated type generation from live schema; or a formal manual sync protocol with drift detection

**Required actions:**

| Action | Priority | Notes |
|---|---|---|
| Establish `supabase gen types typescript` codegen step | HIGH | Eliminates manual type/schema sync; run after every migration |
| Wire `getSchemaMigrationStatus()` to a startup log or diagnostic surface | MEDIUM | Currently compiled but never called — zero-call-site state is a governance gap |
| Define the "schema alignment checkpoint" — a verification step run before any deployment that touches schema-dependent code | MEDIUM | Must confirm Tier 2 (live schema) matches Tier 4 (TypeScript types) before Tier 3 (coexistence) is altered |
| Document the credential swap in `replit.md` | LOW | Currently only in agent memory (`supabase-creds.md`) and `lib/supabase.ts` comments — should be in the human-readable project README |

**The current alignment gap is managed but not governed.** The Phase 2.1 shim handles the known misalignment. But the shim covers exactly four fields — any additional misaligned field not covered by the shim produces either a silent write failure (if an absent column is in the INSERT) or a silent read gap (if an absent column is in the TypeScript type). The shim is not a general-purpose alignment mechanism; it is a specific coexistence instrument for the four Phase 2.1 fields.

---

### Activation Sequencing Discipline

**Current state:** Activation sequence is documented in governance documents; no enforcement mechanism exists  
**Required state:** Sequencing gates are enforced programmatically or through a formal checklist with sign-off

**Required actions:**

| Action | Priority | Notes |
|---|---|---|
| Define a formal activation checklist for each phase | HIGH | Each checklist item must be verifiable (via SQL query, code inspection, or runtime test) before the next item proceeds |
| Implement `getSchemaMigrationStatus()` as a startup gate | HIGH | The function exists and is correct — it must be called before Phase 2.2 routing is activated |
| Establish the "shim removal protocol" | HIGH | The most dangerous single activation event: (1) confirm migration applied, (2) confirm PostgREST serving new columns, (3) confirm canonical_species_id population logic active, (4) remove shim in same deployment |
| Define separation of infrastructure and runtime activation deployments | MEDIUM | Infrastructure activation (migration) should be a separate event from runtime activation (code deployment) — reduces blast radius of each |
| Document the `care_logs` canonical_species_id gap as a Phase 2.2 activation blocker | MEDIUM | This is a one-line code fix (`useWaterPlant` INSERT) that must be deployed before or concurrent with Phase 2.2 activation — if deployed after, all waterings between activation and fix produce null `care_logs.canonical_species_id` |

**The `getDaysUntilWatering` fix is the only activation-sequencing-independent improvement.** It can be deployed at any time — before Phase 2.1 migration, before Phase 2.2 activation, before dataset seeding — with zero risk and positive governance value. It is the one action that removes a HIGH-severity risk from the scheduler domain without requiring any prerequisite. It should be treated as an immediate implementation event, not a future-phase dependency.

---

### Rollback-Safe Evolution

**Current state:** No rollback scripts; all migrations are forward-only; no staging environment  
**Required state:** Every migration has a corresponding rollback script; a staging Supabase project validates migrations before live application

**Required actions:**

| Action | Priority | Notes |
|---|---|---|
| Author rollback SQL for `supabase-migration-v2.sql` | HIGH | DROP canonical tables, DROP Phase 2.1 columns, revert CHECK constraint |
| Author rollback SQL for `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | HIGH | DROP UNIQUE partial index, DROP GIN index, restore original RLS policies |
| Create a staging Supabase project for migration pre-validation | MEDIUM | Apply each migration to staging first; validate with representative data; then apply to live |
| Define the "point of no return" for each migration | MEDIUM | `supabase-migration-v2.sql` becomes difficult to roll back once plants have `canonical_species_id` values written; document when rollback becomes data-destructive |
| Establish the Phase 2.2 rollback boundary | LOW | Post-Phase-2.2 activation, plant rows carry `canonical_species_id` — rolling back the schema would null these values; user care history would lose canonical linkage |

**The most important rollback document that does not yet exist** is the rollback for `supabase-migration-v2.sql §B7` — the CHECK constraint recreation. If this operation adds a duplicate constraint (due to name mismatch), the rollback is not straightforward: it requires identifying the correct constraint name via `pg_constraint` and dropping it by OID or by its actual auto-generated name. This rollback must be pre-authored before the migration is applied, because discovering the correct rollback procedure after a corrupt state is the wrong time to be designing it.

---

## AUTHORITY SUMMARY

| Domain | Authoritative tier | Current holder | Current assertion |
|---|---|---|---|
| Feature intent and activation sequence | Tier 1 — PRD | Governance audit corpus | Phase B2.0; no activations beyond ilike |
| Live schema and data state | Tier 2 — Supabase operational | Live Supabase project | `supabase-setup.sql` schema only; 2 migrations unapplied |
| Runtime safety and coexistence contract | Tier 3 — Coexistence runtime | 4 active mechanisms in source code | STABLE; no unsafe activations possible |
| Source code implementation | Tier 4 — Replit implementation | `artifacts/mobile/` source files | Correctly implements Phase B2.0 coexistence design |

**The governance hierarchy is self-consistent at Phase B2.0.** Tier 1 (PRD intent) describes what Phase B2.0 should be. Tier 2 (live schema) reflects the correct pre-migration schema. Tier 3 (coexistence) correctly bridges the gap between Tier 1's future intent and Tier 2's current state. Tier 4 (implementation) correctly implements the coexistence design. No tier is in conflict with any other at this phase boundary.

**The hierarchy will require re-validation at each activation event.** When `supabase-migration-v2.sql` is applied (Tier 2 event), Tier 3's shim becomes removable (but not yet removed). When the shim is removed (Tier 4 event), Tier 3's coexistence contract changes. When the canonical routing slots are uncommented (Tier 4 event), Tier 3's active resolution paths change. Each event requires confirming that the hierarchy remains self-consistent after the change.

---

*This document is a read-only runtime authority declaration. No application files, SQL files, runtime behavior, or schema state were modified in its generation. Supersede only by issuing a new dated declaration after a confirmed authority-tier event.*
