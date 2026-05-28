# PLANTMON — Operational Baseline Manifest

**Classification:** Governance Baseline Freeze  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Six completed governance audits (project-structure, schema, migration, scheduler, onboarding, runtime-risk)  

This document is the authoritative operational baseline for PLANTMON at the Phase B2.0 boundary. It records the validated current runtime state, architecture topology, and governance posture. It does not describe future state. No code was modified in its generation.

---

## RUNTIME STATE SUMMARY

### Canonical Infrastructure

| Component | Current State |
|---|---|
| `canonical_species` table | Defined in `supabase-setup.sql` and `supabase-migration-v2.sql`; **not applied to live DB** |
| `plant_aliases` table | Defined in both SQL files; **not applied to live DB** |
| `collapse_mappings` table | Defined in both SQL files; **not applied to live DB** |
| `canonical_species_id` column on `plants` | **Does not exist** in live DB; typed in `types/plant.ts` |
| `canonical_species_id` column on `care_tasks` | **Does not exist** in live DB |
| `canonical_species_id` column on `care_logs` | **Does not exist** in live DB |
| `user_entered_name` column on `plants` | **Does not exist** in live DB |
| `canonical_species_name` column on `plants` | **Does not exist** in live DB |
| `species_resolution_method` column on `plants` | **Does not exist** in live DB |
| `plant_care_profiles` table | **Exists** in live DB; approximately 46 rows; no `canonical_species_id` backfill |

**Operational status:** Canonical infrastructure is **entirely absent from the live database**. All canonical columns are typed in TypeScript but stripped by the Phase 2.1 shim before any DB write. No canonical identity is assigned to any plant in the live system.

---

### Canonical Synchronization

**Status: INACTIVE — no synchronization path exists**

There is no mechanism — DB trigger, Supabase Edge Function, background job, scheduled function, React lifecycle hook, or ORM sync — that propagates canonical identity to any table or row. Canonical synchronization has zero active implementation at any runtime layer.

All `canonical_species_id` values across all tables are `NULL` for all plants in the live system. This state is **permanent** until a manual backfill migration is authored and executed, and Phase 2.2 code activation is completed.

---

### Onboarding Substrate

**Status: ACTIVE — legacy ilike path only**

The active onboarding resolution pipeline is:

```
PlantForm → PlantInput (display_name + species_name + user_entered_name*)
  → useCreatePlant (Phase 2.1 shim strips: user_entered_name, canonical_species_id,
                    canonical_species_name, species_resolution_method)
    → Supabase INSERT plants (display_name + species_name only)
      → generateDefaultCareTasks(plantId, species_name)
        → resolveSpeciesProfile({ species_name })
          → lookupBySpeciesNameIlike: SELECT * FROM plant_care_profiles
                                      WHERE species_name ILIKE '%{input}%'
                                      ORDER BY species_name LIMIT 1
          → PlantCareProfile | null
        → INSERT care_tasks (frequency_days from profile, or DEFAULT_WATERING_DAYS = 7)
```

*`user_entered_name` is set equal to `species_name` at form time (identical source state variable) and stripped before DB insert. It is never persisted for any plant in the live system.

**Active resolution methods in live runtime:** `ilike_species_name` (partial match found) or `default_fallback` (no match). Neither `canonical_id_lookup` nor `alias_lookup` can activate — both are double-commented at function body and call site.

**User feedback on resolution:** None. Unrecognized species and recognized species are visually indistinguishable. Silent 7-day default applied when ilike returns null.

---

### Normalization Substrate

**Status: MINIMAL — whitespace trim only**

| Normalization type | Applied? | Where |
|---|---|---|
| Leading/trailing whitespace trim | ✅ ACTIVE | `PlantForm.tsx:56–62`, `careProfiles.ts:50` |
| Case folding (toLowerCase) | ❌ INACTIVE | Not applied at any layer |
| Internal whitespace collapse | ❌ INACTIVE | Double-space inputs preserved verbatim |
| Unicode normalization (NFC/NFD) | ❌ INACTIVE | Not applied |
| Diacritic removal | ❌ INACTIVE | Not applied |
| Collapse mapping normalization | ❌ INACTIVE | Zero code; zero data; table not in live DB |
| Alias normalization | ❌ INACTIVE | `lookupByAlias` commented out at two levels |
| Canonical species name normalization | ❌ INACTIVE | Column absent from live DB |

The live system stores `species_name` values with original mixed case and spacing. ILIKE handles case at query time, but stored values are inconsistently cased across plants.

---

### Care Intelligence Substrate

**Status: ACTIVE — static legacy intervals; no canonical intelligence**

| Feature | Status |
|---|---|
| Watering schedule generation | ✅ ACTIVE — ilike lookup or `DEFAULT_WATERING_DAYS = 7` |
| Fertilizing schedule generation | ✅ ACTIVE — null when no profile; no default |
| `getDaysUntilWatering` countdown | ✅ ACTIVE — reads `last_completed_at + frequency_days`; ignores `next_due_at` |
| `next_due_at` column | ✅ WRITTEN — never read by any UI function |
| Species-appropriate intervals | ✅ ACTIVE — from `plant_care_profiles` when ilike matches |
| Seasonal frequency adjustment | ❌ INACTIVE — all seasonal slots commented out |
| Canonical species-based intervals | ❌ INACTIVE — `canonical_species_id` absent from all tables |
| Schedule update on species edit | ❌ NOT IMPLEMENTED — edit does not regenerate care tasks |
| `SpeciesResolutionContext` logging | ❌ NOT IMPLEMENTED — context discarded at every call site |

---

### Runtime Alias Routing

**Status: INACTIVE — fully written, double-commented**

```
lookupByAlias()  [careProfiles.ts:74–88]    — function body COMMENTED OUT
↓
Routing slot     [careProfiles.ts:107–114]  — call site COMMENTED OUT
```

No alias lookup executes for any plant creation, edit, or care task generation in the live runtime. The `plant_aliases` table does not exist in the live DB. Zero rows of alias data exist anywhere.

**Activation prerequisites:** (1) `supabase-migration-v2.sql` applied, (2) `plant_aliases` seeded with data, (3) `lookupByAlias` function body uncommented, (4) alias routing slot uncommented in `resolveSpeciesProfile`.

---

### Runtime Collapse Routing

**Status: INACTIVE — not implemented at any layer**

No `lookupByCollapseMapping` function exists anywhere in the codebase, even as a commented-out stub. The `collapse_mappings` table is not in the live DB. Zero rows of collapse data exist. No application code queries `collapse_mappings`.

This layer is at an earlier implementation stage than alias routing.

**Activation prerequisites:** (1) `supabase-migration-v2.sql` applied, (2) `collapse_mappings` seeded, (3) lookup function authored from scratch, (4) routing slot added to `resolveSpeciesProfile`.

---

### Scheduler Rebinding

**Status: INACTIVE — no rebinding mechanism exists**

The scheduler is fully pull-based and reactive. No mechanism recalculates care schedules unless a new plant is created via `useCreatePlant`. Specifically:

- No cron job or timer-based rebinding
- No rebinding on app startup
- No rebinding on auth state change
- No rebinding on species edit (`useUpdatePlant` updates the `plants` row only)
- No rebinding on canonical identity assignment (no assignment path active)
- No Supabase DB trigger that modifies `care_tasks` on any event

`care_tasks.frequency_days` is immutable after creation in the current runtime. It can be changed only by a direct DB edit or by a future code path that does not yet exist.

---

### Plant Rebinding

**Status: INACTIVE — not implemented**

"Plant rebinding" — the retroactive update of existing plants' `canonical_species_id`, `care_tasks.frequency_days`, or `next_due_at` to reflect a newly activated canonical identity — has no implementation path. There is no batch update hook, no per-plant rebind trigger, and no UI affordance to trigger it.

All plants added before Phase 2.2 activation will retain `canonical_species_id = NULL` and their original ilike-derived (or default 7-day) schedules until an explicit backfill migration or manual DB update is applied.

---

### Runtime Canonical Routing

**Status: INACTIVE — fully written, double-commented**

```
resolveSpeciesProfile() [careProfiles.ts]
  → canonical_id_lookup slot [lines 98–105]   — COMMENTED OUT
  → alias_lookup slot         [lines 107–114]  — COMMENTED OUT
  → lookupBySpeciesNameIlike  [lines 116–119]  — ✅ ACTIVE
  → default_fallback          [lines 121–128]  — ✅ ACTIVE
```

The `SpeciesResolutionMethod` enum is fully typed for all four states. The `SpeciesResolutionContext` is returned on every call. The context is discarded at every call site — resolution method is never logged, stored, or surfaced.

---

## RUNTIME ARCHITECTURE SUMMARY

### Supabase Operational Role

Supabase serves as the **sole persistent data store and authentication provider** for the PLANTMON mobile app.

| Supabase service | Operational role | Current state |
|---|---|---|
| **Auth** | Session management, JWT issuance, token refresh | ACTIVE — email/password only; `detectSessionInUrl: false`; `autoRefreshToken: true` |
| **PostgREST** | HTTP API layer over PostgreSQL; all data reads and writes | ACTIVE — serving pre-migration schema |
| **RLS** | Row-level security enforcing user data isolation on `plants`, `care_tasks`, `care_logs`, etc. | ACTIVE — ownership policy (`user_id = auth.uid()`) on all user tables |
| **Storage** | Object storage (plant photos) | NOT USED — no plant photo feature exists |
| **Edge Functions** | Server-side logic | NOT USED — no edge functions in project |
| **Realtime** | Live subscription to DB changes | NOT USED — no Supabase Realtime subscriptions |

**Credential state:** Environment variables are swapped (`EXPO_PUBLIC_SUPABASE_URL` holds the anon key; `EXPO_PUBLIC_SUPABASE_ANON_KEY` holds the URL). `lib/supabase.ts:10–11` auto-detects this via `startsWith("https://")` heuristic. The live connection is correct despite the swap.

**Schema state:** The live Supabase DB reflects `supabase-setup.sql` only. `supabase-migration-v2.sql` (Phase 2.1) and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` are unapplied. Three Phase 2.2-era tables (`canonical_species`, `plant_aliases`, `collapse_mappings`) are absent. Five Phase 2.1-era columns on `plants` are absent.

---

### Replit Operational Role

Replit serves as the **development environment, project host, and governance audit repository**. It has no production data role.

| Replit component | Operational role |
|---|---|
| **Expo mobile artifact** (`artifacts/mobile/`) | PLANTMON app source — TypeScript, React Native, Expo Router |
| **API server artifact** (`artifacts/api-server/`) | Express 5 + Drizzle ORM targeting a separate PostgreSQL DB via `DATABASE_URL` — not the Supabase DB |
| **Shared lib** (`lib/db/`) | Drizzle schema definitions for the api-server DB only — no connection to Supabase |
| **Environment secrets** | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SESSION_SECRET` — managed via Replit secrets |
| **Workflow runner** | Manages `pnpm --filter @workspace/mobile run dev` — Expo dev server |
| **Governance audit directory** | `governance-audit/` — all six audit documents reside here, version-controlled in the Replit environment |

**Replit has no write path to the Supabase database.** All schema changes to the live Supabase DB require manual execution via the Supabase Dashboard SQL Editor. No script, migration runner, or CI step applies schema changes automatically.

---

### PRD Governance Role

The PLANTMON Product Requirements Document and governance documentation serve as the **canonical reference for activation sequencing and coexistence contract**.

| Governance document | Role |
|---|---|
| `governance-audit/replit-project-structure.md` | Maps all project directories, files, and their governance ownership |
| `governance-audit/replit-schema-audit.md` | Defines ORM coexistence, enum governance, and column naming authority |
| `governance-audit/replit-migration-audit.md` | Documents all SQL files, application order, and live-state assumptions |
| `governance-audit/replit-scheduler-audit.md` | Maps scheduler computation chain, static intervals, and seasonal infrastructure |
| `governance-audit/replit-onboarding-audit.md` | Maps species resolution pipeline, normalization substrate, and unresolved flows |
| `governance-audit/replit-runtime-risk-audit.md` | Documents 20 numbered runtime risks with pre/post-migration safety classifications |
| **This document** | Operational baseline freeze — validated runtime state at Phase B2.0 |

The governance audit corpus is **read-only reference material** during Phase B2.x. No audit document modifies runtime behavior.

---

### Coexistence Topology

The PLANTMON coexistence topology is the **designed compatibility layer** allowing Phase 2.1 schema columns and Phase 2.2 canonical logic to exist in the codebase before the live DB supports them.

**Four coexistence mechanisms are active:**

**Mechanism 1 — Phase 2.1 insert/update shim** (`hooks/usePlants.ts:49–66, 106–116`)  
Strips `user_entered_name`, `canonical_species_id`, `canonical_species_name`, `species_resolution_method` from all INSERT and UPDATE payloads. Prevents PostgREST `400` errors when columns don't exist in the live DB.

**Mechanism 2 — Forward-compatible SELECT query** (`hooks/usePlants.ts:9`)  
`PLANT_SELECT = "*, care_tasks(*)"` — returns all existing columns. Post-migration, new columns automatically appear as `null` in responses without any query change. Pre-migration, they are absent (`undefined` in JavaScript).

**Mechanism 3 — Double-commented Phase 2.2 slots** (`careProfiles.ts:62–71, 74–88, 98–114`)  
Both the function bodies and their call sites are commented out. No single-layer uncomment can accidentally activate canonical routing.

**Mechanism 4 — `_canonicalSpeciesId` underscore-prefixed parameter** (`careProfiles.ts:192`)  
The `generateDefaultCareTasks` function accepts the canonical ID parameter but marks it as intentionally unused with an underscore prefix. The type system sees the parameter; the runtime ignores it.

**One coexistence gap (unmanaged):**  
The edit form (`PlantForm.tsx:37`) pre-populates the SPECIES field from `initialValues?.species_name`, not `initialValues?.user_entered_name`. Post-Phase-2.2, this would overwrite the preserved raw input on every save. This gap has no coexistence protection.

---

### Activation Boundaries

The following boundaries define what separates the current operational state from each future phase:

**Phase 2.1 activation boundary** — two simultaneous conditions:
1. `supabase-migration-v2.sql` applied to live Supabase DB (Phase 2.1 columns now exist)
2. Phase 2.1 shim removed from `useCreatePlant` and `useUpdatePlant`

These must happen in order and cannot be separated. Early shim removal = `400` errors on all plant creation. Late shim removal = silent data loss on all Phase 2.1 fields.

**Phase 2.2 activation boundary** — seven sequential conditions:
1. Phase 2.1 boundary satisfied
2. `canonical_species` table seeded with PLANT_0001-format IDs
3. `plant_care_profiles.canonical_species_id` backfilled
4. `plant_aliases` table seeded with search-priority-ranked aliases
5. `lookupByAlias` and `lookupByCanonicalId` function bodies uncommented
6. Canonical and alias routing slots uncommented in `resolveSpeciesProfile`
7. `canonical_species_id` forwarded through `generateDefaultCareTasks` to `care_tasks` and `care_logs` inserts

**Seasonal scheduler activation boundary** — three additional code fixes required (independent of Phase 2.2):
1. `getDaysUntilWatering` rewritten to read `next_due_at` directly
2. `care_logs` insert updated to include `canonical_species_id`
3. `getSchemaMigrationStatus()` wired to a Phase 2.2 gate check

---

## CURRENT RUNTIME CHARACTERISTICS

### Scheduler Behavior Model

**Model archetype:** Static-interval, pull-based, creation-time-only

The scheduler computes watering urgency on every render from two fields read from the React Query cache:
- `care_tasks.last_completed_at` — timestamp of most recent watering
- `care_tasks.frequency_days` — integer interval set at creation, immutable in current runtime

**Computation:**
```
getDaysUntilWatering(plant):
  task = plant.care_tasks.find(t => t.task_type === "watering" && t.active_status)
  if (!task?.last_completed_at || !task?.frequency_days) → return 0 ("Water today")
  next = last_completed_at + frequency_days * 86_400_000 ms
  diff = ceil((next - Date.now()) / 86_400_000 ms)
  return max(0, diff)
```

**Hardcoded thresholds:**
- `DEFAULT_WATERING_DAYS = 7` — applied when no care profile found
- `d <= 2` — "due soon" threshold in PlantCard
- `86_400_000` — milliseconds per day (written two different ways across 3 files)

**Known divergence:** `next_due_at` is written to `care_tasks` by `useWaterPlant` but never read by `getDaysUntilWatering`. Both currently produce identical values because the only `next_due_at` writer and the computation use the same source. Any external writer to `next_due_at` would create a silent discrepancy.

**Fertilizing:** Scheduled from the same `plant_care_profiles` lookup. Returns `null` (not 7) when no profile found — no default fertilizing schedule applied to unmatched plants.

---

### Onboarding Resolution Model

**Model archetype:** Free-text capture, single-pass ilike, silent default fallback

```
Input capture:   PlantForm — two TextInput fields (display_name required, species_name optional)
Input storage:   display_name → plants.display_name (persisted)
                 species_name → plants.species_name (persisted, nullable)
                 user_entered_name → DISCARDED (shim strips before insert)
Resolution:      ilike substring match on plant_care_profiles.species_name
                 → one result (alphabetical first), or null
Fallback:        DEFAULT_WATERING_DAYS = 7 (silent)
User feedback:   NONE — no recognition confirmation, no "did you mean", no autocomplete
```

**Identity states at onboarding exit (current runtime):**
- `plants.display_name` — always set (required)
- `plants.species_name` — set if user typed a species (nullable, mixed case)
- `plants.user_entered_name` — always NULL (shim active)
- `plants.canonical_species_id` — always NULL (column absent from live DB)
- `plants.canonical_species_name` — always NULL (column absent from live DB)
- `plants.species_resolution_method` — always NULL (column absent from live DB)

Every plant in the live system exits onboarding with `getPlantIdentityStatus() = "display_name_only"` or `"species_known"`. No plant can reach `"canonical"` in the current runtime.

---

### Canonical Propagation Status

**Status: ZERO — nothing to propagate, no propagation mechanism**

| Layer | canonical_species_id value | Can change without code activation? |
|---|---|---|
| `plants` | NULL (column absent) | NO |
| `care_tasks` | NULL (column absent) | NO |
| `care_logs` | NULL (column absent) | NO |
| `plant_care_profiles` | NULL for all rows (not backfilled) | NO |
| `plant_aliases` | N/A (table absent) | NO |
| `canonical_species` | N/A (table absent) | NO |

No canonical_species_id value is non-null anywhere in the live Supabase DB. No runtime mechanism can change this without code activation and migration execution.

---

### Migration Governance Maturity

**Current maturity level: STRUCTURED PENDING**

| Migration file | Status | DB impact |
|---|---|---|
| `supabase-setup.sql` | Applied (initial setup) | All base tables, RLS, functions, trigger |
| `supabase-migration-v2.sql` | **PENDING** | Phase 2.1 columns, 3 new tables, enum expansion, CHECK constraint recreation |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | **PENDING** | UNIQUE partial index, GIN trigram index, RLS recreation |

**Pre-application verification requirements for `supabase-migration-v2.sql`:**
- Run CHECK constraint name detection query (to avoid duplicate constraints on `plant_care_profiles`)
- Confirm PostgREST schema cache reloads before shim removal
- Confirm no active app sessions are mid-insert when column addition runs

**Migration lineage gap:** No migration history table exists in the live DB. No `schema_migrations` or equivalent tracking table was created in `supabase-setup.sql`. Applied/unapplied state is determined by manual inspection only.

---

### Runtime Isolation Behavior

The PLANTMON runtime maintains strict isolation between:

**User data isolation:** RLS policies enforce `user_id = auth.uid()` on `plants`, `care_tasks`, `care_logs`, `journal_entries`, `health_logs`. No cross-user data access is possible via the PostgREST API regardless of query construction.

**Species data isolation:** `plant_care_profiles` and (future) `canonical_species`, `plant_aliases` are read-only for authenticated users via explicit `SELECT` policies. No user can modify species reference data.

**Schema isolation:** The Expo mobile artifact and the Express api-server artifact target different databases (`EXPO_PUBLIC_SUPABASE_URL` vs `DATABASE_URL`). No Drizzle ORM operation affects the Supabase DB. No Supabase client operation affects the api-server DB.

**Phase isolation:** Phase 2.2 code paths are isolated from the active runtime by double-commenting at both the function body and call site level. No runtime event, environment variable, or configuration value can activate them.

---

## GOVERNANCE-VALIDATED FINDINGS

### Coexistence Stability

**Finding: STABLE — coexistence topology is correctly implemented**

The Phase 2.1 coexistence design functions as documented. The four active coexistence mechanisms (shim, `SELECT *`, double-commented slots, underscore-prefixed parameter) collectively ensure:

1. The live DB operates at the `supabase-setup.sql` schema level with no errors
2. TypeScript types for Phase 2.1 columns are valid and compile correctly
3. Phase 2.2 code exists and is syntactically valid but cannot execute
4. Plant creation, editing, watering, and deletion all function correctly
5. Care task generation and countdown computation function correctly

No coexistence mechanism is in conflict with any other. No mechanism produces a runtime error in the current schema state.

**One known coexistence gap:** The edit form `user_entered_name` overwrite risk (identified in onboarding audit §9, Flow 4) is a future-state concern only — it has no runtime impact while the shim is active and Phase 2.2 is inactive.

---

### Lack of Hidden Runtime Activation

**Finding: CONFIRMED — no hidden activations exist**

A comprehensive search across all runtime code confirms:

| Potential hidden activation | Present? | Evidence |
|---|---|---|
| Feature flags that could enable canonical routing | ❌ NONE | No `process.env` conditional guards any Phase 2.2 slot |
| Dynamic imports that could load Phase 2.2 code | ❌ NONE | No dynamic `import()` calls in any scheduler or resolution file |
| Supabase DB triggers that modify app behavior | ❌ NONE | Only trigger is `update_updated_at` on `plants` |
| `useEffect` hooks that activate on specific data states | ❌ NONE | Auth `useEffect` only sets React state; no data-conditional side effects |
| Background timers or intervals | ❌ NONE | No `setInterval` or `setTimeout` in any app file |
| React Query `onSuccess` callbacks triggering secondary mutations | ❌ NONE | All `onSuccess` callbacks call only `invalidateQueries` (reads) |
| Startup SQL execution | ❌ NONE | Startup sequence is font load → session check → routing only |
| `getSchemaMigrationStatus()` call that gates behavior | ❌ NONE | Zero call sites — function is compiled but inert |

The live runtime is exactly what the source code describes with all Phase 2.2 slots commented out.

---

### Scheduler Safety

**Finding: SAFE with one documented pre-seasonal-activation risk**

The scheduler is safe in its current static-interval form. All operations are:
- Idempotent (re-rendering always produces the same countdown)
- Non-destructive (scheduler reads never mutate DB state)
- Deterministic (same inputs always produce same `getDaysUntilWatering` output)
- Isolated (one user's schedule cannot affect another's)

**One pre-activation risk documented and unmanaged:**  
`getDaysUntilWatering` reads `last_completed_at + frequency_days` instead of `next_due_at`. This is safe while the only `next_due_at` writer is `useWaterPlant` (which produces the same value). It becomes a silent data discrepancy if any seasonal, admin, or external system writes a different `next_due_at`. This risk **must be resolved before seasonal scheduler activation**.

**All other scheduler risks are managed:**
- Duplicate task guard + DB UNIQUE partial index (post-hardening migration) — defense-in-depth
- `DEFAULT_WATERING_DAYS = 7` fallback — explicit, documented, intentional
- No fertilizing default — intentional (null signals "no profile")
- Orphan task risk — documented edge case; low occurrence probability

---

### Operational Archetype Compatibility

**Finding: COMPATIBLE — current operational archetype is internally consistent**

The current PLANTMON runtime operates as a **"display-name-primary, species-optional, static-interval, user-isolated plant tracker."** All components are compatible with this archetype:

| Component | Compatibility with current archetype |
|---|---|
| `PlantForm` — display_name required, species optional | ✅ Matches |
| `getDaysUntilWatering` — static interval computation | ✅ Matches |
| `resolveSpeciesProfile` — ilike or default | ✅ Matches |
| `useWaterPlant` — single-user, single-plant mutation | ✅ Matches |
| RLS policies — user_id isolation | ✅ Matches |
| React Query `staleTime: 30_000` — eventual consistency | ✅ Acceptable for single-user offline-capable app |
| No `detectSessionInUrl` — email/password only | ✅ Matches |

No component is designed for the canonical archetype ("canonical-species-primary, multi-alias-resolved, seasonally-adjusted") and accidentally activated in the current runtime. All canonical components are correctly inactive.

---

### Representative Canonical Anchoring Validation

**Finding: ANCHORING INFRASTRUCTURE PRESENT — data absent**

The canonical anchoring infrastructure (the structural connection between a plant record and a canonical species identity) is correctly designed but has zero live data:

| Anchor component | Design state | Data state |
|---|---|---|
| `PlantIdentityStatus` type (`"canonical"` \| `"species_known"` \| `"display_name_only"`) | ✅ Typed | N/A (type only) |
| `getPlantIdentityStatus()` function | ✅ Implemented | Never called |
| `isCanonicallyResolved()` function | ✅ Implemented | Never called |
| `summarizeIdentityStatus()` function | ✅ Implemented | Never called |
| `SpeciesResolutionMethod` enum (4 values) | ✅ Typed | Only 2 values (`ilike`, `default_fallback`) ever reached |
| `SpeciesResolutionContext` struct | ✅ Returned on all calls | Always discarded |
| `PLANT_0001` ID format for `canonical_species` | ✅ Documented in types | No rows exist |

All representative canonical anchoring functions are callable (no import errors, no type errors) but produce results that are never consumed by any call site. The infrastructure is anchor-ready; the anchors have no data.

---

## CURRENT GOVERNANCE RISKS

### Migration Lineage Immaturity

**Risk level: HIGH**

| Sub-risk | Detail |
|---|---|
| No migration history table | No `schema_migrations` table tracks applied migrations. Applied/unapplied state is determined by manual schema inspection or by running `getSchemaMigrationStatus()` (never called). |
| Two migrations pending simultaneously | `supabase-migration-v2.sql` and `PRE_DATASET_HARDENING_MIGRATION_v1.sql` are both unapplied. Their application order matters (hardening migration adds a UNIQUE index that `v2.sql` does not reference — order is independent; but both must be applied before dataset seeding). |
| CHECK constraint name assumption | `supabase-migration-v2.sql` §B7 assumes the PostgreSQL-generated name `plant_care_profiles_light_requirement_check`. If the live DB has a different auto-generated name, the `DROP CONSTRAINT IF EXISTS` silently does nothing and a duplicate constraint is added. Detection query documented in `governance-audit/replit-runtime-risk-audit.md §10.4`. |
| RLS policy name assumption | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` §D assumes policy names from `supabase-setup.sql`. Dashboard-created policies may have different names. Detection query documented in `governance-audit/replit-runtime-risk-audit.md §10.3`. |
| No transactional guard on plant + task creation | `useCreatePlant` performs two sequential Supabase operations. A failure between them leaves a plant row with no care tasks. No rollback is possible. |

**Mitigation required:** Run detection queries before each migration. Author a `schema_migrations` tracking table. Wrap plant + task creation in a Supabase RPC transaction when possible.

---

### Scheduler Computation Drift

**Risk level: HIGH (pre-seasonal-activation)**

The gap between `next_due_at` (written) and `getDaysUntilWatering` (computed from a different formula) is a time bomb that activates the moment any system writes `next_due_at` with a different value than `last_completed_at + frequency_days * ms`.

Current state: Both values are always identical → gap is latent, not active.  
Seasonal activation state: Seasonal scheduler writes a different `next_due_at` → UI shows wrong countdown silently.

**The risk is not hypothetical — it is a guaranteed failure mode** if seasonal scheduling activates without first fixing `getDaysUntilWatering` to read `next_due_at`.

**Mitigation required:** Rewrite `getDaysUntilWatering` to read `care_tasks.next_due_at` directly, with a fallback to `last_completed_at + frequency_days` when `next_due_at` is null. This must be done before any seasonal scheduler or admin tool that writes `next_due_at` is activated.

---

### Onboarding Fallback Debt

**Risk level: MEDIUM**

The current onboarding resolution pipeline has five categories of accumulated fallback debt:

| Debt item | Nature | User-visible impact |
|---|---|---|
| Silent default on unrecognized species | No user feedback | User cannot distinguish "recognized: 7-day species" from "unrecognized: 7-day default" |
| `user_entered_name` never persisted | Phase 2.1 shim blocks all writes | Raw species input permanently unrecoverable for all pre-2.2 plants |
| `SpeciesResolutionContext` always discarded | No logging, no storage | Cannot audit which resolution path was used for any plant |
| `care_logs.canonical_species_id` never set | Code-level gap, not migration-level | All watering history permanently lacks species identity linkage |
| No autocomplete or species validation | MVP scope decision | Users receive no feedback on recognition success during entry |

**Mitigation required:** Items 1, 5 require UI changes. Items 2, 3 require Phase 2.2 activation + shim removal. Item 4 requires a one-line code fix to `useWaterPlant` (add `canonical_species_id` to `care_logs` INSERT) — this is the only debt item with a trivial fix and no migration dependency.

---

### Replit / Supabase Divergence

**Risk level: MEDIUM (managed at source; unmanaged at live-state detection)**

Three categories of Replit/Supabase divergence exist:

**Category 1 — Schema divergence (known, intentional):**  
Replit source files (`supabase-setup.sql` + `supabase-migration-v2.sql`) define the target schema. The live Supabase DB reflects only `supabase-setup.sql`. This divergence is the designed pre-migration state. The risk is that this divergence is tracked only by human memory and this governance document — not by any automated mechanism.

**Category 2 — Credential swap divergence (known, managed):**  
The env var swap (`EXPO_PUBLIC_SUPABASE_URL` ↔ `EXPO_PUBLIC_SUPABASE_ANON_KEY`) is correctly handled by `lib/supabase.ts:10–11`. Risk: any future developer who reads the env var names literally (not through `lib/supabase.ts`) will use the wrong values.

**Category 3 — TypeScript type divergence (known, managed by shim):**  
Phase 2.1 TypeScript types declare columns that do not exist in the live DB. The shim prevents runtime errors. Risk: the shim's scope is fixed at four fields — any additional Phase 2.1 fields added to TypeScript types without updating the shim will cause `400` errors on plant creation.

**Mitigation required:** Author a `schema_migrations` table; run `getSchemaMigrationStatus()` at app startup and log the result; document the credential swap in `replit.md` user preferences (not just agent memory).

---

## BASELINE VALIDATION SIGNATURE

| Audit domain | Document | Validated? |
|---|---|---|
| Project structure | `governance-audit/replit-project-structure.md` | ✅ |
| Schema governance | `governance-audit/replit-schema-audit.md` | ✅ |
| Migration lineage | `governance-audit/replit-migration-audit.md` | ✅ |
| Scheduler governance | `governance-audit/replit-scheduler-audit.md` | ✅ |
| Onboarding governance | `governance-audit/replit-onboarding-audit.md` | ✅ |
| Runtime risk | `governance-audit/replit-runtime-risk-audit.md` | ✅ |
| **Operational baseline** | **This document** | ✅ |

**Validated operational state:** PLANTMON Phase B2.0 — legacy ilike runtime, Phase 2.1 shim active, all canonical infrastructure absent from live DB, all Phase 2.2 slots double-commented, scheduler static-interval pull-based, zero hidden activations.

**Next governance action:** Phase B2.1 — dataset seeding into `plant_care_profiles`. No code changes required for this phase. No migration changes required for this phase (ilike lookup already active against `plant_care_profiles`).

---

*This document is a read-only operational baseline freeze. No application files were modified in its generation. Supersede only by issuing a new dated baseline after a documented activation event.*
