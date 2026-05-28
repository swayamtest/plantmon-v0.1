# G2.5 RUNTIME VALIDATION
**PLANTMON — Post G2.4 Alignment Pass**
**Status:** READ-ONLY · No code changes made
**Date:** 2026-05-28
**Scope:** Runtime flow validation across 8 areas after G2.4 type and mutation fixes.

---

## Sources Traced

| File | Role |
|---|---|
| `components/PlantForm.tsx` | Shared create/edit form — field bindings, `PlantInput` construction |
| `hooks/usePlants.ts` | All mutations + queries (full 208 lines, current state) |
| `app/plant/new.tsx` | Create screen |
| `app/plant/[id].tsx` | Detail + edit screen |
| `app/(tabs)/index.tsx` | Plant list + scheduler filter UI |
| `types/plant.ts` | All domain interfaces + scheduler helpers |
| `lib/careProfiles.ts` | `generateDefaultCareTasks`, `resolveSpeciesProfile` |
| `lib/supabase.ts` | Client init + credential swap shim |
| `supabase-setup.sql` / `supabase-migration-v2.sql` | DB schema ground truth |

---

## Flow 1 — Plant Creation

**Path:** `new.tsx` → `PlantForm` → `useCreatePlant` → `generateDefaultCareTasks`

**Trace:**

1. `PlantForm` builds `PlantInput`:
   ```ts
   { display_name, species_name, user_entered_name: speciesName, room_location, notes }
   ```
   `user_entered_name` is populated here intentionally — the shim in `useCreatePlant` strips it before DB write.

2. `useCreatePlant` shim destructs and discards all 4 Phase 2.1 identity fields. INSERT to `plants` contains only v0.1-compatible columns plus `user_id`.

3. `generateDefaultCareTasks(plantId, species_name)` runs post-insert. Creates one active watering task via legacy `ilike` care profile lookup. Falls back to 7-day frequency if no profile matches or `plant_care_profiles` is empty.

4. Re-fetch with `PLANT_SELECT = "*, care_tasks(*)"` — plant returned with care task joined.

5. `queryClient.invalidateQueries(["plants"])` — list refreshes.

**Coexistence check:** ✅ Shim active. No canonical fields written to DB. `user_entered_name` captured in `PlantInput` type for future use but silently dropped at DB boundary.

**Risks:**
- `user!.id` non-null assertion on line 71. Safe in practice — route is auth-gated and `enabled: !!user` on all queries — but a hard crash (not a graceful error) if the invariant breaks. Not MVP-blocking.
- If `plant_care_profiles` table is empty (DB provisioned via migration-only path without seed data), `generateDefaultCareTasks` falls back to a 7-day watering task silently. App remains fully functional; user sees no error. Acceptable fallback.

**Status: ✅ SAFE**

---

## Flow 2 — Plant Editing

**Path:** `[id].tsx` (edit mode) → `PlantForm` (with `initialValues`) → `useUpdatePlant`

**Trace:**

1. `PlantForm` receives `initialValues={plant}`. Initializes state from `plant.display_name`, `plant.species_name`, `plant.room_location`, `plant.notes` only. The 15 other Plant fields (including all Phase 2.1 identity fields) are not surfaced in the form and cannot be modified through this flow.

2. On submit, `PlantInput` is constructed — same shape as creation. `user_entered_name` is set to the current species input value.

3. `useUpdatePlant` shim strips same 4 fields. UPDATE payload: `{ display_name, species_name, room_location, notes, updated_at }`.

4. `updated_at` is written explicitly in code (`new Date().toISOString()`). The DB trigger `plants_updated_at` also fires and sets `updated_at = NOW()` server-side. The trigger value wins (applied after the row write). No data loss — redundant write is harmless.

5. Returns full plant with care tasks via `PLANT_SELECT`. Invalidates both `["plants"]` and `["plant", id]`.

**Coexistence check:** ✅ Shim active. `canonical_species_id` on the existing plant record is **not touched** — UPDATE payload does not include it, so any future Phase 2.2 value will survive an edit. The identity layers are fully protected from the edit form.

**Risks:** None MVP-blocking.

**Status: ✅ SAFE**

---

## Flow 3 — Water Plant

**Path:** `[id].tsx` `handleWater` → `useWaterPlant`

**Trace (current state after G2.4 fix):**

1. Fetches `canonical_species_id` from `plants` for this `plantId` (passive read — no routing):
   ```ts
   const { data: plantRow } = await supabase
     .from("plants").select("canonical_species_id").eq("id", plantId).maybeSingle();
   const canonicalSpeciesId = plantRow?.canonical_species_id ?? null;
   ```

2. INSERT to `care_logs`:
   ```ts
   { plant_id, canonical_species_id: canonicalSpeciesId, task_type: "watering", completed_at: now }
   ```
   `canonicalSpeciesId` is `null` for all current plants (shim blocks writing canonical identity). The field is correctly written; the value is null until Phase 2.2 activation. **GAP-CL-001 resolved.**

3. Fetches active watering task:
   ```ts
   .select("id, frequency_days").eq("plant_id", plantId).eq("task_type", "watering").maybeSingle()
   ```

4. **If task found:** UPDATE `care_tasks` → `{ last_completed_at: now, next_due_at: now + frequency_days }`. Both fields written together. `next_due_at` stays current after every watering.

5. **If no task found (edge case):** INSERT minimal task with `last_completed_at: now`, no `frequency_days`, no `next_due_at`. Subsequent watering will hit the UPDATE path.

6. Invalidates `["plants"]` — UI refreshes.

**Coexistence check:** ✅ No canonical routing. Fetching `canonical_species_id` is a passive read. No Phase 2.1 shims affected. No scheduler logic changed.

**Risk — `.maybeSingle()` without `active_status` filter (line 180):**
The care task query does not filter by `active_status = true`. If a plant has both an active and an inactive watering task row (possible through direct DB admin operations, not through any current UI path), `.maybeSingle()` throws a Supabase error (>1 row returned). In practice there is no deactivation flow in the app UI, so this condition cannot be reached through normal user actions today. **Not MVP-blocking.** Worth adding `.eq("active_status", true)` as a hardening step before any task deactivation feature is built.

**Status: ✅ SAFE**

---

## Flow 4 — Care Task Continuity

**Path:** `useCreatePlant` → `generateDefaultCareTasks` (careProfiles.ts)

**Trace:**

1. Checks for existing active watering task:
   ```ts
   .select().eq("plant_id", id).eq("task_type", "watering").eq("active_status", true).maybeSingle()
   ```
   Correctly filtered by `active_status = true`. If task already exists, returns early — no duplicate.

2. Resolves care profile via legacy `ilike` path (`resolveSpeciesProfile`). Phase 2.2 canonical path is a confirmed stub returning `null` — not reached.

3. Task inserted with `frequency_days` from profile (or 7-day fallback) and `next_due_at: new Date().toISOString()` (today). New plants show as "needs watering" immediately — intentional UX behavior.

4. The `PRE_DATASET_HARDENING_MIGRATION_v1.sql` unique partial index `care_tasks_plant_task_active_unique` on `(plant_id, task_type) WHERE active_status = TRUE` enforces at DB level that only one active watering task per plant can exist. App-level guard + DB constraint are both present.

**Coexistence check:** ✅ `generateDefaultCareTasks` reads `canonical_species_id` from `plantCore` but only passes it to `resolveSpeciesProfile` where the canonical branch is a no-op stub. No canonical routing activated.

**Status: ✅ SAFE**

---

## Flow 5 — care_logs Insertion Behavior

**Current state (post G2.4):**

Every watering event inserts:
```ts
{ plant_id, canonical_species_id: null, task_type: "watering", completed_at }
```

| Property | Before G2.4 | After G2.4 |
|---|---|---|
| `canonical_species_id` written | ❌ field absent | ✅ field present, value `null` |
| `task_type` | `"watering"` | `"watering"` (unchanged) |
| `completed_at` | `now` ISO string | `now` ISO string (unchanged) |
| `notes` | absent (DB defaults null) | absent (DB defaults null) |

RLS: `care_logs` INSERT policy uses `WITH CHECK` (corrected in PRE_DATASET migration, Section D3). Authorization: confirms `plants.user_id = auth.uid()` before allowing insert. Correct.

`care_logs` is append-only by design (no UPDATE in any hook). Confirmed — `useWaterPlant` only calls `.insert()` on this table.

**Status: ✅ SAFE**

---

## Flow 6 — Scheduler Continuity

**Client-side schedule computation — unchanged from pre-G2.4:**

```ts
// types/plant.ts getDaysUntilWatering
const task = plant.care_tasks?.find(t => t.task_type === "watering" && t.active_status);
const nextWater = new Date(task.last_completed_at).getTime() + task.frequency_days * 86400000;
return Math.ceil((nextWater - Date.now()) / 86400000);
```

- Reads `last_completed_at` and `frequency_days` from the in-memory `care_tasks` join
- Never reads `next_due_at` from DB
- Computed at render time, client-side only
- `needsWatering(plant)` calls `getDaysUntilWatering(p) <= 0`

**`index.tsx` filter tabs:**
- "Water today" → `needsWatering(p)` → client-computed
- "Due soon" → `getDaysUntilWatering(p) > 0 && <= 2` → client-computed

**DB state of `next_due_at` post-G2.4:** Now kept current after every watering event (`now + frequency_days`). The client scheduler does not read it — this creates no conflict. The DB column being accurate is additive; it does not break the existing client-side computation.

**No background jobs. No server-side scheduling. No seasonal logic. No canonical scheduler routing.** Scheduler behavior is identical to pre-G2.4.

**Status: ✅ SAFE**

---

## Flow 7 — Supabase Read/Write Compatibility

| Concern | Finding |
|---|---|
| `PLANT_SELECT = "*, care_tasks(*)"` | Wildcard — forward-compatible. Pre-migration returns v0.1 columns; post-migration returns all columns with new ones as `null`. No query change needed at any migration stage. |
| Credential swap | `lib/supabase.ts` detects swap via `startsWith("https://")` and corrects at runtime. Mitigation confirmed active. |
| RLS — plants | User-scoped: SELECT/INSERT/UPDATE/DELETE all require `auth.uid() = user_id`. Correct. |
| RLS — care_tasks | Via plant ownership join. INSERT/UPDATE now use correct `WITH CHECK` clause (PRE_DATASET migration). |
| RLS — care_logs | Via plant ownership join. INSERT uses correct `WITH CHECK` (PRE_DATASET migration). Append-only in practice. |
| `usePlants` query enabled guard | `enabled: !!user` — no query fires when unauthenticated. Correct. |
| `usePlant(id)` enabled guard | `enabled: !!user && !!id` — correct. |
| Phase 2.1 column reads | New columns arrive as `null` (not `undefined`) on post-migration rows — `getSchemaMigrationStatus()` in `runtimeValidation.ts` correctly distinguishes these cases with `"canonical_species_id" in plantRow`. |

**Status: ✅ SAFE**

---

## Flow 8 — TypeScript / Runtime Integrity

| Check | Result |
|---|---|
| `Plant` interface vs `plants` table | ✅ Fully aligned (19 columns) |
| `CareTask` interface vs `care_tasks` table | ✅ Aligned including `canonical_species_id?: string \| null` |
| `CareLog` interface vs `care_logs` table | ✅ Aligned including `canonical_species_id` and `image_url` |
| `PlantCareProfile` interface vs DB | ✅ Fully aligned |
| `CanonicalSpecies` / `PlantAlias` / `CollapseMapping` | ✅ Fully aligned |
| `PlantInput` type | ✅ Includes `user_entered_name` for future use; shim strips it pre-migration |
| `pnpm --filter @workspace/mobile run typecheck` | ✅ Clean — zero errors after G2.4 changes |
| `canonical_species_id` in `useWaterPlant` plants fetch | ✅ Returns `null` safely pre-2.2; no type errors |
| `TaskType` / `TaskTypeLegacy` usage | ✅ `"watering" as TaskType` casts are consistent across all INSERT sites |
| `generateDefaultCareTasks` return | Async void — no return value expected by caller. Correct. |

**Status: ✅ SAFE**

---

## Canonical Coexistence Validation

| Coexistence Property | Confirmed |
|---|---|
| Phase 2.1 shim in `useCreatePlant` strips 4 identity fields | ✅ Active — lines 60–66 |
| Phase 2.1 shim in `useUpdatePlant` strips 4 identity fields | ✅ Active — lines 110–116 |
| `canonical_species_id` on existing plant records cannot be overwritten via edit form | ✅ Not in UPDATE payload |
| `resolveSpeciesProfile` Phase 2.2 canonical branch returns `null` (stub) | ✅ Inert — no DB query fires |
| `useWaterPlant` canonical fetch is passive read only | ✅ No routing, no activation |
| `user_entered_name` captured in `PlantInput` but stripped at DB boundary | ✅ Available post-migration; no premature write |
| No seasonal scheduling logic executed | ✅ Confirmed — `PlantCareProfile` seasonal fields typed but no read path active |
| No `canonical_species`, `plant_aliases`, or `collapse_mappings` queries in any screen or hook | ✅ Confirmed — no code references these tables outside `runtimeValidation.ts` (diagnostics only) |

---

## MVP-Blocking Findings

**None.**

---

## Non-Blocking Items (noted for future hardening)

| Item | Location | Notes |
|---|---|---|
| `user!.id` non-null assertion | `usePlants.ts` line 71 | Safe today due to auth gating; becomes fragile if route protection loosens |
| `.maybeSingle()` without `active_status` filter | `usePlants.ts` line 180 | Throws if a plant somehow has both active and inactive watering tasks; no current UI path can create this state |
| `plant_care_profiles` seed dependency | `careProfiles.ts` | Silent 7-day fallback if table is empty; app works, care profiles don't |

---

## Runtime State

```
RUNTIME STATE: SAFE
```

All 8 flows validated. Canonical coexistence is passive throughout. No activation leakage detected. No MVP-blocking issues found. G2.4 alignment changes (care_logs `canonical_species_id` write) are correctly integrated and behave as specified.
