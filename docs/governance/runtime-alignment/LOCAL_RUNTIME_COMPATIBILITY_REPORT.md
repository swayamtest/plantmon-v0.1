# LOCAL RUNTIME COMPATIBILITY REPORT
## Phase B1.5A — Runtime-Schema Compatibility Synchronization

```
╔══════════════════════════════════════════════════════════════════╗
║         MIGRATION-READY RUNTIME COMPATIBILITY FREEZE            ║
║                                                                  ║
║  Phase B1.5A — COMPLETE                                          ║
║  Migration clearance: GRANTED                                    ║
║  Rollback anchor: 5f2f1646a995c4d556719224ea2da234c3fdb55e       ║
║  Next action: Apply supabase-migration-v2.sql to live Supabase   ║
║                                                                  ║
║  This document is the authoritative compatibility record for     ║
║  Phase B1.5A. Do not modify before migration is confirmed live.  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Phase:** B1.5A (Revised) — Local Runtime Compatibility Synchronization  
**Scope:** Runtime made Phase 2.1 schema-compatible WITHOUT activating Phase 2.2 features  
**Runtime behavior change:** NONE — all v0.1 behavior preserved  
**Freeze date:** May 2026  
**Freeze status:** LOCKED — migration-ready rollback anchor

---

## Summary

This phase synchronized the local runtime implementation with the frozen Phase 2.1 schema architecture. The runtime now safely coexists with the new schema: it will continue functioning before and after `supabase-migration-v2.sql` is applied to the live Supabase database, with zero behavior changes.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `hooks/usePlants.ts` | Modified | Phase 2.1 compatibility shim; select expansion; canonical field stripping |
| `lib/careProfiles.ts` | Refactored | Routing-layer architecture; scheduler utilities; behavior unchanged |
| `components/PlantForm.tsx` | Modified | `user_entered_name` capture added to submit payload |
| `lib/runtimeValidation.ts` | New | Pure diagnostic utilities; no behavior impact |
| `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` | New | This document |

---

## 1. Runtime Assumptions Removed

### 1.1 Narrow select after plant insert (`hooks/usePlants.ts`)

**Before:**
```javascript
.insert({ ...input, user_id: user!.id })
.select("id, species_name")
```

**After:**
```javascript
.insert({ ...v01Fields, user_id: user!.id })
.select("*")   // forward-compat: new nullable columns arrive as null post-migration
```

**Risk removed:** Previously, if any future code added `canonical_species_id` to the named select before migration ran, PostgREST would return a 400 error. Using `*` is safe pre- and post-migration.

---

### 1.2 Unchecked `...input` spread into DB insert (`hooks/usePlants.ts`)

**Before:**
```javascript
.insert({ ...input, user_id: user!.id })
```

`PlantInput` now contains Phase 2.1 canonical fields (`user_entered_name`, `canonical_species_id`, `canonical_species_name`, `species_resolution_method`). Spreading them directly into the Supabase insert payload would cause a PostgREST `column does not exist` error because these columns do not yet exist in the live DB.

**After:**
```javascript
const {
  user_entered_name: _user_entered_name,
  canonical_species_id: _canonical_species_id,
  canonical_species_name: _canonical_species_name,
  species_resolution_method: _species_resolution_method,
  ...v01Fields
} = input;
.insert({ ...v01Fields, user_id: user!.id })
```

**Post-migration activation:** Remove the destructuring and change back to `{ ...input, user_id: user!.id }`. The variables `_user_entered_name` etc. are clearly marked for this activation.

Same shim applied in `useUpdatePlant`.

---

### 1.3 Hardcoded care profile resolution architecture (`lib/careProfiles.ts`)

**Before:** `lookupCareProfile()` was the only entry point — one function, one strategy (ilike), no slot for routing alternatives.

**After:** `resolveSpeciesProfile(input: SpeciesResolutionInput)` is the canonical routing entry point. It has explicit Phase 2.2 slots (commented out, clearly marked) for canonical_species_id lookup and alias lookup. The ilike path remains the active runtime path.

`lookupCareProfile()` is preserved as a backward-compatible wrapper — no callers require changes.

---

### 1.4 Scheduler used hardcoded `profile?.watering_frequency_days` directly

**Before:**
```javascript
const waterFreq = profile?.watering_frequency_days ?? DEFAULT_WATERING_DAYS;
```

**After:**
```javascript
const waterFreq = getEffectiveWateringFrequency(profile);
```

`getEffectiveWateringFrequency(profile, season?)` returns `profile?.watering_frequency_days ?? DEFAULT_WATERING_DAYS` today — same behavior. The `season` parameter is a Phase 2.2 activation point. When seasonal DB fields are populated, a single implementation change activates seasonal scheduling for all callers.

Same pattern for fertilizing via `getEffectiveFertilizingFrequency(profile, season?)`.

---

## 2. Compatibility Layers Added

### 2.1 Phase 2.1 compatibility shim in `useCreatePlant` and `useUpdatePlant`

Strips canonical fields from DB insert payload until migration runs. Marked with `// ACTIVATE POST-MIGRATION` comments for precise surgical activation.

### 2.2 `resolveSpeciesProfile` routing entry point (`lib/careProfiles.ts`)

Defines `SpeciesResolutionInput`, `SpeciesResolutionContext`, and `SpeciesResolutionResult` types. Phase 2.2 routing slots are present as commented-out code blocks with explicit implementation instructions.

### 2.3 Scheduler frequency utilities (`lib/careProfiles.ts`)

`getEffectiveWateringFrequency(profile, season?)` and `getEffectiveFertilizingFrequency(profile, season?)` — single activation points for seasonal scheduler migration. No DB reads added.

### 2.4 `user_entered_name` capture in PlantForm (`components/PlantForm.tsx`)

`user_entered_name: speciesName.trim() || undefined` added to the submit payload. Value flows from form → `PlantInput` → `useCreatePlant` where it is held in the stripped variables until post-migration activation. No UI change.

### 2.5 Runtime validation utilities (`lib/runtimeValidation.ts`)

Eight pure inspection functions:

| Function | Purpose |
|---|---|
| `getPlantIdentityStatus(plant)` | Returns `canonical` / `species_known` / `display_name_only` |
| `isCanonicallyResolved(plant)` | True when `canonical_species_id` is set |
| `hasResolvableSpecies(plant)` | True when species_name OR canonical_species_id is present |
| `hasUserEnteredName(plant)` | True when `user_entered_name` is populated (post-Phase 2.2) |
| `hasActiveWateringSchedule(plant)` | True when active watering task with frequency exists |
| `getActiveWateringTask(plant)` | Returns the active watering CareTask |
| `getSchemaMigrationStatus(plantRow)` | Detects whether migration has been applied |
| `getMigrationWarnings(plantRow)` | Lists missing Phase 2.1 columns |
| `isReadyForCanonicalResolution(plant)` | Phase 2.2 gate: has species_name, no canonical_species_id yet |
| `summarizeIdentityStatus(plants)` | Dashboard aggregate for identity state |

---

## 3. Runtime Behavior Verification

| Behavior | Status |
|---|---|
| App boots and auth works | ✅ Unchanged — AuthContext, root redirect untouched |
| Plant list loads | ✅ Unchanged — `usePlants` query uses `PLANT_SELECT = "*, care_tasks(*)"` |
| Plant creation works | ✅ Unchanged — same DB insert, same generateDefaultCareTasks call |
| Species → care profile lookup works | ✅ Unchanged — ilike path in resolveSpeciesProfile is identical to old lookupCareProfile |
| Watering task generation works | ✅ Unchanged — waterFreq computed by getEffectiveWateringFrequency returns same value |
| Fertilizing task generation works | ✅ Unchanged — fertFreq computed by getEffectiveFertilizingFrequency returns same value |
| Watering logging works | ✅ Unchanged — useWaterPlant untouched |
| Plant edit works | ✅ Unchanged — useUpdatePlant applies same shim as useCreatePlant |
| Plant delete works | ✅ Unchanged — useDeletePlant untouched |
| PlantForm renders identically | ✅ Unchanged — no new fields visible to user |
| PlantCard renders identically | ✅ Unchanged — untouched |
| WateringStatus renders identically | ✅ Unchanged — untouched |

---

## 4. Known Pre-existing Issues (Not Fixed — Out of Scope)

These are documented but intentionally not changed in this phase:

| Issue | Risk | When to Fix |
|---|---|---|
| `getDaysUntilWatering` uses `last_completed_at + frequency_days`, ignores stored `next_due_at` | Low — UI and DB can drift after manual DB edits | Phase 2.2 |
| `care_logs` inserts do not populate `canonical_species_id` | Medium — historical logs permanently unlinked from canonical identity | Phase 2.2 (after migration) |
| No UNIQUE constraint on `(plant_id, task_type)` in `care_tasks` | Low — duplicate guard is application-only | Phase 2.2 schema patch |
| Editing `species_name` does not re-generate care tasks | Medium — wrong schedule silently persists after correction | Phase 2.2 |
| `CareTaskStatus` type defined but no DB column exists | Low — type unused in runtime | Future scheduler migration |

---

## 5. Remaining Blockers Before Supabase Migration

| Blocker | Status | Action Required |
|---|---|---|
| `supabase-migration-v2.sql` written | ✅ DONE | — |
| Runtime safe to run pre-migration | ✅ DONE | — |
| Runtime safe to run post-migration | ✅ DONE | — |
| No destructive ops in migration file | ✅ CONFIRMED | — |
| Rollback anchor committed to GitHub | ✅ DONE (0c22023a) | — |
| **Supabase migration itself** | ⏳ PENDING | Run `supabase-migration-v2.sql` in Supabase SQL Editor |

**The Supabase migration is now cleared to run.** No further local code changes are needed before applying it.

---

## 6. Remaining Blockers Before Phase 2.2 Activation

| Blocker | Status |
|---|---|
| Phase 2.1 local schema complete | ✅ DONE |
| Phase 2.1 types complete | ✅ DONE |
| Runtime Phase 2.1 compatible | ✅ DONE (this phase) |
| supabase-migration-v2.sql applied to live DB | ⏳ PENDING |
| canonical_species table seeded | ⏳ PENDING (no data yet) |
| plant_aliases table seeded | ⏳ PENDING (no data yet) |
| collapse_mappings table seeded | ⏳ PENDING (no data yet) |
| canonical_species_id assigned to plant_care_profiles | ⏳ PENDING |
| `lookupByCanonicalId()` implemented in careProfiles.ts | ⏳ PENDING (slot ready) |
| `lookupByAlias()` implemented in careProfiles.ts | ⏳ PENDING (slot ready) |
| PlantForm canonical resolution UI | ⏳ PENDING |
| Post-migration activation shims uncommented in usePlants.ts | ⏳ PENDING |

---

## 7. Synchronization Readiness Classification

| Component | Readiness | Notes |
|---|---|---|
| **Supabase migration** | ✅ READY | Run `supabase-migration-v2.sql` immediately |
| **Canonical dataset seeding** | ⏳ BLOCKED on migration | Migration must run first; no data authored yet |
| **Alias activation** | ⏳ BLOCKED | Needs migration + canonical seed + alias dataset |
| **Collapse activation** | ⏳ BLOCKED | Needs migration + canonical seed + collapse dataset |
| **Scheduler migration** | ⏳ BLOCKED | Needs seasonal data authored in plant_care_profiles |
| **Phase 2.2 runtime activation** | ⏳ BLOCKED | All of the above must complete first |

---

## 8. Post-Migration Activation Checklist

When `supabase-migration-v2.sql` has been confirmed applied, these are the exact surgical changes to activate the runtime:

**`hooks/usePlants.ts`** — In both `useCreatePlant` and `useUpdatePlant`:
1. Remove the 4-field destructuring block
2. Change `.insert({ ...v01Fields, user_id: user!.id })` → `.insert({ ...input, user_id: user!.id })`

**`lib/careProfiles.ts`** — When canonical_species seeded:
1. Uncomment `lookupByCanonicalId()` function
2. Uncomment the `canonical_species_id` slot in `resolveSpeciesProfile`
3. Pass `_canonicalSpeciesId` into `resolveSpeciesProfile` in `generateDefaultCareTasks`

**`lib/careProfiles.ts`** — When alias table seeded:
1. Uncomment `lookupByAlias()` function
2. Uncomment the alias lookup slot in `resolveSpeciesProfile`

**`lib/careProfiles.ts`** — When seasonal data authored:
1. Uncomment seasonal routing in `getEffectiveWateringFrequency` and `getEffectiveFertilizingFrequency`
2. Pass current season from a `getCurrentSeason()` utility into `generateDefaultCareTasks`
