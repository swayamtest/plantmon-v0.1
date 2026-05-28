# PLANTMON — Coexistence State Freeze

**Classification:** Governance Baseline Freeze  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus (6 audits) + `OPERATIONAL_BASELINE_MANIFEST.md` + `MIGRATION_EXECUTION_LEDGER.md`  

This document records the validated coexistence runtime state at the Phase B2.0 boundary. Coexistence is the design contract that allows Phase 2.2 canonical infrastructure to exist in the codebase and TypeScript types while the live Supabase DB runs at the `supabase-setup.sql` schema level. No code was modified in its generation.

---

## COEXISTENCE ARCHITECTURE

### Coexistence-Safe Canonical Infrastructure

The canonical infrastructure is written into the codebase at three layers — types, logic, and SQL — but is structurally isolated from the active runtime at each layer. The isolation is verified and confirmed safe.

**Layer 1 — TypeScript type declarations (present, non-executing)**

| Type / Interface | File | Coexistence safety mechanism |
|---|---|---|
| `Plant.canonical_species_id?: string \| null` | `types/plant.ts` | Optional field — absent from PostgREST response pre-migration; no runtime error |
| `Plant.user_entered_name?: string \| null` | `types/plant.ts` | Optional field — stripped by shim before any write |
| `Plant.canonical_species_name?: string \| null` | `types/plant.ts` | Optional field — never written, never read in active paths |
| `Plant.species_resolution_method?: SpeciesResolutionMethod \| null` | `types/plant.ts` | Optional field — stripped by shim; `SpeciesResolutionContext` discarded at every call site |
| `PlantInput.canonical_species_id?: string` | `types/plant.ts` | Typed but never populated by form; stripped by shim |
| `PlantInput.user_entered_name?: string` | `types/plant.ts` | Populated at form (identical to `species_name`); stripped by shim |
| `PlantIdentityStatus` union type | `types/canonical.ts` | Compile-time type only; `getPlantIdentityStatus()` has zero call sites |
| `CollapseMapping` interface | `types/canonical.ts` | Compile-time type only; no runtime code references it |
| `CareTaskStatus` enum | `types/canonical.ts` | Forward declaration only; no DB column exists; never used in active code |
| `SpeciesResolutionMethod` union | `careProfiles.ts` | Typed for 4 states; only 2 (`ilike_species_name`, `default_fallback`) are ever reached |
| `SpeciesResolutionContext` struct | `careProfiles.ts` | Returned on every call; discarded at every call site |
| `SpeciesResolutionInput.canonical_species_id?` | `careProfiles.ts` | Accepted by `resolveSpeciesProfile`; no routing slot uses it |

**Layer 2 — Application logic (written, commented out)**

| Logic component | File | Location | Coexistence isolation |
|---|---|---|---|
| `lookupByCanonicalId()` | `careProfiles.ts` | Lines 62–71 | Function body commented out |
| `lookupByAlias()` | `careProfiles.ts` | Lines 74–88 | Function body commented out |
| Canonical routing slot | `careProfiles.ts` | Lines 98–105 | Call site commented out |
| Alias routing slot | `careProfiles.ts` | Lines 107–114 | Call site commented out |
| `_canonicalSpeciesId` parameter | `careProfiles.ts` | Line 192 | Underscore-prefixed — typed, accepted, never used |
| `canonical_species_id` forward to task INSERT | `careProfiles.ts` | Lines 205–209 | Commented out |
| All 10 functions in `runtimeValidation.ts` | `runtimeValidation.ts` | Full file | Zero import statements anywhere in the app |
| Seasonal routing slots | `careProfiles.ts` | Multiple | All commented out |

**Layer 3 — SQL files (written, unapplied)**

| SQL object | File | Coexistence isolation |
|---|---|---|
| `canonical_species` table | `supabase-migration-v2.sql §A1` | File unapplied — table absent from live DB |
| `plant_aliases` table | `supabase-migration-v2.sql §A2` | File unapplied — table absent from live DB |
| `collapse_mappings` table | `supabase-migration-v2.sql §A3` | File unapplied — table absent from live DB |
| Phase 2.1 columns on `plants` | `supabase-migration-v2.sql §B1–B4` | File unapplied — columns absent from live DB |
| `canonical_species_id` on `care_tasks` | `supabase-migration-v2.sql §B5` | File unapplied — column absent |
| `canonical_species_id` on `care_logs` | `supabase-migration-v2.sql §B6` | File unapplied — column absent |
| `canonical_species_id` on `plant_care_profiles` | `supabase-migration-v2.sql §B8` | File unapplied — column absent |
| UNIQUE partial index on `care_tasks` | `PRE_DATASET_HARDENING_MIGRATION_v1.sql §A` | File unapplied — index absent |
| GIN trigram index on `plant_aliases.alias_name` | `PRE_DATASET_HARDENING_MIGRATION_v1.sql §C` | File unapplied — index absent |

**Isolation guarantee:** No canonical infrastructure object at any of the three layers can execute, activate, or produce a runtime effect without a simultaneous source code edit (to uncomment logic) AND a manual SQL execution (to apply the migration). Neither condition is met in the current state.

---

### Coexistence-Safe Onboarding Behavior

The onboarding pipeline is safe under the current schema state because it writes only the fields that exist in the live DB.

**Active onboarding write path (confirmed safe):**

```
PlantForm.handleSubmit() →
  PlantInput {
    display_name: displayName.trim(),            // ← written to DB ✅
    species_name: speciesName.trim() || undef,   // ← written to DB ✅
    user_entered_name: speciesName.trim() || undef, // ← STRIPPED by shim ✅
    room_location: ...,                          // ← written to DB ✅
    notes: ...,                                  // ← written to DB ✅
    // canonical_species_id: undefined           // ← never populated; STRIPPED by shim ✅
    // canonical_species_name: undefined         // ← never populated; STRIPPED by shim ✅
    // species_resolution_method: undefined      // ← never populated; STRIPPED by shim ✅
  }
→ useCreatePlant.mutationFn →
  Phase 2.1 shim (usePlants.ts:49–66) →
    v01Fields = { display_name, species_name, room_location, notes }
    supabase.from("plants").insert({ ...v01Fields, user_id: user.id })
    // Only fields that exist in the live DB are sent to PostgREST ✅
```

**Coexistence property:** The shim guarantees that the PostgREST INSERT payload contains **exactly** the columns that exist in the live schema, neither more nor fewer. Adding or removing a field from `PlantInput` has zero effect on the actual DB write as long as the shim covers it.

**Coexistence property — identical behavior for edit path:** `useUpdatePlant` applies the same shim pattern (lines 106–116), stripping the same four fields from every UPDATE payload. Onboarding and editing both write only schema-safe fields.

---

### Coexistence-Safe Scheduler Behavior

The scheduler operates entirely within the pre-migration schema state. It reads only columns that exist in the live DB and writes only columns that exist in the live DB.

**Active scheduler read path (confirmed safe):**

| Column read | Table | Exists in live DB? |
|---|---|---|
| `task_type` | `care_tasks` | ✅ YES |
| `active_status` | `care_tasks` | ✅ YES |
| `last_completed_at` | `care_tasks` | ✅ YES |
| `frequency_days` | `care_tasks` | ✅ YES |
| `next_due_at` | `care_tasks` | ✅ YES — written but never read by UI computation |
| `species_name` | `plants` | ✅ YES |
| `species_name` | `plant_care_profiles` | ✅ YES |

**Active scheduler write path (confirmed safe):**

| Mutation | Columns written | All exist in live DB? |
|---|---|---|
| `generateDefaultCareTasks` INSERT to `care_tasks` | `plant_id`, `task_type`, `frequency_days`, `next_due_at`, `active_status` | ✅ YES |
| `useWaterPlant` UPDATE to `care_tasks` | `last_completed_at`, `next_due_at` | ✅ YES |
| `useWaterPlant` INSERT to `care_logs` | `plant_id`, `task_type`, `completed_at` | ✅ YES |

**Coexistence property:** No scheduler path reads or writes `canonical_species_id`. The scheduler is fully decoupled from the canonical identity system at the DB layer. Scheduler operations cannot fail due to absent canonical columns.

**Coexistence property — `_canonicalSpeciesId` parameter isolation:** `generateDefaultCareTasks(plantId, speciesName, _canonicalSpeciesId?)` accepts but never uses the canonical ID parameter. Even if a caller passes a `canonical_species_id` value, the task INSERT ignores it. The scheduler produces schema-safe output regardless of what canonical data is passed.

---

### Coexistence-Safe Nullability

Every Phase 2.1 and Phase 2.2 field in the TypeScript model is declared as optional (`?`) or nullable (`| null`). This ensures that:

1. Pre-migration: PostgREST returns `undefined` for absent columns — TypeScript optional typing accepts this without error
2. Post-migration: PostgREST returns `null` for present-but-unset columns — TypeScript nullable typing accepts this without error
3. No runtime code performs a non-null assertion (`!`) on any Phase 2.1 field — confirmed by inspection

**Nullability posture by field:**

| Field | TypeScript type | Pre-migration PostgREST value | Post-migration default |
|---|---|---|---|
| `Plant.canonical_species_id` | `string \| null \| undefined` | `undefined` (key absent) | `null` (unset) |
| `Plant.user_entered_name` | `string \| null \| undefined` | `undefined` (key absent) | `null` (unset, shim strips writes) |
| `Plant.canonical_species_name` | `string \| null \| undefined` | `undefined` (key absent) | `null` (unset) |
| `Plant.species_resolution_method` | `SpeciesResolutionMethod \| null \| undefined` | `undefined` (key absent) | `null` (unset) |
| `CareTask.canonical_species_id` | `string \| null \| undefined` | `undefined` (key absent) | `null` (unset) |

**Coexistence property:** The TypeScript type system correctly represents both pre- and post-migration states using the same field declarations. No type change is required at Phase 2.1 migration time. The code compiles and type-checks correctly in both schema states.

---

## EXPLICITLY INACTIVE RUNTIME SYSTEMS

Each system below is confirmed OFF. The mechanism of its inactivation is documented. The conditions required to activate it are stated.

---

### Alias Routing

**State: OFF — double-commented at two independent levels**

```
Level 1 — function body:
  // async function lookupByAlias(aliasName: string) {  [careProfiles.ts:74]
  //   const { data: alias } = await supabase            [careProfiles.ts:76]
  //     .from("plant_aliases")                          [careProfiles.ts:77]
  //     ...
  // }                                                   [careProfiles.ts:88]

Level 2 — call site:
  // if (input.species_name?.trim()) {                   [careProfiles.ts:107]
  //   const profile = await lookupByAlias(...)          [careProfiles.ts:109]
  //   if (profile) return { ... }                       [careProfiles.ts:110]
  // }                                                   [careProfiles.ts:112]
```

**Why double-commenting matters:** Uncommenting Level 1 alone (the function body) does not activate alias routing — the function exists but is never called. Uncommenting Level 2 alone (the call site) produces a compile error — `lookupByAlias` is not defined. Both levels must be uncommented together, and even then, alias routing returns null for all inputs until `plant_aliases` is seeded.

**What alias routing would do when active:** Query `plant_aliases` WHERE `alias_name ILIKE aliasName.trim()` (exact case-insensitive, no wildcards), ORDER BY `search_priority DESC`, LIMIT 1. On match: extract `canonical_species_id` → call `lookupByCanonicalId(id)` → return profile with `context.method = "alias_lookup"`.

**Prerequisites to activate:**
1. `supabase-migration-v2.sql` applied (`plant_aliases` table exists)
2. `plant_aliases` seeded with alias rows and `search_priority` values
3. `plant_care_profiles.canonical_species_id` backfilled
4. `lookupByAlias` function body uncommented (`careProfiles.ts:74–88`)
5. Alias routing slot uncommented (`careProfiles.ts:107–114`)

---

### Collapse Routing

**State: OFF — no code exists at any layer**

Unlike alias routing (which has a written, commented-out function), collapse routing has:
- No lookup function (not even a stub or commented-out skeleton)
- No routing slot in `resolveSpeciesProfile`
- No call site anywhere
- No `collapse_mappings` table in the live DB
- No rows of collapse data anywhere

**What collapse routing would do when active:** Query `collapse_mappings` WHERE `collapsed_species_name` matches the user input, retrieve `canonical_species_id` and confidence scores, route to the canonical care profile. The `CollapseMapping` TypeScript interface defines the data shape but has no application code that queries it.

**Prerequisites to activate:**
1. `supabase-migration-v2.sql` applied (`collapse_mappings` table exists)
2. `collapse_mappings` seeded with operational similarity and confidence scores
3. `lookupByCollapseMapping()` function authored from scratch
4. Collapse routing slot added to `resolveSpeciesProfile`

Collapse routing requires more implementation work than any other currently inactive system — it is the least mature layer.

---

### Canonical Routing

**State: OFF — double-commented at two independent levels**

```
Level 1 — function body:
  // async function lookupByCanonicalId(id: string) {   [careProfiles.ts:62]
  //   const { data } = await supabase                  [careProfiles.ts:64]
  //     .from("plant_care_profiles")                   [careProfiles.ts:65]
  //     .select("*")
  //     .eq("canonical_species_id", id)
  //     .maybeSingle();
  //   return (data as PlantCareProfile | null) ?? null;
  // }                                                   [careProfiles.ts:71]

Level 2 — call site:
  // if (input.canonical_species_id) {                  [careProfiles.ts:98]
  //   const profile = await lookupByCanonicalId(...)   [careProfiles.ts:100]
  //   if (profile) return { ... }                       [careProfiles.ts:101]
  // }                                                   [careProfiles.ts:103]
```

**Why canonical routing has the strictest prerequisites:** Even with both levels uncommented and the migration applied, canonical routing returns null for every plant until:
- `canonical_species` is seeded (so canonical IDs exist)
- `plant_care_profiles.canonical_species_id` is backfilled (so the FK join resolves)
- `plants.canonical_species_id` is populated for at least one plant (so `input.canonical_species_id` is non-null)

Canonical routing activation requires dataset seeding AND onboarding pipeline activation AND plant backfill — all before it produces any non-null result.

**Prerequisites to activate:**
1. `supabase-migration-v2.sql` applied
2. `canonical_species` seeded with PLANT_0001-format IDs
3. `plant_care_profiles.canonical_species_id` backfilled
4. At least one `plants.canonical_species_id` populated (via Phase 2.2 onboarding or backfill)
5. `lookupByCanonicalId` function body uncommented (`careProfiles.ts:62–71`)
6. Canonical routing slot uncommented (`careProfiles.ts:98–105`)

---

### Scheduler Rebinding

**State: OFF — no mechanism exists**

There is no scheduler rebinding at any layer:

| Potential rebinding trigger | Present? | Notes |
|---|---|---|
| App startup hook | ❌ NO | `_layout.tsx` — font load, session check, routing only |
| `useEffect` on plant data change | ❌ NO | No `useEffect` in any component triggers task regeneration |
| `onAuthStateChange` handler | ❌ NO | Sets React state only; no Supabase writes |
| Background timer (`setInterval`) | ❌ NO | Not present in any file |
| React Query `onSuccess` callback | ❌ NO | Only calls `invalidateQueries` (read trigger) |
| Supabase DB trigger | ❌ NO | Only `update_updated_at` trigger exists |
| `useUpdatePlant` | ❌ NO | Updates `plants` row only; no task regeneration |

**What "scheduler rebinding" would mean when active:** On species name change during plant edit, the system would call `resolveSpeciesProfile` with the new species name, compare the resulting `frequency_days` to the existing active care task, and update `care_tasks.frequency_days` and `next_due_at` if different. This behavior does not exist in any commented-out form — it is a future feature with no implementation skeleton.

**Prerequisites to activate:** Requires new code in `useUpdatePlant` — no existing commented-out code to uncomment.

---

### Canonical Propagation

**State: OFF — no mechanism exists**

There is no automatic propagation of `canonical_species_id` to any table:

| Propagation target | Automatic propagation mechanism | Present? |
|---|---|---|
| `plants.canonical_species_id` | Any write path | ❌ NO |
| `care_tasks.canonical_species_id` | Task generation | ❌ NO (field not in INSERT) |
| `care_logs.canonical_species_id` | Watering mutation | ❌ NO (field not in INSERT) |
| `plant_care_profiles.canonical_species_id` | Any write path | ❌ NO |

Every `canonical_species_id` value on every table is `NULL` (or `undefined` pre-migration) for every row in the live system. This state is permanent until:
1. Migration adds the columns (Phase 2.1)
2. Onboarding pipeline is upgraded to resolve and write `canonical_species_id` (Phase 2.2)
3. A backfill migration assigns `canonical_species_id` to existing plants and their care history (Phase 2.2 backfill)

No automated propagation mechanism of any kind will be triggered by the migration application itself.

---

### Archetype Runtime Routing

**State: OFF — all routing slots commented out; `lookupCareProfile` wrapper active for legacy path only**

The `lookupCareProfile` function (the public API of the resolution layer) is a backward-compatibility wrapper that routes all inputs to the legacy ilike path:

```typescript
// careProfiles.ts — lookupCareProfile (active wrapper)
export async function lookupCareProfile(
  speciesName: string | null | undefined,
): Promise<PlantCareProfile | null> {
  const { profile } = await resolveSpeciesProfile({ species_name: speciesName });
  return profile;
}
```

This wrapper accepts `speciesName` only — not `canonical_species_id`. It cannot activate canonical routing regardless of what is passed to it. It is the safe legacy interface for all callers that have not been upgraded to the Phase 2.2 `resolveSpeciesProfile` call signature.

**Archetype routing state:**

| Routing archetype | TypeScript method | Runtime state |
|---|---|---|
| Legacy ilike | `lookupBySpeciesNameIlike()` | ✅ ACTIVE |
| Default fallback | Inline in `resolveSpeciesProfile` | ✅ ACTIVE |
| Alias-resolved canonical | `lookupByAlias()` | ❌ INACTIVE |
| Direct canonical ID | `lookupByCanonicalId()` | ❌ INACTIVE |
| Collapse-normalized canonical | (no function) | ❌ INACTIVE — not implemented |

---

## COMPATIBILITY BEHAVIOR

### Legacy Compatibility Scheduler Operation

The scheduler operates in its designed legacy compatibility mode. This mode is stable, deterministic, and requires no Phase 2.2 infrastructure.

**Legacy compatibility model:**

```
Plant creation:
  resolveSpeciesProfile({ species_name }) →
    lookupBySpeciesNameIlike(species_name) →
      plant_care_profiles WHERE species_name ILIKE '%{input}%'
      ORDER BY species_name LIMIT 1
    → PlantCareProfile | null

  if profile: frequency_days = profile.watering_frequency_days
              fertilizing_frequency_days = profile.fertilizing_frequency_days
  if null:    frequency_days = DEFAULT_WATERING_DAYS (7)
              fertilizing: not scheduled

  INSERT care_tasks (frequency_days, next_due_at = now + frequency_days * ms)

Ongoing display:
  getDaysUntilWatering(plant):
    reads last_completed_at + frequency_days (IGNORES next_due_at)
    returns max(0, ceil(countdown_days))

Watering:
  useWaterPlant:
    UPDATE care_tasks SET last_completed_at = now, next_due_at = now + frequency_days * ms
    INSERT care_logs (plant_id, task_type, completed_at)
```

**Legacy compatibility is explicitly preserved** by the `lookupCareProfile` wrapper function, which will continue to route to the ilike path even after Phase 2.2 routing slots are activated — callers using the legacy API surface are insulated from the Phase 2.2 upgrade.

---

### ILIKE Onboarding Lookup

The `lookupBySpeciesNameIlike` function is the **sole active species resolution mechanism**. Its behavior is fixed and does not vary based on DB state.

**Behavior contract:**

| Property | Value | Immutability |
|---|---|---|
| Query pattern | `ILIKE '%{speciesName.trim()}%'` | Fixed — no dynamic pattern construction |
| Case handling | Case-insensitive (PostgreSQL ILIKE) | Fixed |
| Result ordering | `ORDER BY species_name ASC` — alphabetical | Fixed |
| Result count | `LIMIT 1` — one result maximum | Fixed |
| No-match behavior | Returns `null` → silent 7-day default | Fixed |
| Error handling | `error` field not captured — errors treated as null | Fixed (and a known gap) |
| Input normalization | `.trim()` only | Fixed |

**Coexistence property:** This function queries `plant_care_profiles` which exists in the live DB. It does not reference `canonical_species`, `plant_aliases`, or any Phase 2.2 table. Its behavior is completely stable pre- and post-migration, pre- and post-Phase-2.2-activation.

---

### Nullable Canonical FK Behavior

All canonical FK columns (`canonical_species_id` on `plants`, `care_tasks`, `care_logs`, `plant_care_profiles`) are declared `NULLABLE` in the SQL schema and `?: string | null` in TypeScript. This nullability is the operational foundation of the coexistence contract.

**Null means "pre-Phase-2.2 record" in all contexts:**

| NULL value on | Runtime interpretation |
|---|---|
| `plants.canonical_species_id = NULL` | Plant was created before Phase 2.2 activation; routes to ilike fallback |
| `care_tasks.canonical_species_id = NULL` | Task was generated pre-Phase-2.2; frequency came from ilike or default |
| `care_logs.canonical_species_id = NULL` | Watering occurred pre-Phase-2.2; no species linkage in history |
| `plant_care_profiles.canonical_species_id = NULL` | Care profile has not been linked to canonical species ID; only accessible via ilike |

**Coexistence guarantee:** No active code path performs a null check on `canonical_species_id` and branches behavior based on it. The canonical routing slot (`careProfiles.ts:98`) that would branch on a non-null `canonical_species_id` is commented out. A null canonical FK has no runtime effect in the current system.

---

### Write-Only Canonical Coexistence Fields

Two fields exist in a "write-only" coexistence state — they are defined in TypeScript, assigned values at certain code layers, but either stripped before DB write or discarded before use.

**Field 1 — `user_entered_name` (captured, stripped)**

```
Capture:   PlantForm.tsx:62 — user_entered_name = speciesName.trim() || undefined
Value:     Always identical to species_name at capture time
Shim:      usePlants.ts:61 — stripped from INSERT payload
Result:    Never reaches DB; permanently undefined for all existing plants
```

**Field 2 — `SpeciesResolutionContext` (computed, discarded)**

```
Computation:  resolveSpeciesProfile() returns { profile, context } on every call
context.method:    "ilike_species_name" or "default_fallback"
context.resolved:  true if profile found, false if default fallback
Discard:      usePlants.ts:85 — const { profile } = await resolveSpeciesProfile(...)
              context is never destructured; garbage-collected immediately
Result:       Resolution method is never logged, stored, or surfaced to user
```

**Coexistence property:** Both fields are coexistence-forward — they preserve design space for Phase 2.2 (where `user_entered_name` would be stored and `context.method` would be written to `species_resolution_method`). Their current write-only / discard state is intentional and does not cause runtime errors.

---

## GOVERNANCE SAFETY FINDINGS

### No Hidden Activation

**Finding: CONFIRMED across all audit domains**

The complete set of mechanisms surveyed for potential hidden activation:

| Mechanism category | Surveyed | Hidden activation found? |
|---|---|---|
| Environment variable conditionals | All `process.env` references in mobile app | ❌ NONE |
| Dynamic `import()` calls | All JS/TS files | ❌ NONE |
| Feature flag checks | All conditional branching | ❌ NONE |
| Database triggers | All SQL files | ❌ NONE (only `update_updated_at` trigger) |
| Supabase Edge Functions | Project directory | ❌ NONE (no edge function files) |
| React `useEffect` with data-conditional side effects | All screen and hook files | ❌ NONE |
| Background timers | All app files | ❌ NONE |
| `onSuccess` callbacks that trigger mutations | All React Query hooks | ❌ NONE (only `invalidateQueries` — reads) |
| ORM schema sync | Drizzle config | ❌ NONE (targets separate DB) |
| `getSchemaMigrationStatus()` gate | `runtimeValidation.ts` | ❌ NONE (zero call sites) |

**Activation invariant:** No runtime event, DB state, user action, auth state, or configuration value can activate any Phase 2.2 system without a source code edit. The boundary between the active legacy runtime and the inactive canonical runtime is enforced entirely by code comments, not by runtime conditions.

---

### No Startup Migrations

**Finding: CONFIRMED — startup sequence is read-only**

The full application startup sequence:

```
1. SplashScreen.preventAutoHideAsync()           — asset management; no network
2. QueryClient instantiated (staleTime: 30_000)  — in-memory object; no network
3. useFonts() — Inter_400/500/600/700Regular      — asset bundle read; no Supabase
4. SplashScreen.hideAsync() when fonts ready      — display; no network
5. AuthProvider mounts:
   supabase.auth.getSession()                     — READ from AsyncStorage → Supabase Auth
   supabase.auth.onAuthStateChange subscription   — event listener; no writes
6. expo-router Stack renders                      — routing; no Supabase
```

Steps 1–4 and 6 involve zero network calls. Step 5 involves one read-only Supabase Auth call (`GET /auth/v1/session`). No SQL is executed at any step. The live Supabase DB schema is not inspected, not compared to TypeScript types, and not modified at any startup step.

**Startup migration invariant:** The PLANTMON mobile app cannot modify the Supabase DB schema under any startup condition. Schema changes require manual SQL Editor execution.

---

### No Automatic Rebinding

**Finding: CONFIRMED — no rebinding mechanism exists at any layer**

"Rebinding" encompasses: recalculating care task frequencies, updating `next_due_at` based on new species data, reassigning `canonical_species_id`, or regenerating care tasks for existing plants.

All six potential rebinding triggers surveyed:

| Trigger | Rebinding behavior | Evidence |
|---|---|---|
| App startup | ❌ NONE | Startup sequence confirmed read-only |
| Auth state change | ❌ NONE | `onAuthStateChange` handler updates React state only |
| Plant data cache refresh | ❌ NONE | React Query refetch is read-only |
| `useUpdatePlant` success | ❌ NONE | Updates `plants` row; no task recalculation |
| `invalidateQueries(["plants"])` | ❌ NONE | Triggers refetch (read); no writes |
| Supabase DB trigger | ❌ NONE | Only `update_updated_at` trigger; no task mutation |

**Rebinding invariant:** `care_tasks.frequency_days` is immutable in the current runtime after row creation. It cannot change through any in-app action — only via direct DB edit or a future code path that does not yet exist.

---

### No ORM Synchronization

**Finding: CONFIRMED — Supabase DB is unreachable by any ORM in this project**

Two ORM systems exist in the monorepo:

**Drizzle ORM** (`lib/db/`, used by `artifacts/api-server/`):
- Targets `DATABASE_URL` environment variable — a separate PostgreSQL connection string
- `pnpm --filter @workspace/db run push` applies Drizzle schema to that separate DB only
- Has no `EXPO_PUBLIC_SUPABASE_URL` connection; no Supabase client
- Cannot reach the Supabase DB under any configuration

**Supabase JS client** (`lib/supabase.ts`):
- Is a PostgREST HTTP client, not an ORM
- Cannot push schemas, run migrations, or alter tables
- Makes only HTTP requests to the PostgREST and Auth APIs

**ORM sync invariant:** No `pnpm run` command, no application startup, and no developer workflow can cause Drizzle to modify the Supabase DB. The two databases are completely isolated at the connection level.

---

## FUTURE ACTIVATION DEPENDENCIES

### B2.2A — Canonical Identity Activation (core canonical routing)

**Description:** Activate `canonical_id_lookup` as the primary resolution path. Plants with a `canonical_species_id` on their `plants` row route to `lookupByCanonicalId` before ilike fallback.

**Full dependency chain:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `supabase-migration-v2.sql` applied | DB — schema | ❌ UNAPPLIED |
| 2 | `canonical_species` table seeded | DB — data | ❌ EMPTY (table absent) |
| 3 | `plant_care_profiles.canonical_species_id` backfilled | DB — data | ❌ NULL on all rows |
| 4 | Phase 2.1 shim removed from `useCreatePlant` | Code | ❌ SHIM ACTIVE |
| 5 | Phase 2.1 shim removed from `useUpdatePlant` | Code | ❌ SHIM ACTIVE |
| 6 | Onboarding upgraded to resolve and write `canonical_species_id` | Code | ❌ NOT IMPLEMENTED |
| 7 | `lookupByCanonicalId` function body uncommented | Code | ❌ COMMENTED OUT |
| 8 | Canonical routing slot uncommented in `resolveSpeciesProfile` | Code | ❌ COMMENTED OUT |
| 9 | `canonical_species_id` forwarded through `generateDefaultCareTasks` | Code | ❌ COMMENTED OUT (`careProfiles.ts:208`) |
| 10 | `care_tasks` INSERT updated to write `canonical_species_id` | Code | ❌ NOT IN PAYLOAD |

**Blocking invariant:** Dependencies 1–3 are DB prerequisites — code changes 4–10 have zero effect until these are satisfied. Dependencies 4–5 must be removed in the same deployment as dependency 6, or there is a window where the schema has the columns but all writes strip them.

---

### B2.2B — Alias-Mediated Canonical Resolution

**Description:** Activate `alias_lookup` as the secondary resolution path. Plants whose `species_name` matches a `plant_aliases` row route to `lookupByAlias` → `lookupByCanonicalId` before ilike fallback.

**Full dependency chain:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All B2.2A dependencies satisfied | Mixed | ❌ (B2.2A not yet started) |
| 2 | `plant_aliases` table seeded with alias rows | DB — data | ❌ EMPTY (table absent) |
| 3 | `search_priority` values authored for all aliases | DB — data | ❌ EMPTY |
| 4 | `lookupByAlias` function body uncommented | Code | ❌ COMMENTED OUT (`careProfiles.ts:74–88`) |
| 5 | Alias routing slot uncommented in `resolveSpeciesProfile` | Code | ❌ COMMENTED OUT (`careProfiles.ts:107–114`) |
| 6 | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` applied (GIN index) | DB — schema | ❌ UNAPPLIED |

**Routing precedence when B2.2B is active:**
```
1. canonical_id_lookup (if canonical_species_id already set on plant)
2. alias_lookup (species_name matches alias → resolves canonical_species_id)
3. lookupBySpeciesNameIlike (legacy fallback)
4. default_fallback (7-day default)
```

**Dependency note:** B2.2B requires B2.2A because `lookupByAlias` calls `lookupByCanonicalId` — if `lookupByCanonicalId` is still commented out, `lookupByAlias` would have a compilation error.

---

### B2.3 — Seasonal Scheduler Activation

**Description:** Activate seasonal frequency adjustment — `next_due_at` is computed using seasonally-adjusted intervals rather than the static `frequency_days` integer.

**Full dependency chain:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `getDaysUntilWatering` rewritten to read `next_due_at` directly | Code | ❌ READS `last_completed_at + frequency_days` |
| 2 | Seasonal routing slots uncommented in `resolveSpeciesProfile` | Code | ❌ ALL COMMENTED OUT |
| 3 | Seasonal frequency data authored in `plant_care_profiles` | DB — data | ❌ No seasonal frequency columns exist |
| 4 | `supabase-migration-v2.sql` applied | DB — schema | ❌ UNAPPLIED |
| 5 | Seasonal frequency columns added to `plant_care_profiles` | DB — schema | ❌ NOT YET DEFINED in any SQL file |

**Critical pre-condition — dependency 1 is independent of all others:**  
`getDaysUntilWatering` must be fixed to read `next_due_at` **before** any seasonal writer modifies `next_due_at`. If seasonal writes activate while `getDaysUntilWatering` still computes from `last_completed_at + frequency_days`, the UI countdown and the DB-stored schedule will silently disagree. This fix can be deployed at any time and does not require schema migration.

**Dependency note:** B2.3 does not strictly require B2.2A or B2.2B. The seasonal scheduler can operate using the legacy ilike-derived `frequency_days` as its base — seasonal adjustment modifies `next_due_at` relative to whatever base interval was set. However, seasonal + canonical combined requires B2.2A.

---

### B2.3B — Collapse Normalization Activation

**Description:** Activate collapse mapping as a pre-resolution normalization step — variant species names are collapsed to canonical equivalents before alias or canonical lookup.

**Full dependency chain:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All B2.2B dependencies satisfied | Mixed | ❌ (B2.2B not yet started) |
| 2 | `collapse_mappings` table seeded with entries and confidence scores | DB — data | ❌ EMPTY (table absent) |
| 3 | `lookupByCollapseMapping()` function authored from scratch | Code | ❌ DOES NOT EXIST — no stub |
| 4 | Collapse routing slot added to `resolveSpeciesProfile` | Code | ❌ DOES NOT EXIST — no slot |
| 5 | Confidence threshold logic authored | Code | ❌ NOT DESIGNED |
| 6 | Collapse-normalized input routed to alias/canonical paths | Code | ❌ NOT DESIGNED |

**Maturity note:** B2.3B is the least mature future activation. Unlike all other phases which have at least commented-out code stubs and defined TypeScript types, the collapse routing layer has only the `CollapseMapping` TypeScript interface and the DB table definition. No lookup function, no routing slot, and no confidence threshold logic exists in any form. B2.3B requires more net-new implementation than any other listed activation phase.

---

## COEXISTENCE STATE SUMMARY

| Dimension | Current state |
|---|---|
| **Coexistence mechanism** | Active — Phase 2.1 shim + `SELECT *` forward-compat + double-commented slots + underscore parameter |
| **Active resolution paths** | 2: `ilike_species_name`, `default_fallback` |
| **Inactive resolution paths** | 3: `canonical_id_lookup`, `alias_lookup`, collapse normalization |
| **DB schema state** | `supabase-setup.sql` only — pre-migration |
| **Phase 2.1 fields in live DB** | 0 of 6 columns exist |
| **Canonical reference tables in live DB** | 0 of 3 tables exist |
| **Plants with `canonical_species_id` set** | 0 (column absent) |
| **Care tasks with `canonical_species_id` set** | 0 (column absent) |
| **Care logs with `canonical_species_id` set** | 0 (column absent) |
| **Hidden activations possible without code change** | 0 confirmed |
| **Startup SQL execution** | 0 statements |
| **ORM sync risk to Supabase DB** | 0 — architecturally impossible |
| **Scheduler rebinding** | OFF — no mechanism |
| **Coexistence stability** | STABLE — all four mechanisms verified, one known future gap (edit form `user_entered_name` overwrite post-Phase-2.2) |

---

*This document is a read-only coexistence state freeze. No application files, SQL files, or migration states were modified in its generation. Supersede only after a confirmed activation event that changes the coexistence topology.*
