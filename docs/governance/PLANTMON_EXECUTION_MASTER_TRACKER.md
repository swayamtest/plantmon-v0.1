# PLANTMON Execution Master Tracker
**Status:** READ-ONLY governance document — do not edit during active development  
**Last updated:** 2026-05-29  
**Scope:** Phase G2.x — Runtime Architecture Stabilization through MVP Readiness  

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [Phase History: G2.x Governance Series](#2-phase-history-g2x-governance-series)
3. [Current Runtime State](#3-current-runtime-state)
4. [Runtime Activation Registry](#4-runtime-activation-registry)
5. [Pending Migration Registry](#5-pending-migration-registry)
6. [Technical Debt Register](#6-technical-debt-register)
7. [MVP Roadmap](#7-mvp-roadmap)
8. [Authoritative Document Index](#8-authoritative-document-index)
9. [Key Invariants](#9-key-invariants)

---

## 1. Project Identity

| Field | Value |
|---|---|
| App name | Plant Manager |
| Internal codename | PLANTMON |
| GitHub repo | `swayamtest/plantmon-v0.1` |
| Platform | React Native (Expo) |
| Backend | Supabase (auth + PostgreSQL) |
| UI theme | Forest-green |
| Monorepo package | `@workspace/mobile` |
| Artifact path | `artifacts/mobile/` |

---

## 2. Phase History: G2.x Governance Series

### G2.0 — Initial Schema Architecture
**Status:** COMPLETE  
**Alias:** Phase 2.1 (internal)  
**Authoritative docs:**
- `docs/governance/foundational/SCHEMA_INVENTORY_v0.1.md` — live DB baseline audit (6 tables)
- `docs/governance/foundational/RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` — schema divergence map

**Summary:**  
Audited the initial v0.1 live Supabase schema and designed the Phase 2.1 target schema to support canonical species intelligence. Documented the four-layer divergence that existed at this point:

| Layer | State at G2.0 |
|---|---|
| Local SQL (`supabase-migration-v2.sql`) | Phase 2.1 target — 4 new columns + 3 new tables |
| TypeScript types (`database.types.ts`) | Phase 2.1 target — aligned with migration SQL |
| Live Supabase DB | v0.1 only — migration NOT executed |
| Runtime code | v0.1 only — no canonical columns read/written |

**Key decision:** `canonical_species_id` is the runtime backbone of all future species intelligence. All canonical routing (alias resolution, collapse mapping, archetype selection, seasonal scheduling) will eventually route through this field.

**Column name invariant established:** Live DB column is `display_name`. Legacy documentation references `plant_name`. All code uses `display_name` correctly. This must never be reversed.

---

### G2.1 — Schema Architecture Freeze
**Status:** COMPLETE  
**Alias:** Phase 2.1 freeze  

**Summary:**  
Finalized the canonical schema design — `canonical_species`, `plant_aliases`, and `collapse_mappings` tables — and confirmed the 4 new columns to be added to `plants` and `care_profiles` via migration. The blueprint document `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` was established as the authoritative reference for all subsequent runtime work.

**Key columns added by the pending migration:**
- `plants.canonical_species_id` (uuid, FK → canonical_species)
- `plants.canonical_species_name` (text)
- `plants.species_resolution_method` (text — e.g. `"exact"`, `"alias"`, `"collapse"`, `"user_entered"`)
- `plants.user_entered_name` (text — raw user input before resolution)
- `care_profiles.canonical_species_id` (uuid, FK → canonical_species)
- `care_logs.canonical_species_id` (uuid, nullable — written at log time, not resolvable pre-migration)

---

### G2.1.5 — Runtime–Schema Compatibility Synchronization
**Status:** COMPLETE  
**Alias:** Phase B1.5A  
**Authoritative doc:** `docs/governance/runtime-alignment/LOCAL_RUNTIME_COMPATIBILITY_REPORT.md`

**Summary:**  
Synchronized the runtime code to be safe against both v0.1 (live DB, no new columns) and Phase 2.1 (post-migration DB, all columns present). Applied compatibility shims so that mutations do not attempt to write Phase 2.1 columns to the live v0.1 schema.

**Shims activated (still active as of G2.6):**
```typescript
// In useCreatePlant and useUpdatePlant — strip 4 Phase 2.1-only columns
const { user_entered_name, canonical_species_id, canonical_species_name,
        species_resolution_method, ...safeInsert } = plantData;
```

**Migration clearance granted:** The 5-category hardening migration may proceed once runtime is stable.

**9 runtime activation features identified as OFF** at this phase (see §4).

---

### G2.2 — Runtime Topology Audit
**Status:** COMPLETE  
**Alias:** Phase B1.75  
**Authoritative docs:**
- `docs/governance/governance-audit/RUNTIME_TOPOLOGY_AUDIT_v1.md` — full file inventory + coupling analysis
- `docs/governance/runtime-alignment/RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md` — TypeScript/DB alignment matrix

**Summary:**  
Full audit of the runtime codebase: all files catalogued, all cross-file couplings mapped, all schema-touching code located, and TypeScript type alignment against Supabase DB types verified.

**Three high-risk couplings identified:**

| Coupling | Risk | Status |
|---|---|---|
| `getDaysUntilWatering` ignores `next_due_at` | Medium — scheduler will drift post-migration | Pre-fix, pending Phase 2.2 |
| `useWaterPlant` uses `.maybeSingle()` without `active_status` filter | Low–Medium — could touch wrong plant if duplicates exist | Known, unresolved |
| `careProfiles.ts` default fallback emits no visibility signal | Low — silent degradation in production | Fixed in G2.6 |

**Pre-dataset migration recommendations issued:** Runtime must be stable before canonical dataset population.

---

### G2.3 — Pre-Dataset Hardening Migration Governance
**Status:** COMPLETE (governance documents ready) — migration SQL PENDING EXECUTION  
**Alias:** Phase B2.0  
**Authoritative doc:** `docs/governance/governance-migration/PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md`

**Summary:**  
Authored the complete 5-category database hardening migration required before any canonical species dataset can be safely loaded. The migration SQL is written and reviewed; it has NOT yet been executed against the live Supabase database.

**5 migration categories:**

| # | Category | What it does |
|---|---|---|
| 1 | Constraint hardening | NOT NULL + FK constraints on canonical columns post-population |
| 2 | Index additions | Performance indexes for alias and collapse lookups |
| 3 | RLS policy alignment | Row-level security policies for new tables |
| 4 | Trigger installation | `updated_at` auto-update triggers on new tables |
| 5 | Data integrity checks | Verification queries to confirm referential integrity after dataset load |

**Execution order:**
1. Execute `supabase-migration-v2.sql` (Phase 2.1 schema migration — adds columns and new tables)
2. Execute `PRE_DATASET_HARDENING_MIGRATION_v1.sql` (Phase B2.0 hardening)
3. Load canonical species dataset
4. Activate runtime routing flags

---

### G2.4 — Runtime Type and Mutation Alignment
**Status:** COMPLETE  
**Authoritative doc:** `docs/governance/runtime-alignment/RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md`

**Summary:**  
Resolved all TypeScript type and runtime mutation misalignments discovered in the G2.2 topology audit.

**Changes made:**

| File | Change | Reason |
|---|---|---|
| `hooks/usePlants.ts` → `useWaterPlant` | Now fetches plant's `canonical_species_id` before INSERT | Ensures `care_logs.canonical_species_id` is written at log time (null pre-migration, populated post-migration) |
| `hooks/usePlants.ts` → `useWaterPlant` | Confirmed `next_due_at` + `last_completed_at` both written on water event | These were already correct; no-op verification |
| TypeScript interfaces `CareTask`, `CareLog` | Confirmed `canonical_species_id` field already present | Type was ahead of runtime; no change needed |

**Post-G2.4 invariant:** Every `care_logs` INSERT attempts to carry `canonical_species_id`. The value is `null` until the Phase 2.1 migration runs and plants are linked to canonical species, but the column slot is wired.

---

### G2.5 — Runtime Validation Pass
**Status:** COMPLETE  
**Authoritative doc:** `docs/governance/runtime-alignment/G25_RUNTIME_VALIDATION.md`

**Summary:**  
End-to-end runtime validation sweep across all schema-touching code. Verified that:
- All Supabase queries reference columns that exist in the live DB
- All TypeScript types align with live DB shape
- All mutations correctly apply compatibility shims
- No runtime code attempts to read/write Phase 2.1 columns that do not yet exist in the live DB

**Verdict: SAFE** — runtime is fully stable against the live v0.1 schema with no forward-compatibility breaks.

---

### G2.6 — MVP Stabilization Fixes
**Status:** COMPLETE (this session)

**Summary:**  
Addressed two MVP-stability issues surfaced during the G2.5 validation pass:

**Fix 1 — Auth guard in `useCreatePlant`:**
- **Before:** `user!.id` (non-null assertion — silent crash if session lost mid-flow)
- **After:** Guarded throw — `if (!user) throw new Error("No authenticated user")`
- **File:** `artifacts/mobile/hooks/usePlants.ts`

**Fix 2 — Profile resolution visibility in `generateDefaultCareTasks`:**
- **Before:** Silent fallback to hardcoded defaults when no care profile found — no observability
- **After:** `console.warn("generateDefaultCareTasks: using default_fallback for species: ...")` emitted with resolution method context
- **File:** `artifacts/mobile/lib/careProfiles.ts`

**Typecheck status:** Clean pass after all G2.4–G2.6 changes.

---

## 3. Current Runtime State

As of **G2.6** (2026-05-29):

### Schema Layer Status

| Layer | Schema version | Notes |
|---|---|---|
| Live Supabase DB | v0.1 | 6 tables; no canonical columns; no canonical tables |
| Local migration SQL | Phase 2.1 target | `supabase-migration-v2.sql` — PENDING EXECUTION |
| TypeScript types (`database.types.ts`) | Phase 2.1 target | Ahead of live DB |
| Runtime code | v0.1 compatible + Phase 2.1 shims | Safe against both versions |

### Feature Status

| Feature | Status | Blocker |
|---|---|---|
| Plant CRUD | Working | — |
| Auth (Supabase) | Working | — |
| Care task generation | Working (default fallback only) | No canonical species data |
| Watering scheduler (client-side) | Working — writes `next_due_at` + `last_completed_at` | Seasonal rebinding OFF |
| `care_logs.canonical_species_id` write | Wired — writes null | Phase 2.1 migration not run |
| Species search / alias resolution | Not implemented | Phase 2.1 migration + dataset + UI |
| Canonical routing (all variants) | OFF — stubs only | See §4 |

### Environment Variables

> **Critical known issue:** Supabase credentials are **swapped** in the Replit secrets store.

| Secret name | Actual content |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Holds the **anon key** |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Holds the **Supabase URL** |

**Mitigation:** `artifacts/mobile/lib/supabase.ts` detects by `startsWith("https://")` and assigns variables correctly regardless of which env var contains which value. **Do not fix the secret names without also updating `lib/supabase.ts` — they must change together.**

---

## 4. Runtime Activation Registry

All 9 canonical intelligence features are currently **OFF**. Each is implemented as a stub or commented slot. Activation requires the Phase 2.1 migration to be executed AND canonical species dataset to be loaded.

| Feature | Current state | Activation condition |
|---|---|---|
| Alias routing (`plant_aliases` lookup) | OFF — slot commented out in `careProfiles.ts` | Phase 2.1 migration + alias dataset |
| Collapse routing (`collapse_mappings` lookup) | OFF — no code exists | Phase 2.1 migration + collapse dataset + implementation |
| Canonical routing (by `canonical_species_id`) | OFF — slot commented out in `careProfiles.ts` | Phase 2.1 migration + plant-to-canonical linkage |
| Scheduler rebinding (seasonal `watering_frequency_days`) | OFF — seasonal slot commented out in `careProfiles.ts` | Phase 2.1 migration + seasonal dataset |
| Archetype routing (growth stage modifiers) | OFF — not implemented | Future phase |
| Seasonal scheduling (date-aware frequency) | OFF — date slots commented out | Future phase |
| `plants.species_resolution_method` writes | OFF — field stripped by shim | Phase 2.1 migration |
| `plants.canonical_species_id` writes | OFF — field stripped by shim | Phase 2.1 migration |
| `plants.user_entered_name` writes | OFF — field stripped by shim | Phase 2.1 migration |

**Activation sequence (when ready):**
1. Execute Phase 2.1 migration SQL
2. Execute Phase B2.0 hardening migration SQL
3. Load canonical species dataset + aliases + collapse mappings
4. Remove compatibility shims from `useCreatePlant` / `useUpdatePlant`
5. Uncomment routing slots in `careProfiles.ts` one at a time with validation between each

---

## 5. Pending Migration Registry

| Migration file | Purpose | Status | Prerequisite |
|---|---|---|---|
| `supabase-migration-v2.sql` | Phase 2.1 — adds 4 columns to `plants`/`care_profiles`/`care_logs`; creates `canonical_species`, `plant_aliases`, `collapse_mappings` tables | **PENDING EXECUTION** | None (run first) |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Phase B2.0 — 5-category hardening (constraints, indexes, RLS, triggers, integrity checks) | **READY TO EXECUTE** | Must run after `supabase-migration-v2.sql` |

**Execution note:** Both migrations must be run against the live Supabase DB via the Supabase dashboard SQL editor or CLI (`supabase db push`). There is currently no automated migration tooling or observability for migration execution status.

---

## 6. Technical Debt Register

| ID | Description | Severity | File | Phase to resolve |
|---|---|---|---|---|
| TD-01 | `getDaysUntilWatering` ignores `next_due_at` — uses `last_watered_at + frequency_days` instead | Medium | `lib/careProfiles.ts` | Phase 2.2 (post-migration) |
| TD-02 | `useWaterPlant` `.maybeSingle()` has no `active_status` filter — could touch wrong plant if duplicates exist | Low–Medium | `hooks/usePlants.ts` | Phase 2.2 |
| TD-03 | Supabase env vars are swapped in secrets store; `lib/supabase.ts` compensates via runtime detection | Low (mitigated) | `lib/supabase.ts` | Fix both together, never in isolation |
| TD-04 | No migration execution observability — no tooling to confirm which migrations have run on live DB | Medium | Infrastructure | Pre-Phase 2.2 |
| TD-05 | `CareTaskStatus` type defined but unused | Low | `hooks/usePlants.ts` | Cleanup pass |
| TD-06 | Auth guard pattern duplicated across ~3 hooks without shared utility | Low | `hooks/usePlants.ts` | Cleanup pass |

---

## 7. MVP Roadmap

### M1.0 — Runtime Type Reconciliation
**Status: COMPLETE** (G2.4 + G2.5 + G2.6)  
- Schema alignment audit complete
- Type/mutation fixes applied
- Runtime validation: SAFE
- MVP stabilization fixes (auth guard, profile visibility) applied

### M1.1 — Database Migration Execution + Canonical Infrastructure
**Status: PENDING**  
- Execute `supabase-migration-v2.sql`
- Execute `PRE_DATASET_HARDENING_MIGRATION_v1.sql`
- Verify live DB state post-migration
- Remove compatibility shims from mutations
- Load canonical species seed dataset

### M1.2 — Intelligent Onboarding
**Status: NOT STARTED**  
- Plant add flow: species search UX
- Alias autocomplete (resolves user-entered names to canonical species)
- Species resolution method display
- `user_entered_name` capture and `species_resolution_method` tagging

### M1.3 — Dashboard + Task UX
**Status: NOT STARTED**  
- Care task list view with `next_due_at`-driven sorting
- Scheduler rebinding to `next_due_at` (replace `last_watered_at + frequency` in `getDaysUntilWatering`)
- Task completion flow
- Overdue task highlighting

### M1.4 — Plant Detail Experience
**Status: NOT STARTED**  
- Per-plant care history (from `care_logs`)
- Species info card (from `canonical_species`)
- Edit plant (with re-resolution flow)

### M1.5 — Semantic Intelligence Rendering
**Status: NOT STARTED**  
- Care profile display driven by canonical archetype
- Seasonal scheduling awareness
- Collapse mapping display ("you added X — did you mean Y?")

### M1.6 — Notifications
**Status: NOT STARTED**  
- Push notification integration (Expo Notifications)
- Due-date alerting driven by `next_due_at`
- Configurable reminder windows

---

## 8. Authoritative Document Index

| Document | Location | Phase | Role |
|---|---|---|---|
| Schema Inventory v0.1 | `docs/governance/foundational/SCHEMA_INVENTORY_v0.1.md` | G2.0 | Live DB baseline; 6-table inventory |
| Runtime Implementation Blueprint | `docs/governance/foundational/RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` | G2.1 | Schema divergence map; canonical design |
| Local Runtime Compatibility Report | `docs/governance/runtime-alignment/LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` | G2.1.5 | Shim spec; migration clearance; 9-feature OFF registry |
| Runtime Topology Audit | `docs/governance/governance-audit/RUNTIME_TOPOLOGY_AUDIT_v1.md` | G2.2 | Full file inventory; coupling risk map |
| Runtime Schema Alignment Audit | `docs/governance/runtime-alignment/RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md` | G2.2 | TypeScript/DB alignment matrix |
| Pre-Dataset Hardening Migration Report | `docs/governance/governance-migration/PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` | G2.3 | 5-category hardening spec; execution order |
| G2.5 Runtime Validation | `docs/governance/runtime-alignment/G25_RUNTIME_VALIDATION.md` | G2.5 | End-to-end validation; SAFE verdict |
| **This document** | `docs/governance/PLANTMON_EXECUTION_MASTER_TRACKER.md` | G2.6 | Master tracker; READ-ONLY |

### Source-of-truth files (code)

| File | Role |
|---|---|
| `artifacts/mobile/hooks/usePlants.ts` | All Supabase mutations (create, update, water, delete plant; create care task) |
| `artifacts/mobile/lib/careProfiles.ts` | Care profile resolution, task generation, scheduler logic |
| `artifacts/mobile/lib/supabase.ts` | Supabase client init with env var swap detection |
| `artifacts/mobile/types/database.types.ts` | Phase 2.1 TypeScript DB types (ahead of live DB) |
| `supabase-migration-v2.sql` | Phase 2.1 migration SQL — PENDING execution |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Phase B2.0 hardening SQL — PENDING execution |

---

## 9. Key Invariants

These rules must not be violated without deliberate documented decision:

1. **`display_name` is the plant name column.** Never rename to `plant_name` or create a `plant_name` column. The legacy schema doc says `plant_name`; the live DB and all code use `display_name`.

2. **`canonical_species_id` is the runtime backbone.** All canonical intelligence (alias resolution, collapse mapping, archetype selection, seasonal scheduling, care profile routing) routes through this single FK. Keep it nullable until a plant is linked to a canonical species.

3. **Compatibility shims must be removed atomically with migration execution.** The 4-field strip in `useCreatePlant`/`useUpdatePlant` exists because the live DB has no Phase 2.1 columns. Remove the shims only after confirming the migration has run. Never remove shims before migration; never run migration and leave shims in place long-term.

4. **Supabase env vars and `lib/supabase.ts` detection logic must change together.** The env vars are currently swapped. The detection workaround in `lib/supabase.ts` compensates. If the secrets are corrected in the Replit environment, the detection logic must be removed in the same change.

5. **Never execute Phase B2.0 hardening before Phase 2.1 schema migration.** The hardening migration assumes the Phase 2.1 tables and columns exist. Running it first against a v0.1 DB will fail.

6. **`care_logs.canonical_species_id` is written at INSERT time, not backfilled.** Historical logs from before the migration will have null `canonical_species_id`. This is expected and by design. Do not add a backfill that overwrites nulls with wrong values.

7. **All 9 canonical routing activations must be gated behind confirming the Phase 2.1 migration has run on the live DB.** Never uncomment routing slots while the live DB is still at v0.1.
