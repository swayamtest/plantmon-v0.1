# PLANTMON — Activation Boundary Registry

**Classification:** Governance Reconciliation Audit  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + full governance baseline corpus + `SUPABASE_REPLIT_ALIGNMENT_MATRIX.md` + `STALE_ASSUMPTION_REGISTRY.md`  

This document is the authoritative activation boundary registry for PLANTMON at the Phase B2.0 boundary. For every system that is currently inactive, it records the exact mechanism keeping it inactive, the complete set of prerequisites required to activate it, and the specific failure mode produced by premature activation. No code was modified in its generation.

**Activation state definitions used in this document:**

| State | Meaning |
|---|---|
| **SCHEMA-LIVE** | The required DB tables and columns exist in the live Supabase DB |
| **DATA-LIVE** | The required seed data exists in the live DB for this system to produce meaningful output |
| **RUNTIME-LIVE** | The code path executes during normal app operation |
| **RUNTIME-OFF** | The code path does not execute; the code may or may not exist |
| **COMMENT-GATED** | Source code comments structurally prevent execution; two independent barriers required |
| **UNIMPLEMENTED** | No code exists at any layer for this system |
| **PARTIALLY-WIRED** | Some code infrastructure exists (types declared, parameters accepted, values computed) but the end-to-end execution path is not connected |

---

## INFRASTRUCTURE-LIVE BUT RUNTIME-OFF SYSTEMS

### 1. Alias Routing

**Summary:** Resolves a user's species input by matching it against the `plant_aliases` table to derive a `canonical_species_id`, then retrieves the corresponding care profile. Currently inactive at every layer.

---

**Schema Readiness**

| Required object | Exists in live DB? | In pending migration? |
|---|---|---|
| `plant_aliases` table | ❌ ABSENT | 🟡 `supabase-migration-v2.sql` (unapplied) |
| `plant_aliases.alias_name` column | ❌ ABSENT | 🟡 in migration |
| `plant_aliases.canonical_species_id` FK | ❌ ABSENT | 🟡 in migration |
| `plant_aliases.search_priority` column | ❌ ABSENT | 🟡 in migration |
| `canonical_species` table (FK target) | ❌ ABSENT | 🟡 in migration |
| `plant_care_profiles.canonical_species_id` | ❌ ABSENT | 🟡 in migration |
| GIN index on alias_name | ❌ ABSENT | 🟡 `PRE_DATASET_HARDENING_MIGRATION_v1.sql` |

**Schema readiness verdict:** NOT READY — all required tables and columns are absent from the live DB. `supabase-migration-v2.sql` and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` must both be applied.

---

**Runtime Readiness**

| Required code object | Exists? | State |
|---|---|---|
| `lookupByAlias(aliasName)` function | 🟡 YES | COMMENTED OUT — function body at `careProfiles.ts:74–88` |
| `lookupByCanonicalId(id)` function | 🟡 YES | COMMENTED OUT — function body at `careProfiles.ts:62–71` (alias calls this) |
| Alias routing slot in `resolveSpeciesProfile` | 🟡 YES | COMMENTED OUT — call site at `careProfiles.ts:107–114` |
| Canonical routing slot in `resolveSpeciesProfile` | 🟡 YES | COMMENTED OUT — call site at `careProfiles.ts:98–105` |
| `canonical_species_id` forwarded through `generateDefaultCareTasks` | ❌ NO | `_canonicalSpeciesId` parameter accepted but never passed to routing |
| `canonical_species_id` written to `plants` INSERT | ❌ NO | Shim strips it unconditionally |
| `canonical_species_id` written to `care_logs` INSERT | ❌ NO | One-line gap in `useWaterPlant` |

**Runtime readiness verdict:** NOT READY — four comment barriers must be removed; three additional code changes required; shim must be removed.

---

**Current Activation State:** RUNTIME-OFF / COMMENT-GATED  
**Activation phase:** B2.2B (after B2.2A canonical routing is operational)

---

**Gating Mechanism**

Alias routing has a **quadruple gate** — four independent barriers that each independently prevent execution:

| Gate | Location | Type | What happens if only this gate is removed |
|---|---|---|---|
| Gate 1 | `lookupByAlias` function body commented | Source code | Function does not exist — call site produces compile error |
| Gate 2 | `lookupByCanonicalId` function body commented | Source code | `lookupByAlias` calls this — removing Gate 1 without Gate 2 produces compile error |
| Gate 3 | Alias routing slot in `resolveSpeciesProfile` commented | Source code | Even if functions exist, slot is never reached |
| Gate 4 | `plant_aliases` table absent from live DB | Schema | Even with all code active, every query returns PostgREST 404 |

Gates 1 and 2 are structurally coupled: removing Gate 1 alone produces a compile error. Gates 1 + 2 + 3 can all be removed and the system remains inert until Gate 4 is satisfied (schema). Gate 4 alone being satisfied (schema present without code) has no effect — the commented code never reaches the table.

---

**Activation Dependencies (ordered)**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `supabase-migration-v2.sql` applied | Infrastructure | ❌ UNAPPLIED |
| 2 | CHECK constraint name conflict resolved pre-migration | Pre-flight | ❌ NOT VERIFIED |
| 3 | `canonical_species` seeded with PLANT_0001-format IDs | Data | ❌ EMPTY |
| 4 | `plant_care_profiles.canonical_species_id` backfilled | Data | ❌ NULL on all rows |
| 5 | `plant_aliases` seeded with alias rows | Data | ❌ EMPTY |
| 6 | `search_priority` values authored for all aliases | Data | ❌ NOT AUTHORED |
| 7 | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` applied (GIN index) | Infrastructure | ❌ UNAPPLIED |
| 8 | `lookupByCanonicalId` function uncommented | Code | ❌ COMMENTED OUT |
| 9 | `lookupByAlias` function uncommented | Code | ❌ COMMENTED OUT |
| 10 | Alias routing slot uncommented | Code | ❌ COMMENTED OUT |
| 11 | Canonical routing slot uncommented (required by alias chain) | Code | ❌ COMMENTED OUT |
| 12 | Phase 2.1 shim removed from `useCreatePlant` | Code | ❌ SHIM ACTIVE |
| 13 | Phase 2.1 shim removed from `useUpdatePlant` | Code | ❌ SHIM ACTIVE |
| 14 | `_canonicalSpeciesId` wired through `generateDefaultCareTasks` | Code | ❌ PARAM UNUSED |
| 15 | `canonical_species_id` write added to `useWaterPlant` care_logs INSERT | Code | ❌ ONE-LINE GAP |

**Strict sequencing constraint:** Dependencies 1–7 (infrastructure + data) must precede dependencies 8–15 (code). Dependencies 12–13 (shim removal) must be atomic with dependency 14 (canonical ID wiring) — a window where the shim is removed but canonical IDs are not being written produces null `canonical_species_id` on all new plants, permanently, with no error.

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode | Reversibility |
|---|---|---|
| Code uncommented before schema exists (deps 8–11 without dep 1) | Compile error: `lookupByAlias` calls `lookupByCanonicalId` which does not compile if still commented; OR if only routing slot uncommented, alias query hits absent table → PostgREST 404 on every plant creation | HIGH — revert code change |
| Shim removed before migration applied (deps 12–13 without dep 1) | HTTP 400 Bad Request on every plant creation and edit — `canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method` all rejected by PostgREST as unknown columns | HIGH — revert shim removal; immediate user-facing outage |
| Code activated before alias data seeded (deps 8–11 with dep 1, without deps 5–6) | Alias lookup always returns null → falls through to ilike — functionally harmless but wasteful; every plant creation makes a wasted query that always fails | HIGH — safe regression |
| Alias activated before canonical routing active (dep 10 without dep 11) | `lookupByAlias` calls `lookupByCanonicalId` internally — if canonical routing slot not active, the alias lookup retrieves a canonical ID but cannot resolve a care profile from it; returns null; falls through to ilike | HIGH — safe regression |
| dep 14 (canonical ID wiring) without dep 12–13 (shim removal) | `generateDefaultCareTasks` correctly receives canonical ID but shim strips it from the plant INSERT — plant row never gets `canonical_species_id` despite task generation using the correct profile | MEDIUM — silent data gap; no error |

---

### 2. Collapse Routing

**Summary:** Normalizes variant species input against `collapse_mappings` to produce a canonical equivalent before alias or canonical lookup. The most immature system in the entire activation chain.

---

**Schema Readiness**

| Required object | Exists in live DB? | In any SQL file? |
|---|---|---|
| `collapse_mappings` table | ❌ ABSENT | ❌ NO CREATE TABLE IN ANY SQL FILE |
| `collapse_mappings.variant_name` | ❌ ABSENT | ❌ ABSENT |
| `collapse_mappings.canonical_name` | ❌ ABSENT | ❌ ABSENT |
| `collapse_mappings.collapse_confidence` | ❌ ABSENT | ❌ ABSENT |
| `collapse_mappings.operational_similarity` | ❌ ABSENT | ❌ ABSENT |
| `collapse_mappings.consumer_recognition_overlap` | ❌ ABSENT | ❌ ABSENT |

**Schema readiness verdict:** NOT READY — no SQL definition exists anywhere. The `CollapseMapping` TypeScript interface defines the shape but no migration creates the table. This is the only system in PLANTMON for which the TypeScript type system is ahead of both the live schema and the migration SQL.

---

**Runtime Readiness**

| Required code object | Exists? | State |
|---|---|---|
| `lookupByCollapseMapping()` function | ❌ DOES NOT EXIST | UNIMPLEMENTED — not even a commented stub |
| Collapse routing slot in `resolveSpeciesProfile` | ❌ DOES NOT EXIST | UNIMPLEMENTED |
| Confidence threshold logic | ❌ DOES NOT EXIST | Not designed |
| Collapsed output routed to alias/canonical chain | ❌ DOES NOT EXIST | Not designed |
| `CollapseMapping` interface | 🟡 YES | Typed in `types/canonical.ts` — but no runtime code references it |

**Runtime readiness verdict:** NOT READY — zero implementation exists at any layer.

---

**Current Activation State:** UNIMPLEMENTED  
**Activation phase:** B2.3B (last in the activation chain)

---

**Gating Mechanism**

Collapse routing is gated by **total absence** — there is no code to uncomment, no slot to enable, and no table to seed. Activation requires net-new authoring at every layer: SQL migration, lookup function, routing slot, confidence algorithm, and routing integration. There is no partial implementation to build on.

---

**Activation Dependencies (ordered)**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All alias routing activation complete (15 deps above) | Mixed | ❌ NOT STARTED |
| 2 | `collapse_mappings` CREATE TABLE authored in new migration | Infrastructure | ❌ NOT AUTHORED |
| 3 | `collapse_mappings` migration applied | Infrastructure | ❌ UNAPPLIED |
| 4 | `collapse_mappings` seeded with entries and confidence scores | Data | ❌ EMPTY |
| 5 | Confidence threshold values designed and documented | Design | ❌ NOT DESIGNED |
| 6 | `lookupByCollapseMapping()` function authored | Code | ❌ NOT IMPLEMENTED |
| 7 | Confidence threshold logic implemented | Code | ❌ NOT IMPLEMENTED |
| 8 | Collapse routing slot added to `resolveSpeciesProfile` (before alias slot in execution order) | Code | ❌ NOT IMPLEMENTED |
| 9 | Collapsed input routed through alias → canonical chain | Code | ❌ NOT IMPLEMENTED |

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode |
|---|---|
| Any query to `collapse_mappings` before table created | PostgREST 404 on every plant creation |
| Collapse routing inserted in wrong position in `resolveSpeciesProfile` (after ilike instead of before alias) | ilike match shadows collapse normalization — a correctly-typed species bypasses alias lookup |
| Confidence threshold set too low | Incorrect species collapsed to wrong canonical — wrong care profile assigned silently |
| Confidence threshold set too high | All collapse attempts produce no match — collapser is inert; ilike fallback handles everything as before |

---

### 3. Canonical Routing

**Summary:** Resolves a plant's care profile by querying `plant_care_profiles` using a `canonical_species_id` (exact equality match). The first leg of the Phase 2.2A activation.

---

**Schema Readiness**

| Required object | Exists in live DB? | In pending migration? |
|---|---|---|
| `plant_care_profiles.canonical_species_id` | ❌ ABSENT | 🟡 `supabase-migration-v2.sql` (unapplied) |
| `canonical_species` table | ❌ ABSENT | 🟡 in migration |
| `plants.canonical_species_id` | ❌ ABSENT | 🟡 in migration |

**Schema readiness verdict:** NOT READY — migration unapplied; core column absent.

---

**Runtime Readiness**

| Required code object | Exists? | State |
|---|---|---|
| `lookupByCanonicalId(id)` function | 🟡 YES | COMMENTED OUT — `careProfiles.ts:62–71` |
| Canonical routing slot in `resolveSpeciesProfile` | 🟡 YES | COMMENTED OUT — `careProfiles.ts:98–105` |
| `canonical_species_id` present in `resolveSpeciesProfile` input | ❌ NO | `PlantInput` has the field; shim strips it before it reaches the resolver |
| `plant_care_profiles.canonical_species_id` populated | ❌ NO | Column absent; no data |

**Runtime readiness verdict:** NOT READY — double comment barrier; shim strips the input value; column absent from profile table.

---

**Current Activation State:** RUNTIME-OFF / COMMENT-GATED  
**Activation phase:** B2.2A

---

**Gating Mechanism**

Canonical routing has a **triple gate**:

| Gate | Location | Type |
|---|---|---|
| Gate 1 | `lookupByCanonicalId` function body commented | Source code |
| Gate 2 | Canonical routing slot in `resolveSpeciesProfile` commented | Source code |
| Gate 3 | Phase 2.1 shim strips `canonical_species_id` from `PlantInput` before it reaches `resolveSpeciesProfile` | Runtime shim |

Gate 3 is mechanically independent from Gates 1 and 2: even if both code comment barriers are removed, `input.canonical_species_id` is always `undefined` when `resolveSpeciesProfile` is called because the shim has already stripped it. All three gates must be removed simultaneously in a coordinated deployment.

---

**Activation Dependencies (ordered)**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `supabase-migration-v2.sql` applied | Infrastructure | ❌ UNAPPLIED |
| 2 | CHECK constraint name conflict resolved | Pre-flight | ❌ NOT VERIFIED |
| 3 | `canonical_species` seeded with PLANT_0001-format IDs | Data | ❌ EMPTY |
| 4 | `plant_care_profiles.canonical_species_id` backfilled | Data | ❌ NULL on all rows |
| 5 | `lookupByCanonicalId` function uncommented | Code | ❌ COMMENTED OUT |
| 6 | Canonical routing slot uncommented | Code | ❌ COMMENTED OUT |
| 7 | Phase 2.1 shim removed from `useCreatePlant` and `useUpdatePlant` | Code | ❌ SHIM ACTIVE |
| 8 | `canonical_species_id` wired through onboarding to `generateDefaultCareTasks` | Code | ❌ PARAM UNUSED |
| 9 | `canonical_species_id` written to `care_logs` in `useWaterPlant` | Code | ❌ ONE-LINE GAP |
| 10 | `SpeciesResolutionContext.method` wired to `plants.species_resolution_method` write | Code | ❌ CONTEXT DISCARDED |
| 11 | Existing plants backfill migration authored and applied | Data | ❌ NOT DRAFTED |

**Critical sequencing: deps 7–10 must be deployed atomically.** Shim removal without canonical ID wiring (dep 8) = `canonical_species_id` column exists but all writes are null. Canonical ID wiring without shim removal (dep 7) = value computed, then stripped. Both must activate in the same deployment.

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode | Severity |
|---|---|---|
| Shim removed before migration (dep 7 without dep 1) | HTTP 400 on all plant creation and edit | CRITICAL — full outage |
| Canonical slot uncommented with empty `plant_care_profiles.canonical_species_id` (dep 6 without dep 4) | Lookup always returns null → falls through to ilike; wasted DB round-trip | LOW — safe regression |
| Canonical slot uncommented without shim removal (dep 6 without dep 7) | `input.canonical_species_id` is always undefined; canonical route never fires even with data | LOW — silent non-activation |
| Dep 7–8 deployed without dep 9 (care_logs write missing) | Column exists post-migration; every watering writes null to `care_logs.canonical_species_id` permanently | HIGH — permanent history orphans |
| Backfill (dep 11) before `canonical_species` seeded (dep 3) | FK violation on `plants.canonical_species_id` | HIGH — migration failure |

---

### 4. Scheduler Rebinding

**Summary:** Updates an existing plant's `care_tasks.frequency_days` (and recalculates `next_due_at`) when the plant's `canonical_species_id` is resolved or changed. Currently has no implementation at any layer.

---

**Schema Readiness**

| Required object | Exists in live DB? | In pending migration? |
|---|---|---|
| `plants.canonical_species_id` | ❌ ABSENT | 🟡 in migration |
| `care_tasks.canonical_species_id` | ❌ ABSENT | 🟡 in migration |
| `plant_care_profiles.canonical_species_id` | ❌ ABSENT | 🟡 in migration |

**Schema readiness verdict:** NOT READY — migration unapplied.

---

**Runtime Readiness**

| Required code object | Exists? | State |
|---|---|---|
| Rebinding logic in `useUpdatePlant` or separate `useRebindPlant` hook | ❌ DOES NOT EXIST | UNIMPLEMENTED |
| Logic to compare old vs. new `frequency_days` | ❌ DOES NOT EXIST | Not designed |
| UPDATE to `care_tasks.frequency_days` on rebind | ❌ DOES NOT EXIST | Not implemented |
| Recalculation of `next_due_at` on rebind | ❌ DOES NOT EXIST | Not implemented |
| `getDaysUntilWatering` reading `next_due_at` (prerequisite) | ❌ DOES NOT EXIST (reads `last_completed_at`) | Known debt — must fix first |

**Runtime readiness verdict:** NOT READY — no code, no stub, no design. Additionally, the `getDaysUntilWatering` fix is a hard prerequisite: rebinding that writes a new `next_due_at` without `getDaysUntilWatering` reading it produces a silent countdown divergence for every rebound plant.

---

**Current Activation State:** UNIMPLEMENTED  
**Activation phase:** B2.2A (concurrent with or after canonical routing activation)

---

**Gating Mechanism**

Gated by **total absence** — no code to uncomment. Activation requires net-new authoring of rebinding logic. Additionally gated by the `getDaysUntilWatering` read-path bug: rebinding is only safe after that fix is deployed.

---

**Activation Dependencies (ordered)**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All canonical routing activation complete (11 deps above) | Mixed | ❌ NOT STARTED |
| 2 | `getDaysUntilWatering` fixed to read `next_due_at` | Code | ❌ NOT FIXED |
| 3 | Rebinding trigger designed (edit-time? background? explicit user action?) | Design | ❌ NOT DESIGNED |
| 4 | `useRebindPlant` hook (or `useUpdatePlant` extension) authored | Code | ❌ NOT IMPLEMENTED |
| 5 | Old vs. new `frequency_days` comparison logic implemented | Code | ❌ NOT IMPLEMENTED |
| 6 | `care_tasks.frequency_days` UPDATE on rebind | Code | ❌ NOT IMPLEMENTED |
| 7 | `care_tasks.next_due_at` recalculation on rebind | Code | ❌ NOT IMPLEMENTED |
| 8 | Rebind trigger wired to edit form or canonical assignment event | Code | ❌ NOT IMPLEMENTED |

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode | Severity |
|---|---|---|
| Rebinding writes new `next_due_at` without `getDaysUntilWatering` fix | UI shows old countdown (from `last_completed_at + old_freq`); DB has new countdown; silent divergence for all rebound plants | HIGH |
| Rebinding fires on every plant edit (not just canonical ID change) | All plants get their `frequency_days` reset on every form submit — edits to name, notes, or room silently reset the care schedule | HIGH — data loss |
| Rebinding fires without confirming the new profile is non-null | Plants with unrecognized species silently get reset to 7-day fallback on every edit | MEDIUM |

---

### 5. Plant Rebinding (Backfill)

**Summary:** A one-time or batch operation that assigns `canonical_species_id` to existing `plants` rows (and `care_tasks` rows) retroactively, based on matching `species_name` to the canonical species catalog. Distinct from per-plant runtime rebinding.

---

**Schema Readiness**

| Required object | Exists in live DB? |
|---|---|
| `plants.canonical_species_id` | ❌ ABSENT (migration unapplied) |
| `care_tasks.canonical_species_id` | ❌ ABSENT (migration unapplied) |
| `canonical_species` with PLANT_XXXX IDs | ❌ ABSENT (table absent) |
| `plant_aliases` for fuzzy matching | ❌ ABSENT (table absent) |

**Schema readiness verdict:** NOT READY.

---

**Runtime Readiness**

| Required object | Exists? |
|---|---|
| Backfill script or migration | ❌ NOT DRAFTED |
| Match logic (which `species_name` maps to which PLANT_XXXX) | ❌ NOT DESIGNED |
| Handling for unmatched `species_name` values | ❌ NOT DESIGNED |
| `care_tasks.frequency_days` update on backfill | ❌ NOT DESIGNED |

**Runtime readiness verdict:** NOT READY — not drafted, not designed.

---

**Current Activation State:** UNIMPLEMENTED  
**Activation phase:** B2.2A (after canonical routing is live and verified)

---

**Gating Mechanism**

Gated by schema absence and total implementation absence. Plant rebinding is a data migration event, not a code activation event — it requires a standalone SQL script or application-layer batch job, neither of which exists.

---

**Activation Dependencies (ordered)**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `supabase-migration-v2.sql` applied | Infrastructure | ❌ UNAPPLIED |
| 2 | `canonical_species` seeded | Data | ❌ EMPTY |
| 3 | `plant_aliases` seeded | Data | ❌ EMPTY |
| 4 | Canonical routing operational and verified | Code | ❌ INACTIVE |
| 5 | Backfill strategy designed (ilike match? alias match? manual review for ambiguous?) | Design | ❌ NOT DESIGNED |
| 6 | Backfill script authored | Code | ❌ NOT DRAFTED |
| 7 | Backfill script tested on staging data | Validation | ❌ NO STAGING ENV |
| 8 | `getDaysUntilWatering` reads `next_due_at` (prerequisite) | Code | ❌ NOT FIXED |
| 9 | `care_tasks.frequency_days` update logic included in backfill | Code | ❌ NOT DESIGNED |

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode | Severity |
|---|---|---|
| Backfill before canonical routing verified | Assigns canonical IDs that the app doesn't know how to use — IDs present but routing inactive | LOW — IDs present, coexistence shim handles it until activation |
| Backfill before `getDaysUntilWatering` fix | Backfill updates `next_due_at` for all plants; UI still reads `last_completed_at + freq`; every plant shows wrong countdown | HIGH — system-wide divergence |
| Backfill with ambiguous match logic | Pothos matched to wrong Pothos variant; incorrect `frequency_days` applied to all existing plants | HIGH — mass care schedule corruption |
| Backfill without `care_tasks.frequency_days` update | Plants get canonical IDs but their care schedules remain at old ilike-derived values | MEDIUM — canonical ID present but not used for scheduling |

---

### 6. Archetype Routing

**Summary:** The public-facing resolution API (`lookupCareProfile`) currently routes to ilike only — a legacy wrapper. Full archetype routing would direct calls to the most appropriate path (collapse → alias → canonical → ilike → default) based on available input and data. The current wrapper structure is a coexistence instrument, not the final routing design.

---

**Schema Readiness**

The ilike archetype is fully schema-live. All other archetypes depend on schema objects that are absent:

| Archetype | Schema-live? |
|---|---|
| ilike (`lookupBySpeciesNameIlike`) | ✅ FULLY LIVE |
| Default fallback | ✅ (no schema requirement) |
| Alias-resolved (`lookupByAlias`) | ❌ `plant_aliases` absent |
| Canonical ID (`lookupByCanonicalId`) | ❌ `plant_care_profiles.canonical_species_id` absent |
| Collapse-normalized | ❌ `collapse_mappings` absent; no SQL definition |

---

**Runtime Readiness**

| Component | State |
|---|---|
| `lookupCareProfile(speciesName)` legacy wrapper | ✅ ACTIVE — routes to ilike only |
| `resolveSpeciesProfile({ species_name, canonical_species_id?, ... })` | ✅ ACTIVE — ilike + fallback slots live; alias + canonical slots commented |
| Full archetype waterfall (collapse → alias → canonical → ilike → default) | ❌ INACTIVE — only the last two stages active |

---

**Current Activation State:** PARTIALLY-WIRED (ilike + default active; all other archetypes runtime-off)  
**Activation phase:** Progressive — each archetype activates at its own phase (B2.2A, B2.2B, B2.3B)

---

**Gating Mechanism**

The `lookupCareProfile` legacy wrapper is the active gating mechanism for legacy call sites. It accepts `speciesName` only and permanently routes to ilike regardless of what data exists in the DB. It is not a comment gate — it is an API design gate. It must be **deprecated or extended** (not uncommented) before full archetype routing is live.

---

**Activation Dependencies**

Archetype routing has no single activation event — it activates progressively:

| Archetype | Phase | Gate type | Prerequisite count |
|---|---|---|---|
| ilike + default | ACTIVE NOW | None | 0 |
| Canonical routing | B2.2A | Triple comment + shim gate | 11 deps |
| Alias routing | B2.2B | Quadruple comment gate | 15 deps |
| Collapse normalization | B2.3B | Total implementation absence | 9 deps |

**The `lookupCareProfile` wrapper must be updated or deprecated at B2.2A** — after Phase 2.2A activates, the wrapper still routes all calls to ilike, bypassing canonical routing even for plants with a known `canonical_species_id`. Post-Phase-2.2A, the wrapper becomes an active regression risk.

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode | Severity |
|---|---|---|
| `lookupCareProfile` updated to pass `canonical_species_id` before shim removed | `canonical_species_id` passed into resolver but stripped by shim before resolver fires; canonical route never activates | LOW — silent non-activation |
| Archetype waterfall ordering wrong (alias before canonical) | Alias lookup calls `lookupByCanonicalId` internally — if canonical slot is inactive, alias lookup always returns null | MEDIUM — alias routing silently falls through |
| Collapse inserted after ilike in waterfall | ilike match shadows collapse normalization for all recognized species | MEDIUM — collapse only activates for unrecognized species |

---

### 7. Seasonal Scheduling

**Summary:** Watering intervals adjust based on the current season. Summer plants water more frequently; winter plants water less. Currently inactive at every layer.

---

**Schema Readiness**

| Required object | Exists in live DB? | In any SQL file? |
|---|---|---|
| `plant_care_profiles.seasonal_watering_adjustment` | ❌ ABSENT | ❌ NOT IN ANY SQL FILE |
| `plant_care_profiles.summer_watering_days` (or equivalent) | ❌ ABSENT | ❌ NOT DEFINED |
| Seasonal frequency columns (any variant) | ❌ ABSENT | ❌ NOT DEFINED |

**Schema readiness verdict:** NOT READY — not only is the column absent from the live DB, it is absent from all SQL files including both pending migrations. No migration path exists for seasonal scheduling. Schema design must precede migration authoring.

---

**Runtime Readiness**

| Required code object | Exists? | State |
|---|---|---|
| `_season` parameter in `generateDefaultCareTasks` | 🟡 YES | Underscore-prefixed — accepted, never used |
| Seasonal routing slots in `resolveSpeciesProfile` | 🟡 YES | COMMENTED OUT |
| `getCurrentSeason()` function | ❌ DOES NOT EXIST | Not implemented |
| Seasonal frequency applied to `frequency_days` | ❌ DOES NOT EXIST | No code |
| `getDaysUntilWatering` reads `next_due_at` (hard prerequisite) | ❌ DOES NOT EXIST | Must fix first |

**Runtime readiness verdict:** NOT READY — `getCurrentSeason()` unimplemented; seasonal data absent; `getDaysUntilWatering` must be fixed first.

---

**Current Activation State:** PARTIALLY-WIRED / COMMENT-GATED  
**Activation phase:** B2.3

---

**Gating Mechanism**

Seasonal scheduling has a **compound gate**:

| Gate | Type | Effect if removed alone |
|---|---|---|
| Seasonal routing slots commented in `resolveSpeciesProfile` | Code comment | Uncomment produces compile without error but seasonal data is absent — returns null, falls through to ilike |
| `_season` parameter never forwarded | Code convention | Even if routing slot uncommented, no season value reaches it |
| `getCurrentSeason()` unimplemented | Total absence | No function to call to determine the current season |
| Seasonal frequency columns absent from all SQL | Schema + no SQL | No data exists to drive seasonal variation |
| `getDaysUntilWatering` reads wrong source | Known debt | Seasonal writes to `next_due_at` diverge from UI countdown silently |

---

**Activation Dependencies (ordered)**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `getDaysUntilWatering` fixed to read `next_due_at` | Code — critical prerequisite | ❌ NOT FIXED — **only dep with no blockers; deploy now** |
| 2 | Seasonal frequency schema designed (column names, data type, null handling) | Design | ❌ NOT DESIGNED |
| 3 | ALTER TABLE adding seasonal frequency columns to `plant_care_profiles` authored | Infrastructure | ❌ NOT AUTHORED |
| 4 | Seasonal frequency migration applied | Infrastructure | ❌ UNAPPLIED |
| 5 | Seasonal frequency data authored for all species | Data | ❌ NOT AUTHORED |
| 6 | `getCurrentSeason()` function implemented (hemisphere-aware?) | Code | ❌ NOT IMPLEMENTED |
| 7 | Seasonal routing slots uncommented | Code | ❌ COMMENTED OUT |
| 8 | `_season` parameter forwarded through `generateDefaultCareTasks` | Code | ❌ PARAM UNUSED |
| 9 | `useWaterPlant` updated to write season-adjusted `next_due_at` | Code | ❌ USES STATIC `frequency_days` |

**Dependency 1 is the only activation-sequencing-independent improvement across the entire PLANTMON activation roadmap.** It can be deployed at any time — before this migration, before dataset seeding, before any other activation event — with zero risk and immediate reduction in HIGH-severity governance debt.

---

**Governance Risks if Prematurely Activated**

| Premature action | Failure mode | Severity |
|---|---|---|
| Seasonal `next_due_at` writer activated before `getDaysUntilWatering` fix | UI reads `last_completed_at + static_freq`; DB has `next_due_at + seasonal_offset`; every plant shows wrong countdown for its entire seasonal adjustment period | CRITICAL — system-wide silent divergence |
| `getCurrentSeason()` not hemisphere-aware | Users in Southern Hemisphere receive inverted seasonal adjustments — watering more in their winter, less in their summer | HIGH — wrong care for all SH users |
| Seasonal adjustment applied to fallback (7-day default) plants | Plants with unrecognized species receive seasonal adjustments on their fallback schedule — amplifying the error | MEDIUM |
| Seasonal columns absent when routing slot fires | Null seasonal adjustment → no change in interval; routing falls through correctly | LOW — safe regression |

---

## ACTIVATION DOCTRINE

### Infrastructure Activation

**Definition:** An event that changes the live Supabase DB schema or data — applying migrations, seeding tables, backfilling columns, creating indexes, modifying RLS policies.

**Authority:** Tier 2 (Supabase operational authority) per `RUNTIME_AUTHORITY_DECLARATION.md`  
**Mechanism:** Manual SQL execution in the Supabase Dashboard SQL Editor  
**Reversibility:** LOW — no automated rollback; all migrations are forward-only  
**Validation method:** Direct DB inspection (`information_schema`, `pg_tables`, `pg_constraint`, SELECT counts)  
**Effect on runtime:** None directly — infrastructure activation does not change any code path

**Why infrastructure activation does not trigger runtime activation:**  
The Supabase JS client is a PostgREST HTTP client. Applying a migration that adds a new table does not cause any application code to query that table. It does not uncomment routing slots. It does not remove the Phase 2.1 shim. The live DB can contain `plant_aliases` with 10,000 rows; the app will never query it until the alias routing slot is uncommented. Infrastructure and runtime activation are independent events governed by different authorities (Tier 2 vs. Tier 4).

**Concrete example:**  
`supabase-migration-v2.sql` applied → `plant_aliases` table created and seeded → zero change in app behavior. First watering after migration: plant creation still uses ilike lookup, still applies 7-day fallback for unrecognized species, still strips `canonical_species_id` from INSERT. Infrastructure activation is necessary but not sufficient for any capability change.

---

### Runtime Activation

**Definition:** A source code change that enables a previously inactive code path — uncommenting routing slots, removing shim strips, wiring parameters to their destinations, adding call sites to currently-inert functions.

**Authority:** Tier 4 (Replit implementation authority), constrained by Tier 3 (coexistence runtime authority) per `RUNTIME_AUTHORITY_DECLARATION.md`  
**Mechanism:** Source code edit deployed via Expo build or OTA update  
**Reversibility:** HIGH — version-controlled; revert is fast  
**Validation method:** App behavior testing; React Query cache inspection; Supabase query log  
**Effect on infrastructure:** None directly — uncommenting a routing slot does not alter the live DB

**Why runtime activation does not guarantee operational activation:**  
Uncommenting the alias routing slot with `plant_aliases` empty produces a code path that executes on every plant creation — but always returns null and falls through to ilike. The system is runtime-active (the code runs) but not operationally active (the code produces no meaningful output). Runtime activation is necessary but not sufficient for any user-visible capability change.

**The critical constraint — runtime activation must not precede its infrastructure prerequisites:**  
Removing the Phase 2.1 shim (runtime activation) before applying `supabase-migration-v2.sql` (infrastructure activation) produces HTTP 400 Bad Request on every plant creation — a complete user-facing outage. This is the highest-risk sequencing violation in the PLANTMON activation roadmap. Unlike most premature activations (which produce harmless no-ops), this one produces an immediate, visible, user-impacting failure.

**Atomic deployment requirement:**  
Shim removal, canonical ID wiring, context method wiring, and care_logs canonical write must all be deployed simultaneously — they are individually incomplete. A deployment that removes the shim but does not wire the canonical ID produces a window where the column exists but is always null. A deployment that wires the context method but does not remove the shim produces a window where the context is computed but stripped before it can be stored. These four code changes form a single indivisible activation unit.

---

### Operational Activation

**Definition:** The state in which an activated code path produces correct, meaningful output for users because infrastructure activation (schema + data), runtime activation (code paths), and data quality (populated tables with accurate content) are all simultaneously satisfied.

**Authority:** Tier 1 (PRD authority) defines when operational activation is expected to occur; Tiers 2, 3, and 4 collectively produce it  
**Observable by:** End users — operational activation is the only activation type that changes what the user sees  
**Reversibility:** LOW for data consequences — care profiles assigned to plants via canonical routing are not automatically reverted if the code is rolled back  
**Validation method:** End-to-end user flow testing; resolution method audit (`SELECT species_resolution_method FROM plants`); care schedule accuracy review

**The three-activation model for alias routing — concrete example:**

```
Infrastructure activation events (Tier 2):
  Event I1: supabase-migration-v2.sql applied
             → plant_aliases table created (empty)
             → plant_care_profiles.canonical_species_id column added (null)
  Event I2: canonical_species seeded with PLANT_0001–PLANT_NNNN
  Event I3: plant_care_profiles.canonical_species_id backfilled
  Event I4: plant_aliases seeded with entries and search_priority values
  Event I5: PRE_DATASET_HARDENING_MIGRATION_v1.sql applied (GIN index)

Runtime activation event (Tier 4, atomic deployment):
  Event R1: lookupByCanonicalId uncommented
             lookupByAlias uncommented
             Canonical routing slot uncommented
             Alias routing slot uncommented
             Phase 2.1 shim removed
             _canonicalSpeciesId wired through generateDefaultCareTasks
             care_logs canonical_species_id write added
             SpeciesResolutionContext.method wired to plants INSERT

Operational activation:
  ← User creates plant with species "monstera" →
    alias lookup: "monstera" → PLANT_0042 (Monstera deliciosa)
    canonical lookup: PLANT_0042 → profile { watering_frequency_days: 10 }
    INSERT plants: { canonical_species_id: "PLANT_0042", species_resolution_method: "alias_lookup" }
    INSERT care_tasks: { frequency_days: 10, canonical_species_id: "PLANT_0042" }
    User sees: "Due in 10 days"
    Resolution audit: species_resolution_method = "alias_lookup" ✓
```

Events I1–I5 can proceed without R1 (harmless — existing plants unaffected; new plants continue using ilike). Event R1 can be deployed without I1–I5 (harmless — alias lookup returns null, falls through to ilike). Operational activation requires all events in the correct order.

---

## COEXISTENCE GUARANTEES

### Why Runtime Remains Stable

The PLANTMON runtime is stable in the pre-migration schema state because of four structurally enforced invariants that cannot be violated by any single-layer change:

**Invariant 1 — The Phase 2.1 shim is unconditional.**  
`usePlants.ts:49–66` strips `user_entered_name`, `canonical_species_id`, `canonical_species_name`, and `species_resolution_method` from every plant creation and edit payload. There is no condition, feature flag, environment variable, or runtime state that bypasses this strip. The shim does not check whether the migration has been applied — it strips unconditionally. This means the INSERT payload always contains exactly the seven columns that exist in the live schema (`id`, `user_id`, `display_name`, `species_name`, `room_location`, `notes`, `created_at`), regardless of what is in the `PlantInput` object.

**Invariant 2 — The double-comment barrier is structurally enforced.**  
The alias and canonical routing functions each have two independent comment barriers: the function body and the call site. Removing the call site comment while the function body is still commented produces a compile error (function not defined). Removing the function body comment while the call site is still commented produces a dead function (never called). Neither single-layer removal produces a runtime change. Both barriers must be removed to create any runtime effect — this requires two deliberate, coordinated edits.

**Invariant 3 — `SELECT *` is forward-compatible in both directions.**  
Pre-migration: `SELECT *` returns the seven v01 columns; Phase 2.1 TypeScript fields are `undefined` (key absent). Post-migration: `SELECT *` returns the eleven Phase 2.1 columns; Phase 2.1 TypeScript fields are `null` (key present, unset). TypeScript's `?: string | null | undefined` typing handles both states. No query change is needed at migration time; no component crashes on either null or undefined.

**Invariant 4 — The `_canonicalSpeciesId` underscore parameter is a dead input.**  
`generateDefaultCareTasks(plantId, speciesName, _canonicalSpeciesId?)` — even if a canonical ID were present in the system and correctly passed through the shim (which it cannot be), the underscore-prefixed parameter is never forwarded to any routing slot, never included in any INSERT, and never referenced in any conditional. The canonical ID cannot influence task generation through any existing code path.

Together, these four invariants guarantee that the runtime is **closed under the current schema state** — no normal app operation can produce a write that includes an absent column, a read that fails on an absent column, or a routing decision that depends on absent data.

---

### Why Scheduler Continuity is Preserved

The scheduler's stability rests on three properties that hold independently of migration state, routing activation state, and seasonal activation state:

**Property 1 — Scheduler reads only from schema-live columns.**  
`getDaysUntilWatering` reads `care_tasks.last_completed_at`, `care_tasks.frequency_days`, `care_tasks.active_status`, and `care_tasks.task_type`. All four columns are present in `supabase-setup.sql` and in the live DB. No scheduler computation touches any Phase 2.1 or Phase 2.2 column. The scheduler is completely isolated from the migration state.

**Property 2 — Fallback guards prevent null-induced crashes.**  
`getDaysUntilWatering` returns `0` (not an error) when `last_completed_at` is null (new plant, never watered), when `frequency_days` is null (orphan task), or when no active watering task exists. `Math.max(0, diff)` prevents negative values. `frequency_days ?? DEFAULT_WATERING_DAYS` in `useWaterPlant` prevents null frequency from propagating to the next task timestamp. Every null state produces a graceful degradation ("Water today") rather than a crash.

**Property 3 — No seasonal activation can silently corrupt the scheduler without the `getDaysUntilWatering` fix.**  
This is a guarantee of the current state, not a guarantee that seasonal activation is safe. Seasonal scheduling cannot activate in the current codebase without both uncommenting the seasonal routing slots (a deliberate code change) and providing seasonal frequency data (a deliberate data migration). Both barriers prevent accidental activation. The high-severity divergence risk (RAD-001) is documented and its fix is available now — but the risk cannot trigger accidentally.

**Known limitation:** The scheduler's `getDaysUntilWatering` write/read divergence is the one scheduler property that requires active remediation before seasonal activation. It is not a coexistence threat today — it becomes one at the moment seasonal scheduling is activated. The fix is independent of all other activation events and can be deployed now.

---

### Why Onboarding Continuity is Preserved

Onboarding continuity — the guarantee that every plant creation attempt either succeeds with a correct record or fails with a visible error — rests on five properties:

**Property 1 — The shim guarantees a schema-valid INSERT on every plant creation.**  
Regardless of how many Phase 2.1 or Phase 2.2 fields are in `PlantInput`, the INSERT payload contains only the seven v01 columns. PostgREST will never receive an unknown column from the onboarding flow. This property holds until the shim is deliberately removed.

**Property 2 — `display_name` validation is the only hard gate.**  
The form requires a non-empty `display_name` — the only field that cannot be null in the live schema. All other fields are optional. The validation mirrors the DB constraint exactly. No valid form submission can produce a DB constraint violation.

**Property 3 — The duplicate task guard prevents double-task creation.**  
`generateDefaultCareTasks` checks for an existing active watering task before inserting. If a task already exists (e.g., from a partially successful previous creation attempt), the guard returns early rather than creating a duplicate. The DB UNIQUE index that would backstop this (from `PRE_DATASET_HARDENING_MIGRATION_v1.sql`) is absent pre-migration, but the application-layer guard provides equivalent protection.

**Property 4 — All inactive routing layers are fail-safe.**  
Every commented-out routing slot has a fallback: alias lookup falls through to ilike; canonical lookup falls through to alias; all paths fall through to the 7-day default. No routing failure (null return, PostgREST error, exception) can propagate as an uncaught error to the user. The `resolveSpeciesProfile` function always returns `{ profile: null | PlantCareProfile, context: { method, resolved } }` — never throws.

**Property 5 — `submitError` surfaces mutations failures.**  
The `new.tsx` and `edit.tsx` screens both display a `submitError` banner when the mutation fails. A PostgREST error, a network failure, or a constraint violation produces a visible user message. Silent failure is not possible through the current error handling path — the failure modes documented in the governance corpus (HTTP 400 on shim removal, PostgREST 404 on missing table) would all surface to the user as a `submitError` banner, not as silent data loss.

**Known limitation:** The fallback's silent nature (three distinct conditions produce identical output with no user notification) is an onboarding quality issue, not a continuity issue. Every plant creation completes successfully; the user simply does not know whether they received a species-matched or fallback-defaulted care profile. This is governance debt, not a stability risk.

---

## ACTIVATION BOUNDARY SUMMARY

| System | Schema-live | Data-live | Runtime-live | Gating mechanism | Earliest activation phase | Premature activation severity |
|---|---|---|---|---|---|---|
| **ilike resolution** | ✅ | ✅ | ✅ | None — fully active | N/A — already operational | N/A |
| **7-day fallback** | ✅ | ✅ | ✅ | None — fully active | N/A — already operational | N/A |
| **Canonical routing** | ❌ | ❌ | ❌ | Triple gate (2 comments + shim) | B2.2A | CRITICAL (shim removal before migration = outage) |
| **Alias routing** | ❌ | ❌ | ❌ | Quadruple gate (2 code + schema + data) | B2.2B | CRITICAL (shim removal before migration = outage) |
| **Scheduler rebinding** | ❌ | ❌ | ❌ | Total absence | B2.2A (after canonical) | HIGH (requires `getDaysUntilWatering` fix first) |
| **Plant backfill** | ❌ | ❌ | ❌ | Schema absence + not drafted | B2.2A (after canonical verified) | HIGH (mass care schedule corruption risk) |
| **Archetype routing (full)** | ❌ (partial) | ❌ (partial) | ❌ (partial) | API design gate (wrapper) | Progressive B2.2A–B2.3B | MEDIUM (wrapper must be updated at B2.2A) |
| **Seasonal scheduling** | ❌ | ❌ | ❌ | Compound gate (comment + unimplemented + no SQL) | B2.3 | CRITICAL (requires `getDaysUntilWatering` fix; without it = system-wide silent divergence) |
| **Collapse normalization** | ❌ | ❌ | ❌ | Total absence (no SQL, no code) | B2.3B | HIGH (wrong confidence threshold = mass misclassification) |

**One action reducesthe highest-severity risk in the entire activation roadmap with zero prerequisites:**  
Fix `getDaysUntilWatering` to read `next_due_at` directly. This single code change, deployable now, eliminates the CRITICAL seasonal scheduling divergence risk and the HIGH scheduler rebinding precondition simultaneously. It is the only improvement in the activation roadmap with no blockers.

---

*This document is a read-only activation boundary registry. No application files, SQL files, runtime behavior, or schema state were modified in its generation. Supersede entries individually as each boundary is crossed; do not delete registry entries — mark them ACTIVATED with an activation date and phase.*
