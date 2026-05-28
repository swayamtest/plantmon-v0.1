# PLANTMON — Scheduler Governance Audit

**Scope:** All files controlling watering and fertilizing schedule computation, task generation, task mutation, and UI rendering  
**Type:** Read-only scheduler governance documentation  
**Generated:** May 2026  
**Source:** Direct file inspection — all findings are line-referenced  

---

## EXECUTIVE SUMMARY

PLANTMON's scheduler is entirely **client-side, reactive, and pull-based**. There is no background worker, no server-side job, no push notification, and no cron system. All watering urgency is computed on-demand at React render time.

The scheduler has three distinct layers:

| Layer | Location | Responsibility |
|---|---|---|
| **Computation** | `types/plant.ts` | `getDaysUntilWatering`, `needsWatering` — pure functions |
| **Intelligence** | `lib/careProfiles.ts` | `resolveSpeciesProfile`, `generateDefaultCareTasks`, frequency selectors |
| **Mutation** | `hooks/usePlants.ts` | `useWaterPlant` — writes to `care_logs` and `care_tasks` |

**Critical unmanaged drift:** `next_due_at` is written by the mutation layer but never read by the computation layer. The UI derives all watering urgency from `last_completed_at + frequency_days`, making `next_due_at` a write-only column in the current scheduler implementation.

---

## 1 — FILES CONTROLLING SCHEDULER BEHAVIOR

| File | Role | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/types/plant.ts` | Core computation: `getDaysUntilWatering()`, `needsWatering()`, `getWateringTask()`. Pure functions — no DB access. | YES |
| `artifacts/mobile/lib/careProfiles.ts` | Intelligence layer: `resolveSpeciesProfile()`, `generateDefaultCareTasks()`, `getEffectiveWateringFrequency()`, `getEffectiveFertilizingFrequency()`. Queries Supabase for care profiles. | YES |
| `artifacts/mobile/hooks/usePlants.ts` | Mutation layer: `useWaterPlant()` writes `care_logs` + updates `care_tasks`. `useCreatePlant()` triggers task generation. | YES |
| `artifacts/mobile/app/(tabs)/index.tsx` | UI consumer: applies `needsWatering` and `getDaysUntilWatering` filters for "Water today" and "Due soon" views. | YES |
| `artifacts/mobile/components/PlantCard.tsx` | UI consumer: renders per-plant watering countdown badge. Calls `getDaysUntilWatering` and `needsWatering`. | YES |
| `artifacts/mobile/components/WateringStatus.tsx` | UI consumer: dashboard aggregate status counts. | MEDIUM |
| `artifacts/mobile/app/plant/[id].tsx` | UI consumer: plant detail watering section. Calls `getWateringTask`, `getDaysUntilWatering`, `needsWatering`. | YES |
| `artifacts/mobile/types/canonical.ts` | Enum governance for `TaskType`, `TaskTypeLegacy`. No scheduler logic itself. | INDIRECT |

---

## 2 — `next_due_at` GENERATION LOGIC

### Where `next_due_at` is Written

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 224–238  
**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 175–183

#### At task creation (`generateDefaultCareTasks`)

```typescript
// careProfiles.ts:224
next_due_at: new Date(Date.now() + waterFreq * 86_400_000).toISOString(),
```

- Computed as `now + frequency_days * 86400000` (milliseconds)
- Uses the constant `86_400_000` (1 day in ms) — not a variable, not configurable
- Set once at plant creation time
- No time-of-day normalization (e.g., set to midnight local time). It is a raw `Date.now()` offset, so two plants watered at different times of day will have `next_due_at` at different times of day.

#### At watering completion (`useWaterPlant`)

```typescript
// usePlants.ts:175–179
const nextDue = existing.frequency_days
  ? new Date(Date.now() + existing.frequency_days * 24 * 60 * 60 * 1000).toISOString()
  : null;
supabase.from("care_tasks").update({ last_completed_at: now, next_due_at: nextDue })
```

- Same formula: `now + frequency_days * 86400000` — written two ways (`86_400_000` vs `24 * 60 * 60 * 1000`) but numerically identical
- If `frequency_days` is `null` or `0`, `next_due_at` is set to `null`
- Updates both `last_completed_at` and `next_due_at` atomically in one `UPDATE`

### Where `next_due_at` is Read

**`next_due_at` is never read by any scheduler computation in the current codebase.**

| File | Reads `next_due_at`? | Notes |
|---|---|---|
| `types/plant.ts` | ❌ NO | `getDaysUntilWatering` uses `last_completed_at + frequency_days` only |
| `lib/careProfiles.ts` | ❌ NO | Frequency functions do not reference `next_due_at` |
| `hooks/usePlants.ts` | ❌ WRITE ONLY | Queries `frequency_days` to compute `next_due_at` for writing; never reads `next_due_at` |
| `app/(tabs)/index.tsx` | ❌ NO | Filters by `needsWatering()` / `getDaysUntilWatering()` |
| `components/PlantCard.tsx` | ❌ NO | Calls `getDaysUntilWatering()` |
| `app/plant/[id].tsx` | ❌ NO | Uses `getDaysUntilWatering()` |

**Governance implication:** `next_due_at` is a **write-only** DB column in the current scheduler. It is persisted but never consumed. The UI always recomputes the due date from `last_completed_at + frequency_days`. This means:

1. `next_due_at` and the UI countdown are guaranteed to agree only when `frequency_days` is constant — which it is today (no seasonal adjustment active)
2. When seasonal scheduler activates and changes `frequency_days` at different seasons, `next_due_at` will be updated by `useWaterPlant` using the new frequency, but a historical `next_due_at` from a different season would have been wrong — this is a transient correctness gap that resolves at the next watering
3. Any external system that writes `next_due_at` directly (e.g., an admin backfill, a future server-side scheduler) would have zero effect on the UI countdown

---

## 3 — WATERING FREQUENCY LOGIC

### Computation chain

```
Plant created
  → generateDefaultCareTasks(plantId, species_name)
    → resolveSpeciesProfile({ species_name })
      → lookupBySpeciesNameIlike(species_name)    ← only active path
    → getEffectiveWateringFrequency(profile)
      → profile?.watering_frequency_days ?? 7     ← flat field or default
    → INSERT care_tasks { frequency_days: waterFreq, next_due_at: now + waterFreq*ms }

User waters plant
  → useWaterPlant(plantId)
    → SELECT care_tasks WHERE plant_id + task_type='watering'
    → UPDATE care_tasks SET last_completed_at=now, next_due_at=now+frequency_days*ms

UI renders
  → getDaysUntilWatering(plant)
    → getWateringTask(plant) → plant.care_tasks.find(t => t.task_type === 'watering')
    → last = new Date(task.last_completed_at)
    → next = last + task.frequency_days * 86400000
    → diff = Math.ceil((next - Date.now()) / 86400000)
    → return Math.max(0, diff)
```

### `getEffectiveWateringFrequency` — exact behavior

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 137–156

```typescript
export function getEffectiveWateringFrequency(
  profile: PlantCareProfile | null,
  _season?: Season,          // ← accepted but IGNORED (underscore prefix)
): number {
  // Seasonal routing is COMMENTED OUT:
  // if (_season && profile) {
  //   const seasonalFreq = {
  //     spring: profile.watering_frequency_spring,
  //     ...
  //   }[_season];
  //   if (seasonalFreq != null) return seasonalFreq;
  // }

  return profile?.watering_frequency_days ?? DEFAULT_WATERING_DAYS;  // line 155
}
```

**Governance implications:**
- The `_season` parameter is a Phase 2.2 activation slot — it accepts a `Season` argument today but discards it. Callers passing a season value receive no seasonal behavior.
- The sole active path is: `profile.watering_frequency_days` (flat single-value field) or `7` (the `DEFAULT_WATERING_DAYS` constant).
- No call site currently passes a season argument — `generateDefaultCareTasks` calls `getEffectiveWateringFrequency(profile)` with no `_season` argument.

### `getDaysUntilWatering` — exact behavior

**File:** `artifacts/mobile/types/plant.ts` — lines 238–249

```typescript
export function getDaysUntilWatering(plant: Plant): number {
  const task = getWateringTask(plant);
  if (!task?.last_completed_at || !task?.frequency_days) return 0;  // line 240
  const last = new Date(task.last_completed_at);
  const next = new Date(last.getTime() + task.frequency_days * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}
```

**Static interval constants used:**
- `24 * 60 * 60 * 1000` = 86,400,000 ms = exactly 1 calendar day
- No DST correction, no timezone awareness, no time-of-day normalization

**Falsy guard at line 240:** Returns `0` (i.e., "needs watering now") in ALL of the following cases:
- No watering task exists for the plant
- Watering task exists but `last_completed_at` is null (never watered)
- Watering task exists but `frequency_days` is null or 0

**Governance implication:** A plant that has never been watered, or whose care task has no frequency, displays as **"Water today"** in the UI — the same as an overdue plant. There is no visual distinction between "no data" and "overdue". This is a known UX approximation: if you just added a plant, it shows as needing water immediately regardless of when it was last watered in physical reality.

### "Due soon" threshold

**File:** `artifacts/mobile/app/(tabs)/index.tsx` — lines 31–34

```typescript
if (filter === "soon") {
  const d = getDaysUntilWatering(p);
  return d > 0 && d <= 2;
}
```

The "Due soon" filter matches plants with `getDaysUntilWatering` of exactly **1 or 2 days**. This is a static hardcoded threshold — not configurable per-plant or per-species.

### Watering badge text in PlantCard

**File:** `artifacts/mobile/components/PlantCard.tsx` — lines 122–130

```typescript
{urgent
  ? "Water today"
  : daysLeft === 1
    ? "Water tomorrow"
    : daysLeft > 1
      ? `Water in ${daysLeft}d`
      : "Log watering"   // ← daysLeft === 0 AND !urgent — falsy frequency_days path
}
```

The `"Log watering"` text appears only when `getDaysUntilWatering` returns `0` but `needsWatering` is... wait — `needsWatering` also returns true when `getDaysUntilWatering === 0`. So `urgent` would be true. This branch (`daysLeft === 0 && !urgent`) is actually unreachable given `needsWatering = getDaysUntilWatering === 0`. The `"Log watering"` string is dead code in the current logic — every `daysLeft === 0` case is also `urgent === true` and is caught by the first branch.

---

## 4 — FERTILIZING FREQUENCY LOGIC

### `getEffectiveFertilizingFrequency` — exact behavior

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 158–169

```typescript
export function getEffectiveFertilizingFrequency(
  profile: PlantCareProfile | null,
  _season?: Season,          // ← accepted but IGNORED
): number | null {
  // Seasonal routing COMMENTED OUT
  return profile?.fertilizing_frequency_days ?? null;  // line 168
}
```

**Key differences from watering frequency:**
- Returns `null` when no profile exists (not a default number). There is no `DEFAULT_FERTILIZING_DAYS` constant.
- A `null` return means no fertilizing task is generated — fertilizing is optional per species, watering is universal.

### Fertilizing task generation condition

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 232–239

```typescript
if (fertFreq != null) {
  tasks.push({
    plant_id: plantId,
    task_type: "fertilizing",
    frequency_days: fertFreq,
    next_due_at: new Date(Date.now() + fertFreq * 86_400_000).toISOString(),
    active_status: true,
  });
}
```

**Governance implications:**
- Fertilizing task is only created if the resolved care profile has a non-null `fertilizing_frequency_days`
- Plants without a matching species profile (default fallback) get **no fertilizing task**
- Plants with a species profile that has `fertilizing_frequency_days = null` also get no fertilizing task
- The 46 existing live care profile rows have `fertilizing_frequency_days` values set (legacy schema field) — so any plant whose species matches an existing profile will get a fertilizing task

### Fertilizing in UI

The current UI does not render fertilizing task countdowns. Only the watering task is displayed on `PlantCard`, in `WateringStatus`, and in the home screen filters. Fertilizing tasks exist in the `care_tasks` table but are not surfaced to the user in any screen.

---

## 5 — WHETHER SCHEDULER USES `canonical_species_id`

### Current State: No

The scheduler does **not** use `canonical_species_id` at any point in the current runtime.

| Scheduler Operation | Uses `canonical_species_id`? | Code Evidence |
|---|---|---|
| `generateDefaultCareTasks()` call | NO | `usePlants.ts:85` — called as `generateDefaultCareTasks(plantCore.id, plantCore.species_name)` — `canonical_species_id` argument not passed |
| `resolveSpeciesProfile()` routing | NO | `careProfiles.ts:205–208` — `canonical_species_id` slot is commented out |
| `lookupByCanonicalId()` | NO | Entire function is commented out (`careProfiles.ts:62–71`) |
| `care_tasks` insert | NO | No `canonical_species_id` in the insert payload (`careProfiles.ts:214–228`) |
| `care_logs` insert | NO | `usePlants.ts:159–163` — insert has only `plant_id`, `task_type`, `completed_at` |
| `getEffectiveWateringFrequency()` | NO | No canonical lookup — uses `profile.watering_frequency_days` directly |
| `getDaysUntilWatering()` | NO | Pure function of `last_completed_at` + `frequency_days` |

### Phase 2.2 Activation Points (commented out)

Three specific points in `careProfiles.ts` are where `canonical_species_id` would enter the scheduler:

```typescript
// Point 1 — careProfiles.ts:190–192: generateDefaultCareTasks signature
_canonicalSpeciesId?: string | null,   // ← accepts but does not use

// Point 2 — careProfiles.ts:207–209: resolveSpeciesProfile call
const { profile } = await resolveSpeciesProfile({
  species_name: speciesName,
  // canonical_species_id: _canonicalSpeciesId,    ← COMMENTED OUT
});

// Point 3 — careProfiles.ts:98–105: routing entry point
// if (input.canonical_species_id) {
//   const profile = await lookupByCanonicalId(input.canonical_species_id);
//   if (profile) return { ... "canonical_id_lookup" };
// }
```

**Governance implication:** Activating canonical routing requires three coordinated uncomments:
1. Uncomment the `canonical_species_id` forward in `generateDefaultCareTasks`
2. Uncomment the `canonical_id_lookup` branch in `resolveSpeciesProfile`
3. Uncomment `lookupByCanonicalId` function body

And two prerequisite DB conditions:
- `supabase-migration-v2.sql` applied (adds `canonical_species_id` column to `plant_care_profiles`)
- `canonical_species` table seeded AND `plant_care_profiles.canonical_species_id` backfilled

---

## 6 — LEGACY COMPATIBILITY BEHAVIOR

### What "legacy" means for the scheduler

"Legacy" in PLANTMON scheduler context means:
- Species resolved by **ilike text match** on `species_name` rather than canonical ID lookup
- Watering frequency from **flat `watering_frequency_days` field** rather than seasonal frequency fields
- All care profile rows using **legacy enum values** (`easy/hard`, `low/full_sun`) for non-scheduling fields
- All care tasks and logs having **`canonical_species_id = NULL`**

### All current scheduler paths are legacy paths

| Path | Type | Active? |
|---|---|---|
| `lookupBySpeciesNameIlike()` | Legacy ilike match | ✅ YES — only active path |
| `lookupByCanonicalId()` | Phase 2.2 canonical | ❌ NO — commented out |
| `lookupByAlias()` | Phase 2.2 alias | ❌ NO — commented out |
| `profile.watering_frequency_days` | Legacy flat field | ✅ YES — only active field |
| `profile.watering_frequency_{season}` | Phase 2.1 seasonal | ❌ NO — commented out |
| `DEFAULT_WATERING_DAYS = 7` | Default fallback | ✅ YES — when no profile |

### Backward-compatible public export

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 174–179

```typescript
export async function lookupCareProfile(
  speciesName: string | null | undefined,
): Promise<PlantCareProfile | null> {
  const { profile } = await resolveSpeciesProfile({ species_name: speciesName });
  return profile;
}
```

This thin wrapper is kept so callers using the old `lookupCareProfile` API need not be changed. It routes through `resolveSpeciesProfile` internally.

**Governance implication:** `lookupCareProfile` is documented as a backward-compat export that Phase 2.2 may deprecate. It is currently the only function importing `resolveSpeciesProfile` from external callers.

---

## 7 — STATIC INTERVAL ASSUMPTIONS

The scheduler encodes several static numeric assumptions that are not configurable from the DB, the UI, or any settings system.

### `DEFAULT_WATERING_DAYS = 7`

**File:** `artifacts/mobile/lib/careProfiles.ts` — line 7

```typescript
const DEFAULT_WATERING_DAYS = 7;
```

**Applied when:** `resolveSpeciesProfile` returns `{ profile: null }` — i.e., when the user's entered species name produces no ilike match in `plant_care_profiles`.

**Governance implications:**
- All plants with unrecognized species silently get a 7-day watering schedule
- 7 days is a reasonable median but inappropriate for moisture-sensitive species (e.g., ferns need 2–3 days) or drought-tolerant species (e.g., cacti may need 30+ days)
- There is no UI indication that the 7-day schedule is a default rather than a species-appropriate value
- A future UX improvement could surface "we're using a default schedule — tap to adjust" when the default is applied

### `24 * 60 * 60 * 1000` — 1 calendar day in milliseconds

**Files:** `types/plant.ts:242`, `hooks/usePlants.ts:176`, `lib/careProfiles.ts:225,237`

- Used in three separate files, written as `86_400_000` (careProfiles.ts) and `24 * 60 * 60 * 1000` (types/plant.ts, usePlants.ts)
- Both evaluate to exactly 86,400,000 ms = 86,400 seconds
- **No DST correction:** Civil days vary between 23 and 25 hours during daylight saving transitions. A plant watered at 10pm the day before a clock-forward transition will appear due 1 hour earlier than expected the following cycle. This error accumulates over many watering cycles near DST transitions.
- **No timezone normalization:** All dates are stored as ISO UTC strings. `Date.now()` uses the device's local time for "now". A user traveling across time zones will see their countdown shift by the timezone delta.
- **No midnight alignment:** `next_due_at` is set to exactly `now + n_days`. Two plants with the same `frequency_days` but watered at different times will have different `next_due_at` times of day.

### `d <= 2` — "Due soon" threshold

**File:** `artifacts/mobile/app/(tabs)/index.tsx` — line 33

Plants due in 1 or 2 days are labeled "Due soon". This is a hardcoded constant in a JSX expression — not a named constant, not in a config file, not a user preference.

### `daysLeft === 1` and `daysLeft > 1` — badge copy thresholds

**File:** `artifacts/mobile/components/PlantCard.tsx` — lines 126–129

Separate text is shown for exactly 1 day ("Water tomorrow") vs >1 day ("Water in Nd"). These are hardcoded branch conditions.

---

## 8 — SEASONAL SCHEDULING LOGIC

### Current status: Infrastructure present, logic inactive

The seasonal scheduling infrastructure has been **fully scaffolded but not activated**:

| Component | Status | Location |
|---|---|---|
| `Season` type definition | ✅ DEFINED | `careProfiles.ts:135` — `"spring" \| "summer" \| "autumn" \| "winter"` |
| `_season` parameter in `getEffectiveWateringFrequency` | ✅ DEFINED, ❌ IGNORED | `careProfiles.ts:140` |
| `_season` parameter in `getEffectiveFertilizingFrequency` | ✅ DEFINED, ❌ IGNORED | `careProfiles.ts:160` |
| Seasonal routing block (watering) | ✅ WRITTEN, ❌ COMMENTED OUT | `careProfiles.ts:145–153` |
| Seasonal routing block (fertilizing) | ✅ WRITTEN, ❌ COMMENTED OUT | `careProfiles.ts:163–166` |
| `watering_frequency_spring/summer/autumn/winter` columns in `PlantCareProfile` type | ✅ TYPED | `types/plant.ts:61–64` |
| `fertilizing_frequency_{season}` columns in `PlantCareProfile` type | ✅ TYPED | `types/plant.ts:67–70` |
| DB columns for seasonal frequencies | ❌ NOT IN LIVE DB | Requires `supabase-migration-v2.sql` |
| DB data for seasonal frequencies | ❌ NO DATA | Requires care profile content authoring |
| Season-detection utility | ❌ NOT WRITTEN | No `getCurrentSeason()` function exists anywhere |
| Season passed to `generateDefaultCareTasks` | ❌ NOT PASSED | `usePlants.ts:85` passes no season |

### What activation requires

For seasonal scheduling to produce any effect, ALL of the following must be true simultaneously:

1. `supabase-migration-v2.sql` applied — seasonal frequency columns exist in DB
2. Care profile rows updated — `watering_frequency_spring` etc. populated with non-null values
3. Season-detection utility written — some `getCurrentSeason(): Season` function
4. `generateDefaultCareTasks` updated — season passed to `getEffectiveWateringFrequency`
5. Seasonal routing uncommented in `getEffectiveWateringFrequency`
6. `getDaysUntilWatering` updated — must read `next_due_at` instead of `last_completed_at + frequency_days`, OR the `frequency_days` on the task must be updated at season boundaries

**Governance risk:** The most significant risk is item 6. If seasonal scheduling updates `frequency_days` (or `next_due_at`) on existing `care_tasks` rows at a season boundary, the UI countdown will update immediately — but if `getDaysUntilWatering` continues to read `last_completed_at + frequency_days`, the computation is still correct (it would use the new seasonal `frequency_days`). However, any in-flight or stale React Query cache will show the old countdown until invalidated.

---

## 9 — AUTOMATIC TASK REGENERATION BEHAVIOR

### Single-time generation only

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 187–244

Tasks are generated **once** at plant creation time via `generateDefaultCareTasks`. There is no:
- Scheduled task regeneration
- Task expiry and re-creation
- Re-generation on species update
- Re-generation on profile change

### Duplicate guard

```typescript
// careProfiles.ts:195–203
const { data: existing } = await supabase
  .from("care_tasks")
  .select("id")
  .eq("plant_id", plantId)
  .eq("task_type", "watering")
  .eq("active_status", true)
  .maybeSingle();

if (existing) return;   // ← silently skips if watering task exists
```

**Governance implications:**
- If called again for the same plant (e.g., due to a retry or a race condition), the existing task is preserved
- The guard is on `task_type = "watering"` AND `active_status = true`. A plant with an inactive watering task could receive a duplicate via a retry (active_status false rows are invisible to the guard)
- The guard only prevents duplicate **watering** tasks. A fertilizing task could be created twice if `generateDefaultCareTasks` is called twice for a plant with a null fertilizing task on the first call but non-null on the second (e.g., if the profile lookup returns different results)
- The `PRE_DATASET_HARDENING_MIGRATION_v1.sql` Phase B2.0 migration adds a UNIQUE partial index on `(plant_id, task_type) WHERE active_status = true` to make duplicate prevention DB-enforced rather than application-enforced only

### Task update via watering (not regeneration)

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 174–192

When `useWaterPlant` finds no existing care task (`maybeSingle()` returns null), it inserts a new task:

```typescript
// usePlants.ts:186–192 — "orphan quick-water" path
const { error } = await supabase.from("care_tasks").insert({
  plant_id: plantId,
  task_type: "watering" as TaskType,
  last_completed_at: now,
  // NOTE: no frequency_days, no next_due_at, no active_status
});
```

**Critical governance finding:** This "orphan" task insertion:
- Sets `frequency_days = NULL`
- Sets `next_due_at = NULL` (no default)
- Uses `active_status = NULL` (relies on DB default, which is `true`)
- Results in a plant that shows as **"Log watering"** in the UI indefinitely (badge text from PlantCard `else` branch, but per Section 3 analysis this is actually the `urgent = true` → "Water today" path since `getDaysUntilWatering` returns 0 for null frequency_days)

A plant quick-watered before its initial tasks are generated will have a watering task with `frequency_days = NULL` and will always show as "Water today" — creating a persistent phantom-urgent state that cannot be resolved without manually updating the `care_tasks` row.

### No task regeneration on plant edit

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 102–131

`useUpdatePlant` updates the plant record only. It does not call `generateDefaultCareTasks` or update any `care_tasks`. Changing a plant's `species_name` through the edit form does not update its watering schedule.

**Governance implication:** If a user initially enters "Cactus" (resolves to a 30-day watering profile) then later corrects it to "Fern" (should be 3-day), the watering task retains `frequency_days = 30`. The only way to correct the schedule is a manual DB update or deleting and re-adding the plant.

---

## 10 — COEXISTENCE-SAFE SCHEDULER PATTERNS

### Pattern 1: `_season` underscore parameter convention

**File:** `lib/careProfiles.ts` — lines 140, 160

Parameters named with `_` prefix (TypeScript convention for intentionally unused parameters) allow callers to be written in Phase 2.2 style now, passing a season argument, without the current implementation crashing or misbehaving. The compiler accepts the parameter; the runtime ignores it.

**Coexistence function:** Callers can be upgraded to pass a season before the seasonal routing logic is activated. The router simply discards it until the seasonal block is uncommented.

---

### Pattern 2: Routing slot architecture

**File:** `lib/careProfiles.ts` — `resolveSpeciesProfile()` — lines 95–128

```
[SLOT: canonical_id_lookup]  ← commented out
[SLOT: alias_lookup]         ← commented out
[ACTIVE: ilike_species_name]
[FALLBACK: default_fallback]
```

Each resolution strategy is a self-contained function. The routing function evaluates them in priority order. Adding a new strategy requires only uncommenting a slot — no structural change to callers, no change to the returned type, no change to downstream consumers.

**Coexistence function:** The ilike path operates unchanged while Phase 2.2 paths are dormant. Activating a higher-priority slot does not disable the ilike fallback — it simply short-circuits before reaching it when a better match is found.

---

### Pattern 3: `SpeciesResolutionContext` attached to every result

**File:** `lib/careProfiles.ts` — lines 28–36

```typescript
export type SpeciesResolutionResult = {
  profile: PlantCareProfile | null;
  context: SpeciesResolutionContext;   // { method, resolved }
};
```

Every call to `resolveSpeciesProfile` returns both the profile AND a context object recording which resolution method was used. This enables:
- Logging which plants were resolved by ilike vs canonical vs alias
- Phase 2.2 activation: `species_resolution_method` can be written to `plants` using `context.method`
- Debugging: a future diagnostic could surface which resolution path is most commonly used

**Coexistence function:** The context is attached but not yet consumed by any caller. `usePlants.ts:85` calls `generateDefaultCareTasks` which internally calls `resolveSpeciesProfile`, but the returned context is not surfaced upward.

---

### Pattern 4: `PLANT_SELECT = "*, care_tasks(*)"` forward-compatible query

**File:** `hooks/usePlants.ts` — line 9

```typescript
const PLANT_SELECT = "*, care_tasks(*)";
```

The `*` selector is explicitly documented (line 8 comment) as forward-compatible: pre-migration it returns v0.1 columns; post-migration new nullable columns arrive as `null` without requiring any query change. The same query string works before and after `supabase-migration-v2.sql`.

---

### Pattern 5: `lookupCareProfile` backward-compat wrapper

**File:** `lib/careProfiles.ts` — lines 174–179

The original public API (`lookupCareProfile`) is preserved as a thin wrapper over the new routing architecture. External callers (currently none outside `careProfiles.ts` itself) do not need to be migrated.

---

## 11 — HIDDEN RUNTIME ACTIVATION RISKS

### Risk 1 — `next_due_at` / `getDaysUntilWatering` divergence (HIGH)

**If** any future code path changes `next_due_at` without also updating `last_completed_at + frequency_days` to match (e.g., a server-side scheduler, an admin override, a seasonal boundary update), the DB and the UI will silently disagree on the plant's watering schedule.

**Activation trigger:** Seasonal scheduler activation, any server-side cron writing `next_due_at`.  
**Detection:** No — the UI shows the computed value without any indication that it differs from the DB-stored `next_due_at`.  
**Fix required before seasonal activation:** `getDaysUntilWatering` must be rewritten to read `next_due_at` from the DB, or `frequency_days` on the care task must be updated at season boundaries.

---

### Risk 2 — `generateDefaultCareTasks` called with wrong species_name after shim removal (HIGH)

**File:** `hooks/usePlants.ts` — line 85

```typescript
await generateDefaultCareTasks(plantCore.id, plantCore.species_name);
```

After `supabase-migration-v2.sql` is applied and the compatibility shim is removed, `plantCore` will include `canonical_species_id`. However, `generateDefaultCareTasks` is still called with only `plantCore.species_name`. The `canonical_species_id` is not passed (Phase 2.2 slot is commented out at `careProfiles.ts:207`).

**Activation trigger:** Shim removal without simultaneously activating canonical routing in `generateDefaultCareTasks`.  
**Effect:** Even post-migration, task generation continues to use the ilike fallback path. Not a data-corruption risk — the ilike path still works — but it means Phase 2.2 canonical routing is not enabled for task generation even when other parts of the system may have activated it.

---

### Risk 3 — Orphan watering tasks from quick-water before task generation (MEDIUM)

If `useWaterPlant` is called for a plant before `generateDefaultCareTasks` has completed (e.g., race condition, network timeout during plant creation, or a plant added to the DB via an external tool), the orphan insert path (`usePlants.ts:186–192`) creates a task with `frequency_days = NULL`.

**Effect:** Plant shows as "Water today" indefinitely. The `generateDefaultCareTasks` guard (checks for active watering task) will subsequently find the orphan task and skip generation — leaving the null-frequency task as the permanent scheduler record.

**Mitigation in place:** The UNIQUE partial index from `PRE_DATASET_HARDENING_MIGRATION_v1.sql` prevents a second active watering task, but does not prevent the orphan task from being created first.

---

### Risk 4 — Plant edit does not update watering schedule (MEDIUM)

No scheduler update occurs when a plant's `species_name` is changed via `useUpdatePlant`. A user correcting a mis-entered species name will continue to have the original species' watering frequency.

**Activation trigger:** User edits species name. Silent — no warning in the UI.  
**Fix:** `useUpdatePlant` could trigger a `generateDefaultCareTasks` call (after deactivating the old task) when `species_name` changes.

---

### Risk 5 — `DEFAULT_WATERING_DAYS = 7` applied silently (MEDIUM)

When a plant has no matching care profile, the scheduler applies 7-day watering with no UI indication. If a user's plant genuinely needs watering every 2 days (e.g., maiden-hair fern) and the species is unrecognized, the user will believe the app is managing their plant's care when it is actually applying an arbitrary default.

**Activation trigger:** Any plant with an unrecognized species name (e.g., regional names, common names not in the profile table, misspellings).  
**Fix:** Surface the "using default schedule" state to the user, or prompt for manual frequency confirmation when the default is applied.

---

### Risk 6 — Seasonal routing activation requires `getDaysUntilWatering` rewrite (HIGH)

The seasonal scheduler slot in `getEffectiveWateringFrequency` returns a seasonal frequency. This frequency is used to set `frequency_days` on a new care task. But `getDaysUntilWatering` reads `task.frequency_days` at render time — it does not query the DB for the current seasonal frequency.

If seasonal scheduling changes `frequency_days` at a season boundary (e.g., a summer plant gets `frequency_days = 5` in summer vs `frequency_days = 14` in winter), the transition must update the `care_tasks` row, and the React Query cache must be invalidated. Otherwise the old frequency is used for the countdown until the next full cache refresh.

**Activation trigger:** Seasonal scheduler activation without a season-boundary task-update mechanism.

---

### Risk 7 — `lookupByAlias` uses strict `ilike` on `alias_name` (MEDIUM)

**File:** `lib/careProfiles.ts` — lines 79–87 (commented out)

The Phase 2.2 alias lookup uses `.ilike("alias_name", aliasName.trim())` — no `%` wildcards. This is an exact case-insensitive match, not a partial match. If a user types "Snake Plant" and the alias is stored as "snake plant" or "Snake plant", the match succeeds. But if they type "Snake" or "Snake Pl", it will not match.

**Governance implication:** When alias lookup is activated, exact alias names must be seeded. Partial alias lookups require the GIN trigram index and `%alias%` patterns. The current commented implementation does not use trigram matching.

---

## GOVERNANCE SUMMARY TABLE

| Finding | Severity | Managed? | Resolution |
|---|---|---|---|
| `next_due_at` written but never read by UI | HIGH | NO — unmanaged | Rewrite `getDaysUntilWatering` before seasonal activation |
| Seasonal routing scaffolded but inactive | HIGH | YES — commented slots | Activate after DB migration + data authoring |
| `canonical_species_id` not in scheduler path | HIGH | YES — Phase 2.2 slots | Activate after canonical dataset seeded |
| `DEFAULT_WATERING_DAYS = 7` applied silently | MEDIUM | NO | Surface default state to user |
| `getDaysUntilWatering` returns 0 for no-data | MEDIUM | YES — intentional | Document; low user impact |
| Plant edit doesn't update schedule | MEDIUM | NO | Add schedule refresh on species_name change |
| Orphan task from quick-water race condition | MEDIUM | PARTIAL — UNIQUE index helps | Reorder creation: tasks before UI |
| No DST/timezone correction in day math | LOW | NO | Acceptable for MVP; note for future |
| "Log watering" badge text is dead code | LOW | YES — harmless | Cleanup only |
| Fertilizing tasks not surfaced in UI | LOW | YES — known gap | Future UI feature |

---

*This document is read-only scheduler governance documentation. No files were modified in its generation. Reflects project state as of Phase B2.0.*
