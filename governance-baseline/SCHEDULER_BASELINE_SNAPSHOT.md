# PLANTMON — Scheduler Baseline Snapshot

**Classification:** Governance Baseline Freeze  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-seasonal-activation)  
**Source authority:** `governance-audit/replit-scheduler-audit.md`, `governance-audit/replit-runtime-risk-audit.md`, `governance-baseline/COEXISTENCE_STATE_FREEZE.md`  

This document is the authoritative scheduler behavior baseline for PLANTMON at the Phase B2.0 boundary. It records the exact computation model, isolation guarantees, known debt, and future activation dependencies of the scheduler in its current static-interval legacy state. No code was modified in its generation.

---

## SCHEDULER ARCHITECTURE

### Client-Side Behavior

The PLANTMON scheduler is **entirely client-side**. Every scheduling decision — interval computation, urgency display, due-date calculation — occurs within the React Native application on the user's device. There is no server-side scheduling component of any kind.

**What "client-side" means in practice:**

| Property | Value |
|---|---|
| Schedule computation location | User's device, within React Native render cycle |
| Schedule storage location | Supabase DB (`care_tasks` table) — persisted server-side |
| Schedule read location | React Query cache → Supabase PostgREST (`GET /rest/v1/plants?select=*,care_tasks(*)`) |
| Schedule update trigger | Explicit user action only (watering via `useWaterPlant`) |
| Clock source | `Date.now()` — device local clock |
| Timezone handling | None — all timestamps stored as UTC; `Date.now()` uses device local time without timezone correction |
| DST correction | None — 23-hour and 25-hour days treated as 24-hour days |

**Implication:** Two users on different devices viewing the same plant would see different countdown values if their device clocks differ. The scheduler has no server-authoritative clock.

---

### Reactive Computation Model

The scheduler computes urgency **on every render**, not on a schedule. There is no timer, no cached countdown, and no pre-computed urgency value stored anywhere.

**Computation trigger chain:**

```
React Query cache has plant data with care_tasks
  → PlantCard renders
    → getDaysUntilWatering(plant) called inline
      → reads plant.care_tasks from cached data
        → computes ceiling((next - Date.now()) / ms)
          → returns integer days remaining
            → PlantCard renders urgency badge
```

Every time `PlantCard` re-renders (due to any state change in the component tree, navigation, or React Query cache update), `getDaysUntilWatering` is called fresh. The countdown is never stale relative to `Date.now()` — it is always computed against the current device time at render moment.

**Reactivity model characteristics:**

| Property | Behavior |
|---|---|
| Countdown staleness | Zero — recomputed on every render |
| Cache staleness | Up to 30 seconds (`staleTime: 30_000` in `_layout.tsx:24`) |
| Source of truth | `care_tasks.last_completed_at` + `care_tasks.frequency_days` in React Query cache |
| `next_due_at` in computation | NOT USED — see §Known Scheduler Governance Debt |
| Re-render trigger (explicit) | `invalidateQueries(["plants"])` after any mutation |
| Re-render trigger (implicit) | Any parent state change; React navigation focus events |

---

### Pull-Based Scheduling

The scheduler is **pull-based**: it computes what the user should do now by pulling persisted data and computing urgency at read time. It does not push notifications, pre-compute urgency, or schedule future reminders.

**Pull model specifics:**

```
App open / plant list renders:
  → React Query checks cache freshness (staleTime: 30_000ms)
  → If stale: GET /rest/v1/plants?select=*,care_tasks(*)
  → Cache updated with fresh DB values
  → getDaysUntilWatering() called for each plant
  → Urgency badges rendered based on fresh computation

App in foreground, no interaction, 31 seconds later:
  → Next navigation focus event triggers stale check
  → Query re-fires if stale
  → Fresh values fetched → countdown updated

User waters plant:
  → useWaterPlant mutation fires
  → UPDATE care_tasks SET last_completed_at = now, next_due_at = now + freq * ms
  → invalidateQueries(["plants"]) → immediate cache invalidation
  → Fresh fetch → countdown resets to full frequency interval
```

**The system never proactively contacts the user.** There are no push notifications, no local notification scheduling, no background fetch, and no `expo-notifications` integration. If the user does not open the app, they receive no watering reminder regardless of how overdue a plant becomes.

---

### Lack of Background Workers

No background computation of any kind exists:

| Background worker type | Present? | Evidence |
|---|---|---|
| `setInterval` / `setTimeout` | ❌ NO | Not present in any file |
| `expo-background-fetch` | ❌ NO | Not installed or imported |
| `expo-task-manager` | ❌ NO | Not installed or imported |
| `expo-notifications` (local scheduled) | ❌ NO | Not installed or imported |
| Supabase Edge Function (cron) | ❌ NO | No edge function files in project |
| React Native `AppState` listener | ❌ NO | No `AppState` subscription in any file |
| Web Worker / Service Worker | ❌ NO | Not applicable to React Native |
| Push notification service | ❌ NO | No FCM, APNs, or Expo Push integration |

**Implication:** The scheduler is fully dormant when the app is closed or backgrounded. No computation, no notification, no DB write occurs outside of an active app session.

---

## WATERING COMPUTATION MODEL

### `getDaysUntilWatering` Behavior

**File:** `artifacts/mobile/types/plant.ts` — lines 238–249 (exact function body)

```typescript
export function getDaysUntilWatering(plant: Plant): number {
  const task = getWateringTask(plant);
  if (!task?.last_completed_at || !task?.frequency_days) return 0;
  const last = new Date(task.last_completed_at);
  const next = new Date(last.getTime() + task.frequency_days * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}
```

**Step-by-step computation:**

| Step | Operation | Notes |
|---|---|---|
| 1 | `getWateringTask(plant)` | Finds `care_tasks` entry WHERE `task_type = "watering"` AND `active_status = true` |
| 2 | Null guard | If no task, or `last_completed_at` is null, or `frequency_days` is null/0 → **return 0 immediately** ("Water today") |
| 3 | Parse `last_completed_at` | `new Date(string)` — ISO 8601 UTC string from Supabase |
| 4 | Compute `next` | `last.getTime() + frequency_days * 86_400_000` ms |
| 5 | Compute `diff` | `Math.ceil((next - Date.now()) / 86_400_000)` — fractional days rounded UP |
| 6 | Floor at 0 | `Math.max(0, diff)` — negative values (overdue) return 0, not negative |

**Output semantics:**

| Return value | Meaning | PlantCard display |
|---|---|---|
| `0` | Water today (or overdue) | "Water today" badge (primary/accent color) |
| `1` | Due tomorrow | "Due in 1 day" (warning treatment, `d <= 2`) |
| `2` | Due in 2 days | "Due in 2 days" (warning treatment, `d <= 2`) |
| `≥ 3` | Not urgent | "Due in N days" (muted) |

**`Math.ceil` behavior — the partial-day implication:**  
If a plant was watered 6 hours ago on a 7-day schedule, `diff` computes to `6.75` days → `Math.ceil(6.75) = 7`. The user sees "Due in 7 days." At exactly midnight on day 7 (device local time), `diff` drops below 1.0 → `Math.ceil(0.x) = 1` → "Due in 1 day." At midnight on day 8: `diff < 0` → `Math.max(0, negative) = 0` → "Water today." The day boundary is driven by device local midnight, not UTC midnight.

---

### `frequency_days` Behavior

`frequency_days` is an integer stored on `care_tasks`. It represents the number of days between watering events as a static constant for the lifetime of the care task row.

**How `frequency_days` is set:**

| Path | Value assigned | Source |
|---|---|---|
| Species matched via ilike | `plant_care_profiles.watering_frequency_days` | Species profile lookup |
| Species not matched (null profile) | `DEFAULT_WATERING_DAYS = 7` | Hardcoded constant in `careProfiles.ts` |
| Orphan quick-water path (no task exists) | `NULL` | No value in INSERT — DB default NULL |
| Future Phase 2.2 canonical match | `plant_care_profiles.watering_frequency_days` (via canonical ID) | Not yet active |

**`frequency_days` immutability in current runtime:**

Once set at task creation, `frequency_days` is never updated by any application code path:
- `useWaterPlant` updates `last_completed_at` and `next_due_at` only — `frequency_days` untouched
- `useUpdatePlant` updates the `plants` row only — care tasks untouched
- No "edit schedule" UI exists
- No scheduler rebinding mechanism exists

`frequency_days` is effectively **immutable after creation** in the current runtime. A plant's watering interval can only be changed by a direct DB edit or by deleting and recreating the plant.

**The NULL frequency_days failure mode:**  
If `frequency_days = NULL` (orphan quick-water path), the null guard in `getDaysUntilWatering` fires at step 2 and returns `0` permanently. The plant shows "Water today" on every app launch regardless of when it was last watered. This is a permanent stuck state — the orphan task blocks proper task generation (the duplicate guard finds an active task and returns early), and nothing auto-corrects `frequency_days` to a real value.

---

### `next_due_at` Behavior

`next_due_at` is a timestamp column on `care_tasks`. It is written on task creation and on every watering event. It is **never read by any UI computation**.

**Where `next_due_at` is written:**

| Write location | File | Expression |
|---|---|---|
| Task creation (per-profile) | `careProfiles.ts` (inside generateDefaultCareTasks) | `new Date(Date.now() + fd * 24 * 60 * 60 * 1000).toISOString()` |
| Task creation (default fallback) | `careProfiles.ts` | `new Date(Date.now() + DEFAULT_WATERING_DAYS * 24 * 60 * 60 * 1000).toISOString()` |
| Watering event | `usePlants.ts` (useWaterPlant) | `new Date(Date.now() + (task.frequency_days ?? DEFAULT_WATERING_DAYS) * 24 * 60 * 60 * 1000).toISOString()` |

**Where `next_due_at` is read:**

| Read location | Result |
|---|---|
| `getDaysUntilWatering` | ❌ NOT READ — computes from `last_completed_at + frequency_days` |
| `PlantCard` | ❌ NOT READ |
| `plant/[id].tsx` detail screen | ❌ NOT READ |
| Any query or filter | ❌ NOT READ — `PLANT_SELECT = "*, care_tasks(*)"` fetches it but nothing consumes it |

**`next_due_at` is a write-only column in the current runtime.** It is persisted to the DB on every relevant mutation but consumes zero influence on any user-visible computation. The column exists to support future scheduler reads — specifically, a future rewrite of `getDaysUntilWatering` that reads `next_due_at` directly from the DB value rather than recomputing it. Until that rewrite occurs, `next_due_at` in the DB and the countdown the user sees are computed independently and happen to match only because both currently use the same source formula.

---

### Fallback Behavior

When `resolveSpeciesProfile` returns `null` (species not found via ilike), the scheduler applies a silent fallback.

**Fallback chain:**

```
resolveSpeciesProfile({ species_name }) → { profile: null, context: { method: "default_fallback" } }
  → generateDefaultCareTasks:
      frequency_days = DEFAULT_WATERING_DAYS     (= 7, careProfiles.ts constant)
      fertilizing_frequency_days = NOT SCHEDULED (no fertilizing task created)
      next_due_at = Date.now() + 7 * 86_400_000  (7 days from now)
```

**Fallback characteristics:**

| Property | Value |
|---|---|
| Watering interval | 7 days (hardcoded) |
| Fertilizing | Not scheduled — null profile produces no fertilizing task |
| User notification of fallback | NONE — "Water today", "Due in N days" badges are identical for recognized and unrecognized species |
| `SpeciesResolutionContext.method` | `"default_fallback"` — logged in the return value but immediately discarded |
| Distinguishable from a real 7-day species | NO — a Pothos (genuine 7-day species) and an unrecognized species both produce identical plant records |

**Fallback is triggered by three distinct conditions, all producing identical output:**

1. **Empty species field** — user left species blank; `species_name = NULL` in DB; ilike branch skipped; default applied immediately
2. **Unrecognized species** — user typed a species name that produced no ilike match; default applied
3. **PostgREST error during lookup** — network failure or Supabase error silently produces `data = null`; default applied

All three produce `frequency_days = 7` with no distinguishing marker in the DB.

---

## SCHEDULER ISOLATION

### Lack of Canonical Dependency

The active scheduler has **zero dependency on canonical infrastructure** at any layer:

| Canonical object | Referenced in active scheduler code? |
|---|---|
| `canonical_species` table | ❌ NO |
| `plant_aliases` table | ❌ NO |
| `collapse_mappings` table | ❌ NO |
| `canonical_species_id` on any table | ❌ NO — underscore-prefixed parameter accepted but never used |
| `plant_care_profiles.canonical_species_id` | ❌ NO — care profiles queried by `species_name ILIKE` only |
| `SpeciesResolutionMethod` enum values other than `ilike_species_name` / `default_fallback` | ❌ NEVER REACHED |

**Isolation proof:** `generateDefaultCareTasks(plantId, speciesName, _canonicalSpeciesId?)` is called as `generateDefaultCareTasks(plantCore.id, plantCore.species_name)` — `canonical_species_id` is never passed. Even if it were passed, the underscore-prefix parameter (`_canonicalSpeciesId`) is not forwarded to any routing slot. The canonical routing slot that would use it (`careProfiles.ts:98–105`) is commented out.

The scheduler produces identical output whether `canonical_species_id` is `NULL`, `undefined`, or a valid PLANT_0001-format ID on the `plants` row.

---

### Lack of Alias Dependency

No alias data is queried, loaded, or consulted at any point in the active scheduler:

```
generateDefaultCareTasks(plantId, speciesName):
  ↓
resolveSpeciesProfile({ species_name: speciesName }):
  ↓
[alias_lookup slot — COMMENTED OUT — careProfiles.ts:107–114]
  ↓
lookupBySpeciesNameIlike(speciesName):      ← only active lookup
  SELECT * FROM plant_care_profiles WHERE species_name ILIKE '%{speciesName}%'
```

`plant_aliases` is not queried. `lookupByAlias` is not called. The `plant_aliases` table does not exist in the live DB. Even if it did exist with data, the alias routing slot being commented out means it would not be reached.

---

### Lack of Rebinding

The scheduler cannot recompute or update an existing plant's care schedule through any in-app action:

**Actions that do NOT trigger rebinding:**

| User action | DB mutation | Care schedule effect |
|---|---|---|
| Edit plant name (`display_name`) | UPDATE plants | None — care tasks unchanged |
| Edit species name (`species_name`) | UPDATE plants | None — care tasks unchanged |
| Edit room location | UPDATE plants | None |
| Edit notes | UPDATE plants | None |
| Water plant | UPDATE care_tasks (last_completed_at, next_due_at); INSERT care_logs | `frequency_days` unchanged; countdown resets |
| Delete and recreate plant | DELETE plants (cascade); INSERT plants; INSERT care_tasks | Fresh task generation — this is the only way to re-derive `frequency_days` |

**Rebinding invariant:** A plant created with species "Cactus" (30-day profile) that is subsequently edited to species "Maidenhair Fern" (3-day profile) retains 30-day watering forever. The care task is set at creation and cannot be changed through the UI.

---

### Lack of Seasonal Activation

All seasonal scheduler infrastructure is written but completely inactive:

**Seasonal infrastructure status:**

| Seasonal component | File | Status |
|---|---|---|
| `Season` type (`"spring"` \| `"summer"` \| `"autumn"` \| `"winter"`) | `types/canonical.ts` | Typed — never used at runtime |
| `_season` parameters on scheduler functions | `careProfiles.ts` | Underscore-prefixed — accepted, never used |
| Seasonal routing slots in `resolveSpeciesProfile` | `careProfiles.ts` | All commented out |
| `seasonal_watering_adjustment` field on `PlantCareProfile` | `types/plant.ts` | Typed — no DB column exists for it |
| Season detection logic | (any file) | Not implemented — no function computes current season |
| Seasonal frequency data in `plant_care_profiles` | Live DB | Not present — no seasonal frequency columns exist |

**Seasonal activation invariant:** The active scheduler applies identical `frequency_days` in all four seasons. No seasonal variation in watering interval is possible in the current runtime regardless of the time of year.

---

## KNOWN SCHEDULER GOVERNANCE DEBT

### `next_due_at` Write/Read Divergence

**Severity: HIGH — guaranteed failure before seasonal activation**

This is the most significant structural debt in the scheduler. `next_due_at` is written by two code paths and read by zero UI functions.

**Current state — the values agree:**  
`useWaterPlant` writes `next_due_at = Date.now() + frequency_days * 86_400_000`.  
`getDaysUntilWatering` computes `next = last_completed_at + frequency_days * 86_400_000`.  
Since `last_completed_at` is set to `Date.now()` at the same watering event, both produce the same future timestamp. The divergence is latent.

**Future state — the values will disagree:**  
When any system writes a different `next_due_at` (seasonal scheduler applying a season-adjusted interval, an admin tool pushing a watering, a vacation-mode feature deferring the next due date), the DB value and the computed UI value will differ silently. The user sees a countdown that does not match what the DB considers scheduled.

**Concrete failure example:**  
Monstera on a 7-day schedule watered today. Seasonal scheduler fires and writes `next_due_at = Date.now() + 10_days` (winter adjustment). `getDaysUntilWatering` still computes `last_completed_at + 7 days` → shows "Due in 7 days." DB says "Due in 10 days." The plant is watered 3 days early from the DB perspective. Historical data is corrupted.

**Required fix (independent of schema migration):**
```typescript
export function getDaysUntilWatering(plant: Plant): number {
  const task = getWateringTask(plant);
  if (!task?.active_status) return 0;
  // Read next_due_at directly when available
  if (task.next_due_at) {
    const diff = Math.ceil(
      (new Date(task.next_due_at).getTime() - Date.now()) / 86_400_000
    );
    return Math.max(0, diff);
  }
  // Fallback: compute from last_completed_at + frequency_days
  if (!task.last_completed_at || !task.frequency_days) return 0;
  const next = new Date(task.last_completed_at).getTime() + task.frequency_days * 86_400_000;
  return Math.max(0, Math.ceil((next - Date.now()) / 86_400_000));
}
```

This fix has no schema migration dependency — `next_due_at` already exists in the live DB. It can be deployed at any time and is a prerequisite for all future scheduler enhancements.

---

### Static Interval Assumptions

**Severity: MEDIUM — limits scheduler expressiveness; no current runtime failure**

The following values are hardcoded and cannot be overridden by configuration, user preference, or species data:

| Hardcoded value | Location | Value | What it controls |
|---|---|---|---|
| `DEFAULT_WATERING_DAYS` | `careProfiles.ts` | `7` | Fallback watering interval for unmatched species |
| `86_400_000` | `careProfiles.ts`, `usePlants.ts`, `types/plant.ts` | ms per day | All duration computations (written 3 ways across 3 files) |
| `d <= 2` threshold | `PlantCard.tsx` | `2` | "Due soon" warning boundary |
| `daysLeft === 1` branch | `PlantCard.tsx` | `1` | Singular vs. plural day label |
| `Math.ceil` rounding | `types/plant.ts:245` | Ceiling | Always rounds partial days UP — user sees longer remaining time than actual |

**Static interval debt — the `86_400_000` inconsistency:**  
The milliseconds-per-day constant is expressed three different ways across the codebase:
- `careProfiles.ts`: `24 * 60 * 60 * 1000` (explicit product)
- `usePlants.ts`: `24 * 60 * 60 * 1000` (explicit product)  
- `types/plant.ts`: `24 * 60 * 60 * 1000` (explicit product)

All three evaluate to `86_400_000` and are numerically identical. The risk is maintainability — a future change to one location (e.g., introducing a named constant) must be applied to all three. There is no shared constant definition.

**DST assumption — days are always 24 hours:**  
The computation `frequency_days * 24 * 60 * 60 * 1000` assumes all days are exactly 24 hours. On DST transition days (23-hour and 25-hour days), the computed `next_due_at` drifts by ±1 hour relative to the calendar day. Over a year, this drift accumulates but is bounded at ±1 hour per transition (2 events per year). For a plant care app, this drift is operationally negligible but architecturally impure.

---

### Fallback Approximations

**Severity: MEDIUM — affects data quality; no user-facing failure**

The 7-day fallback applies to all plants whose species is not recognized by the ilike lookup. This creates a dataset where it is impossible to distinguish:
- Plants with a genuine 7-day care profile (e.g., Pothos)
- Plants with an unrecognized species that received the fallback
- Plants with no species entered that received the fallback
- Plants whose species lookup failed due to a Supabase error that received the fallback

All four categories produce `frequency_days = 7` with `species_resolution_method = NULL` (column absent pre-migration). Post-migration, `species_resolution_method = NULL` means the shim was active — but `"default_fallback"` vs `"ilike_species_name"` are still indistinguishable because `SpeciesResolutionContext` is discarded and never written.

**Fertility scheduling approximation:**  
When no species profile is found, no fertilizing care task is created. This is intentional (null profile → no fertilizing default) but creates an invisible asymmetry: plants with recognized species have both watering and fertilizing tasks; unrecognized species plants have only watering tasks. No UI surface communicates this absence.

---

### Scheduler Drift Risks

**Severity: MEDIUM (pre-seasonal); HIGH (post-seasonal-activation)**

**Drift Risk 1 — Device clock drift:**  
All scheduling is computed against `Date.now()` — the device local clock. If a user's device clock is incorrect (common on devices with auto-time disabled), the countdown computed by `getDaysUntilWatering` will be wrong by the same magnitude. A device set 24 hours ahead will always show plants as overdue; a device set 24 hours behind will show plants as not due when they are. The Supabase DB stores UTC timestamps — these are authoritative — but the app never uses the DB's time as the reference clock.

**Drift Risk 2 — Clock source disagreement between write and read:**  
`next_due_at` is computed at write time using the device clock at the moment of watering. `getDaysUntilWatering` computes against the device clock at the moment of render. If the device clock changes between these two events (e.g., NTP sync corrects a drift), the stored `next_due_at` and the fresh `Date.now()` use different clock references. This produces a one-time countdown jump when the clock is corrected.

**Drift Risk 3 — Cache staleness window:**  
React Query serves cached data for up to 30 seconds (`staleTime: 30_000`). During this window, `getDaysUntilWatering` computes against `Date.now()` (current) but `last_completed_at` from a potentially 30-second-old cache entry. For care scheduling purposes, 30 seconds of staleness is operationally negligible.

**Drift Risk 4 — Seasonal vs. static divergence (latent, post-seasonal-activation):**  
As documented in §`next_due_at` write/read divergence: when the seasonal scheduler writes a season-adjusted `next_due_at`, the static `getDaysUntilWatering` computation will diverge from the DB value. This drift grows linearly with the magnitude of the seasonal adjustment and compounds over multiple watering cycles.

---

## FUTURE SCHEDULER ACTIVATION DEPENDENCIES

### Seasonal Scheduling

**Description:** Watering intervals adjust based on the current season. Plants water more frequently in summer (higher growth rate, faster moisture loss) and less frequently in winter (dormancy, reduced evaporation).

**Prerequisites:**

| # | Dependency | Type | Current state | Notes |
|---|---|---|---|---|
| 1 | **`getDaysUntilWatering` reads `next_due_at`** | Code — critical fix | ❌ READS `last_completed_at + freq` | Independent of migration; fix first |
| 2 | Seasonal frequency columns added to `plant_care_profiles` | DB — schema | ❌ NOT DEFINED in any SQL file | Schema must be designed and added |
| 3 | `supabase-migration-v2.sql` applied | DB — schema | ❌ UNAPPLIED | Required for canonical_species_id if seasonal uses it |
| 4 | Seasonal frequency data authored for all species | DB — data | ❌ NO DATA | Requires domain knowledge per species |
| 5 | Season detection function authored | Code | ❌ NOT IMPLEMENTED | No `getCurrentSeason()` function exists |
| 6 | Seasonal routing slots uncommented in `resolveSpeciesProfile` | Code | ❌ ALL COMMENTED OUT | `_season` parameters already accept the value |
| 7 | Seasonal frequency forwarded through `generateDefaultCareTasks` | Code | ❌ `_season` param unused | Underscore prefix — must be wired through |
| 8 | `next_due_at` writer updated to use seasonal interval | Code | ❌ USES `frequency_days` only | `useWaterPlant` must apply seasonal offset |

**Strict ordering required:**  
Dependency 1 must precede Dependency 8. If the `next_due_at` writer is updated to use seasonal intervals before `getDaysUntilWatering` is fixed to read `next_due_at`, the UI and DB will compute different countdowns for every plant, silently. This is the only sequencing constraint with a guaranteed data corruption consequence.

---

### Canonical Rebinding

**Description:** When a plant's `canonical_species_id` is set (via Phase 2.2 onboarding or backfill), its existing `care_tasks.frequency_days` is updated to match the canonical species' care profile. Existing `next_due_at` is recalculated.

**Prerequisites:**

| # | Dependency | Type | Current state | Notes |
|---|---|---|---|---|
| 1 | All Phase B2.2A dependencies satisfied | Mixed | ❌ NOT STARTED | Canonical routing, canonical_species seeded, `plant_care_profiles` backfilled |
| 2 | `canonical_species_id` written to `plants` rows | DB — data | ❌ NULL on all rows | Requires Phase 2.2 onboarding activation |
| 3 | Rebinding logic authored in `useUpdatePlant` | Code | ❌ NOT IMPLEMENTED | No existing code or stub |
| 4 | `getDaysUntilWatering` reads `next_due_at` | Code | ❌ READS computed value | Must be fixed before rebinding updates `next_due_at` |
| 5 | `care_tasks.canonical_species_id` populated | DB — data | ❌ NULL (column absent) | Requires migration + Phase 2.2 task generation |

**New implementation required:**  
Canonical rebinding requires net-new code in `useUpdatePlant` (or a separate `useRebindPlant` hook) that calls `resolveSpeciesProfile` with the new canonical ID, compares the resulting `frequency_days` to the current task value, and issues an UPDATE to `care_tasks` if different. No commented-out stub for this exists.

---

### Adaptive Recurrence

**Description:** Watering intervals adjust based on observed care history — a plant consistently watered early or late receives a nudged interval that better matches the user's actual behavior and the plant's observed moisture needs.

**Prerequisites:**

| # | Dependency | Type | Current state | Notes |
|---|---|---|---|---|
| 1 | Canonical rebinding operational | Mixed | ❌ NOT STARTED | Requires accurate base intervals to adapt from |
| 2 | `care_logs` has sufficient historical data | DB — data | ❌ SPARSE | Requires sustained user engagement across multiple watering cycles |
| 3 | Adaptive recurrence algorithm designed | Design | ❌ NOT DESIGNED | No algorithm, no parameters, no prototype |
| 4 | Adaptive interval computation function authored | Code | ❌ NOT IMPLEMENTED | No code or stub exists |
| 5 | `getDaysUntilWatering` reads `next_due_at` | Code | ❌ READS computed value | Mandatory prerequisite |
| 6 | Interval update path in `useWaterPlant` or separate hook | Code | ❌ NOT IMPLEMENTED | Must write adapted `frequency_days` back to `care_tasks` |
| 7 | User consent / opt-in for adaptive scheduling | Design | ❌ NOT DESIGNED | Changing a plant's schedule without user awareness is a UX risk |

**Maturity note:** Adaptive recurrence is the most design-immature future scheduler feature. It has no implementation skeleton, no algorithm design, and no data model. It is included here as a dependency boundary document — it cannot begin until all prior scheduler layers (seasonal, canonical rebinding) are stable.

---

### Care Intelligence Enrichment

**Description:** Scheduler decisions incorporate signals beyond watering frequency — soil moisture, light levels, seasonal growth stage, pot size, plant age, recent health log entries — to produce holistic care recommendations rather than fixed-interval reminders.

**Prerequisites:**

| # | Dependency | Type | Current state | Notes |
|---|---|---|---|---|
| 1 | Adaptive recurrence operational | Mixed | ❌ NOT STARTED | Requires working adaptive layer as foundation |
| 2 | Additional sensor/input fields added to `plants` or `health_logs` | DB — schema | ❌ NOT DEFINED | Soil moisture, pot size, light exposure not in any schema |
| 3 | `health_logs` populated with data | DB — data | ❌ EMPTY (no UI to create entries) | Table exists; no creation path in app |
| 4 | `journal_entries` populated with data | DB — data | ❌ EMPTY (no UI to create entries) | Table exists; no creation path in app |
| 5 | Care intelligence model designed | Design | ❌ NOT DESIGNED | No algorithm, no signal weighting, no output format |
| 6 | Care recommendation rendering in UI | Code | ❌ NOT IMPLEMENTED | Current UI shows only day countdowns, not multi-signal recommendations |

**Maturity note:** Care intelligence enrichment is a future-phase capability with no implementation prerequisites satisfied. It is documented here as the terminal dependency of the scheduler activation chain — it cannot begin until all prior layers (seasonal, canonical, adaptive) are operational and generating the data it would consume.

---

## SCHEDULER BASELINE SUMMARY

| Property | Current value |
|---|---|
| **Scheduler model** | Static-interval, pull-based, client-side, creation-time-only |
| **Active computation** | `getDaysUntilWatering`: `last_completed_at + frequency_days` |
| **`next_due_at` utilization** | Write-only — stored, never read by UI |
| **Default interval** | 7 days (hardcoded `DEFAULT_WATERING_DAYS`) |
| **"Due soon" threshold** | 2 days (hardcoded `d <= 2`) |
| **Day length assumption** | 86,400,000 ms (no DST correction) |
| **Timezone handling** | None — device local clock only |
| **Clock source** | `Date.now()` — device |
| **Background computation** | NONE |
| **Push notifications** | NONE |
| **Canonical dependency** | NONE — fully isolated |
| **Alias dependency** | NONE — fully isolated |
| **Seasonal activation** | OFF — all slots commented out |
| **Rebinding** | OFF — no mechanism |
| **Fertilizing default** | NONE — null profile produces no fertilizing task |
| **User feedback on fallback** | NONE — silent 7-day default |
| **Highest active debt** | `next_due_at` write/read divergence — latent, activates on seasonal write |
| **Fix independent of migration** | `getDaysUntilWatering` → read `next_due_at` — can deploy now |

---

*This document is a read-only scheduler baseline snapshot. No application files, SQL files, or scheduler logic were modified in its generation. Supersede only after a confirmed scheduler behavior change.*
