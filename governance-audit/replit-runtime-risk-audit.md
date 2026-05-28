# PLANTMON — Runtime Activation Risk Audit

**Scope:** All runtime behavior — startup sequence, query lifecycle, mutation triggers, coexistence layer, schema interactions  
**Type:** Read-only runtime risk documentation  
**Generated:** May 2026  
**Source:** Direct file inspection — all findings are line-referenced  

---

## EXECUTIVE SUMMARY

PLANTMON has **no hidden automatic activations** in its current implementation. No migration runs at startup. No canonical routing fires. No ORM synchronization occurs. No task regeneration happens on a schedule. The runtime is deliberately conservative — all Phase 2.2 activation points are explicitly commented out and require manual uncommenting.

However, several **passive risks** exist that could cause unintended behavior when Phase 2.1 or Phase 2.2 activations occur, when the schema migration runs, or when React Query's cache behaves in edge cases. This audit documents those risks with severity and coexistence implications.

**The single highest-severity unmanaged risk** in the current runtime is the `next_due_at` write / `getDaysUntilWatering` read divergence — `next_due_at` is stored but the UI never reads it, meaning any future system that writes `next_due_at` will have zero effect on the countdown the user sees.

---

## 1 — HIDDEN CANONICAL ROUTING ACTIVATION

### Finding 1.1 — `resolveSpeciesProfile` canonical slot: no auto-activation possible

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 98–114

```typescript
// if (input.canonical_species_id) {
//   const profile = await lookupByCanonicalId(input.canonical_species_id);
//   if (profile) return { profile, context: { method: "canonical_id_lookup", resolved: true } };
// }
//
// if (input.species_name?.trim()) {
//   const profile = await lookupByAlias(input.species_name);
//   if (profile) return { profile, context: { method: "alias_lookup", resolved: true } };
// }
```

**Severity:** LOW  
**Why it matters:** These slots are comments — they cannot be activated by any runtime event, environment variable, database state, or configuration change. There is no feature flag, no environment-conditional, no dynamic import, and no reflection mechanism that could activate them. Activation requires a source code edit.  
**Coexistence implication:** The ilike fallback path (`lookupBySpeciesNameIlike`) remains the only active resolution path regardless of what is in the Supabase DB. Even if `canonical_species` is fully seeded and `plant_care_profiles.canonical_species_id` is backfilled, canonical routing does not activate automatically.

---

### Finding 1.2 — `PLANT_SELECT = "*, care_tasks(*)"` will silently return canonical columns post-migration

**File:** `artifacts/mobile/hooks/usePlants.ts` — line 9

```typescript
const PLANT_SELECT = "*, care_tasks(*)";
```

**Severity:** MEDIUM  
**Why it matters:** When `supabase-migration-v2.sql` is applied, PostgREST will begin returning the new Phase 2.1 columns (`canonical_species_id`, `user_entered_name`, `canonical_species_name`, `species_resolution_method`) in every `SELECT *` response. This is documented as intentional forward-compatibility (line 8 comment), but it means:

- Every `Plant` object in the React Query cache will start carrying these new fields as `null` immediately after migration, without any code change
- TypeScript types already declare these fields as `string | null` — so no type error
- Any code that checks `"canonical_species_id" in plantRow` (e.g., `runtimeValidation.ts:82`) will start returning `true` for the `"migrated"` branch

**The silent flip:** `getSchemaMigrationStatus()` (`runtimeValidation.ts:79–85`) detects migration by checking `"canonical_species_id" in plantRow`. Pre-migration: `undefined` → `"not_migrated"`. Post-migration: `null` → `"migrated"`. This flip happens the first time any plant is fetched after the migration runs — no app restart required.

**Coexistence implication:** Because `getSchemaMigrationStatus` is never called anywhere (zero call sites), this flip is academically correct but has no runtime effect. If it were wired into a Phase 2.2 activation gate, the gate would open automatically on the first post-migration plant fetch.

---

### Finding 1.3 — `lookupByAlias` and `lookupByCanonicalId`: both commented at two levels

**File:** `artifacts/mobile/lib/careProfiles.ts`

Both Phase 2.2 lookup functions are commented out at two independent levels:
1. The function bodies themselves (lines 62–71, 74–88)
2. Their call sites in `resolveSpeciesProfile` (lines 98–105, 107–114)

**Severity:** LOW  
**Coexistence implication:** Even partial uncommenting (e.g., uncommenting the function body but leaving the call site commented) produces no runtime effect — the function exists but is never invoked. Both layers must be uncommented together for activation.

---

## 2 — AUTOMATIC SCHEDULER REBINDING

### Finding 2.1 — No automatic scheduler rebinding exists

There is no mechanism — cron job, background timer, scheduled function, Supabase trigger, or React lifecycle hook — that automatically recalculates or rebinds watering schedules. The scheduler is entirely pull-based and reactive.

**Severity:** LOW (no risk from what exists)  
**Files:** All scheduler files — `types/plant.ts`, `lib/careProfiles.ts`, `hooks/usePlants.ts`  
**Why it matters:** The absence of automatic rebinding is itself a governance fact — watering schedules are static once set. `frequency_days` does not change unless a developer writes a new code path to update it.

---

### Finding 2.2 — React Query `staleTime: 30_000` creates a 30-second stale window

**File:** `artifacts/mobile/app/_layout.tsx` — lines 20–27

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,     // 30 seconds
    },
  },
});
```

**Severity:** MEDIUM  
**Why it matters:** After a successful fetch, plant data is considered "fresh" for 30 seconds. During this window:
- `getDaysUntilWatering` computes from cached `last_completed_at` + `frequency_days` — both may be stale
- A plant watered on one device will appear un-watered on another device for up to 30 seconds
- After `useWaterPlant` succeeds, it calls `queryClient.invalidateQueries({ queryKey: ["plants"] })` (`usePlants.ts:196`) — this invalidates the cache immediately for the watering device. But any other component that hasn't re-fetched yet uses the stale cached value for up to 30 seconds.

**Coexistence implication:** When `supabase-migration-v2.sql` is applied mid-session, the 30-second stale window means some components may be holding pre-migration plant shapes while the DB is already post-migration. The first response to return after migration will carry the new columns; subsequent responses within the 30-second window may serve the old cached shape. This resolves naturally on the next full cache invalidation.

---

### Finding 2.3 — `autoRefreshToken: true` causes silent background Supabase mutations

**File:** `artifacts/mobile/lib/supabase.ts` — line 16

```typescript
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,       // ← silent background token refresh
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

**Severity:** LOW  
**Why it matters:** `autoRefreshToken: true` means the Supabase JS client will silently POST to `auth/v1/token?grant_type=refresh_token` in the background when the JWT approaches expiry (typically around the 55-minute mark of a 60-minute JWT). This is:
- An automatic network mutation that occurs without any user action or application code trigger
- Not reflected in any React Query cache invalidation
- Not visible in any UI state
- Not guarded by any application-level error handler

**Coexistence implication:** If the token refresh fails (network error, Supabase Auth outage), the Supabase client may silently enter a de-authenticated state. Subsequent PostgREST queries will fail with RLS denials (PostgREST returns HTTP 200 with an empty array or HTTP 401, depending on RLS policy permissiveness). The application currently has no handler for this transition — `usePlants` would simply return empty data with no error surfaced.

---

## 3 — AUTOMATIC CANONICAL PROPAGATION

### Finding 3.1 — No automatic canonical propagation exists at any level

**Severity:** LOW (no risk from what exists; risk is from what's missing)

There is no database trigger, Supabase function, PostgREST hook, application background job, or React lifecycle effect that automatically propagates `canonical_species_id` to plant rows, care task rows, or care log rows.

| Layer | Automatic canonical propagation? | Evidence |
|---|---|---|
| Supabase DB triggers | ❌ NONE | No `CREATE TRIGGER` or `CREATE FUNCTION` in any SQL file for propagation |
| Supabase Edge Functions | ❌ NONE | No edge function files exist in the project |
| Application background job | ❌ NONE | No `setInterval`, `setTimeout`, or background task in any file |
| React Query background refetch | ❌ NONE (staleTime controls this) | `staleTime: 30_000` — no automatic propagation triggered by refetch |
| `onAuthStateChange` handler | ❌ NONE | Lines 36–39 of AuthContext.tsx only update `session` and `user` state |

**Why it matters:** When `supabase-migration-v2.sql` runs and the `canonical_species_id` column appears on `plants`, all existing plant rows will have `canonical_species_id = NULL`. Nothing will automatically fill them. A backfill migration must be manually authored and executed.

**Coexistence implication:** The coexistence design is correct — null canonical FK means "pre-Phase-2.2 plant" and the ilike fallback handles these plants correctly. No automatic propagation is needed or expected until Phase 2.2 activation is deliberately triggered.

---

### Finding 3.2 — No Supabase DB-level triggers defined in any SQL file

**Files:** `artifacts/mobile/supabase-setup.sql`, `artifacts/mobile/supabase-migration-v2.sql`, `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql`

The only trigger defined across all three SQL files is:

```sql
-- supabase-setup.sql — update_updated_at trigger
CREATE TRIGGER update_plants_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

This trigger only updates the `updated_at` timestamp on `plants` rows. It performs no canonical propagation, no task regeneration, no schema mutation, and no cross-table write.

**Severity:** LOW  
**Coexistence implication:** The `updated_at` trigger is the only automatic DB-side mutation. It fires on every `UPDATE` to `plants`, including the `useUpdatePlant` hook. It is safe and non-destructive.

---

## 4 — STARTUP MIGRATION EXECUTION

### Finding 4.1 — Zero migration code executes at application startup

**File:** `artifacts/mobile/app/_layout.tsx` — full file

The startup sequence is:

```
1. SplashScreen.preventAutoHideAsync()          — holds splash (line 18)
2. QueryClient instantiated                      — no SQL (lines 20–27)
3. useFonts() initiated                          — asset loading only (line 30)
4. Fonts loaded/error → SplashScreen.hideAsync() — display (lines 38–40)
5. AuthProvider mounts → supabase.auth.getSession() — READ ONLY (AuthContext:28)
6. supabase.auth.onAuthStateChange subscription  — event listener only (AuthContext:36)
7. expo-router Stack renders                     — routing only (lines 51–60)
```

Not one of these steps executes SQL, runs a migration, pushes schema changes, or calls any ORM synchronization function.

**Severity:** LOW (zero risk)  
**Why it matters:** A developer unfamiliar with the project might assume a framework (Drizzle, Prisma) runs schema sync at startup. It does not. The mobile app has no ORM. The `lib/db/` Drizzle setup applies only to the `api-server` artifact which has its own startup, not the mobile app.

**Coexistence implication:** The live Supabase DB schema is never altered by application startup. Schema changes are entirely manual (SQL Editor in Supabase Dashboard).

---

### Finding 4.2 — `supabase.auth.getSession()` is a READ-ONLY startup call

**File:** `artifacts/mobile/contexts/AuthContext.tsx` — lines 27–32

```typescript
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session: s } }) => {
    setSession(s);
    setUser(s?.user ?? null);
    setLoading(false);
  });
```

This call:
- Reads from `AsyncStorage` (local device) to check for a persisted session token
- If a persisted token exists, validates it against the Supabase Auth service (one HTTP GET)
- Sets React state only — no DB writes, no schema mutations, no cache population

**Severity:** LOW  
**Why it matters:** The session check runs on every app mount. If Supabase Auth is unreachable at startup, `getSession()` may hang or reject. The `loading: true` initial state means the app renders nothing (effectively a blank screen) until this resolves. There is no timeout or fallback render path if `getSession()` never resolves.

**Coexistence implication:** Auth state is independent of DB schema state. A schema migration can run mid-session without affecting the auth token or the session check.

---

### Finding 4.3 — `getSchemaMigrationStatus()` is defined but never called at startup

**File:** `artifacts/mobile/lib/runtimeValidation.ts` — lines 79–85

The function exists to detect whether `supabase-migration-v2.sql` has been applied by inspecting PostgREST response shapes. It is never called at startup, during navigation, or at any lifecycle hook.

**Severity:** MEDIUM  
**Why it matters:** There is no runtime guard that prevents Phase 2.1 shim removal or Phase 2.2 activation from being deployed before the migration runs. If a developer removes the shim without confirming the migration was applied, `useCreatePlant` will attempt to INSERT columns that don't exist, causing PostgREST `400` errors on all plant creation.

**Coexistence implication:** The safe deployment order is: apply migration → confirm → remove shim. But the application provides no automated enforcement of this order.

---

## 5 — IMPLICIT ORM SYNCHRONIZATION

### Finding 5.1 — PLANTMON mobile uses no ORM; no implicit sync is possible

**Severity:** LOW (zero risk)

The PLANTMON mobile artifact (`artifacts/mobile/`) has no ORM dependency. It uses `@supabase/supabase-js` — a PostgREST HTTP client. PostgREST does not perform schema sync, schema push, or schema inspection at runtime.

| ORM feature | Present in mobile artifact? |
|---|---|
| Schema push / `db push` | ❌ NO |
| Schema migration runner | ❌ NO |
| Runtime schema inspection | ❌ NO |
| Model-to-table sync | ❌ NO |
| Auto-generated SQL from types | ❌ NO |

**File:** `lib/db/` — Drizzle ORM  
**Severity:** LOW  
**Why it matters:** The Drizzle ORM in `lib/db/` targets the Express API server's PostgreSQL database (`DATABASE_URL`), not the Supabase DB. `pnpm --filter @workspace/db run push` (the Drizzle schema push command) would affect only the api-server's DB — an entirely separate database. The Supabase DB is unreachable by Drizzle.

**Coexistence implication:** Zero risk of accidental ORM-driven schema changes to the Supabase DB from either artifact.

---

### Finding 5.2 — TypeScript types and Supabase schema are hand-synchronized — no codegen

**Files:** `artifacts/mobile/types/plant.ts`, `artifacts/mobile/types/canonical.ts`

All TypeScript types (`Plant`, `PlantCareProfile`, `CareTask`, etc.) are manually authored. There is no Supabase-to-TypeScript codegen (`supabase gen types typescript`) configured or run.

**Severity:** MEDIUM  
**Why it matters:** Every time the Supabase schema changes (a migration runs), the TypeScript types must be manually updated to match. There is no automated check that types and schema are in sync. A column that exists in the DB but not in the TypeScript type is silently ignored by PostgREST responses. A column in the TypeScript type that doesn't exist in the DB is either:
- Stripped by the Phase 2.1 shim (for Phase 2.1 fields) — managed
- Silently returned as `undefined` in SELECT queries — unmanaged for other fields

**Coexistence implication:** The Phase 2.1 shim in `usePlants.ts` is the only automated protection against type/schema mismatch. For fields not covered by the shim, mismatch is silent.

---

## 6 — HIDDEN TASK REGENERATION

### Finding 6.1 — No automatic task regeneration; generation is call-site-only

**File:** `artifacts/mobile/lib/careProfiles.ts` — `generateDefaultCareTasks` (lines 187–244)

`generateDefaultCareTasks` is called from exactly one location:

**File:** `artifacts/mobile/hooks/usePlants.ts` — line 85

```typescript
await generateDefaultCareTasks(plantCore.id, plantCore.species_name);
```

This call occurs only inside `useCreatePlant.mutationFn` — triggered only when the user explicitly submits the "Add Plant" form. There is no other call site.

**Severity:** LOW  
**Why it matters:** Task regeneration cannot be triggered by:
- App startup
- Auth state change
- Cache refresh / background refetch
- React Query retry (line 22 in _layout.tsx: `retry: 1` retries the query, not the mutation)
- Plant edit (`useUpdatePlant` — no task generation at lines 102–131)
- Watering (`useWaterPlant` — updates existing tasks only)

---

### Finding 6.2 — The duplicate-task guard reads `active_status = true` only

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 195–203

```typescript
const { data: existing } = await supabase
  .from("care_tasks")
  .select("id")
  .eq("plant_id", plantId)
  .eq("task_type", "watering")
  .eq("active_status", true)        // ← only checks ACTIVE tasks
  .maybeSingle();

if (existing) return;
```

**Severity:** MEDIUM  
**Why it matters:** The guard prevents duplicate task creation only when an active (`active_status = true`) watering task exists. If a watering task has `active_status = false` (e.g., a future "deactivate task" feature, a manual DB update, or the "orphan quick-water" path which inserts with `active_status = NULL` → default `true`), the guard would NOT fire, and a second watering task would be created.

**The `PRE_DATASET_HARDENING_MIGRATION_v1.sql` UNIQUE partial index** (`UNIQUE WHERE active_status = true`) provides DB-level enforcement as a backstop — the second INSERT would fail with a unique constraint violation, which `generateDefaultCareTasks` surfaces as a thrown error.

**Coexistence implication:** The application guard + DB UNIQUE index (post-hardening migration) provide defense-in-depth. Pre-hardening migration (current live state), only the application guard exists.

---

### Finding 6.3 — `useWaterPlant` creates a new task on the "orphan" path with no frequency

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 185–192

```typescript
} else {
  const { error } = await supabase.from("care_tasks").insert({
    plant_id: plantId,
    task_type: "watering" as TaskType,
    last_completed_at: now,
    // No frequency_days — defaults to NULL in DB
    // No next_due_at — defaults to NULL in DB
    // No active_status — defaults to TRUE via DB default
  });
```

**Severity:** MEDIUM  
**Why it matters:** This path creates a task with `frequency_days = NULL`. From that point:
- `getDaysUntilWatering` returns `0` forever (null frequency_days → falsy guard at `types/plant.ts:240`)
- The plant shows as "Water today" indefinitely
- The `generateDefaultCareTasks` guard subsequently finds this active task and skips proper task generation
- The orphan task is permanent — no automatic cleanup or correction

**Coexistence implication:** This risk exists identically before and after schema migration. It is not a coexistence-layer issue; it is a mutation-path edge case active in all schema states.

---

## 7 — TRIGGERED RUNTIME MUTATIONS

### Finding 7.1 — `queryClient.invalidateQueries` triggers background re-fetches

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 97, 130, 144, 196

Four mutation hooks each call `invalidateQueries` on success:

| Hook | Invalidation call | Effect |
|---|---|---|
| `useCreatePlant.onSuccess` | `invalidateQueries({ queryKey: ["plants"] })` (line 97) | All plant list queries re-fetch |
| `useUpdatePlant.onSuccess` | Both `["plants"]` and `["plant", id]` (lines 129–130) | List + detail re-fetch |
| `useDeletePlant.onSuccess` | `["plants"]` (line 144) | List re-fetch |
| `useWaterPlant.onSuccess` | `["plants"]` (line 196) | List re-fetch (note: NOT `["plant", id]`) |

**Severity:** LOW  
**Why it matters:** Each `invalidateQueries` call triggers an immediate background Supabase SELECT query (PostgREST `GET /rest/v1/plants?select=*,care_tasks(*)`). These are reads, not writes, and are safe. However:
- `useWaterPlant.onSuccess` invalidates `["plants"]` but NOT `["plant", id]`. A user on the plant detail screen who waters their plant will see the updated countdown only if they navigate away and back (triggering a fresh `["plant", id]` fetch), or after the 30-second staleTime expires.
- During the re-fetch window, the plant detail screen shows the pre-watering `last_completed_at` until the `["plant", id]` query next fires.

**Coexistence implication:** Cache invalidation is schema-agnostic. It will re-fetch with the same `PLANT_SELECT = "*, care_tasks(*)"` query in all schema states.

---

### Finding 7.2 — `supabase.auth.onAuthStateChange` is a persistent live subscription

**File:** `artifacts/mobile/contexts/AuthContext.tsx` — lines 34–41

```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
  setSession(s);
  setUser(s?.user ?? null);
});

return () => subscription.unsubscribe();
```

**Severity:** LOW  
**Why it matters:** This subscription is active for the entire application lifetime (from `AuthProvider` mount to unmount). It fires on:
- Successful sign-in → sets session + user
- Sign-out → sets both to null
- Token refresh → sets updated session (new JWT)
- Auth error → passes null session

Setting `user: null` triggers the `enabled: !!user` guard on `usePlants` and `usePlant` queries, which cancels any in-flight queries. This is correct auth behavior, not a hidden mutation risk.

**Coexistence implication:** Auth state changes do not trigger any schema mutation, task regeneration, or canonical propagation. They only affect which queries are enabled.

---

### Finding 7.3 — `useDeletePlant` cascades care_tasks and care_logs via FK

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 134–144

```typescript
const { error } = await supabase.from("plants").delete().eq("id", id);
```

**Severity:** MEDIUM  
**Why it matters:** The `plants` table has `ON DELETE CASCADE` on all child tables (`care_tasks`, `care_logs`, `journal_entries`, `health_logs`). A single `DELETE FROM plants WHERE id = ?` cascades to delete all associated rows in all four tables. This is:
- Irreversible
- Not confirmed at the DB level beyond the `Alert.alert()` dialog in `app/plant/[id].tsx:247–264`
- Not logged to any audit trail before deletion

The cascade also affects `journal_entries` and `health_logs` even though neither is currently populated by the app (no UI for creating entries). If future phases populate these tables, the cascade is already in place.

**Coexistence implication:** Post-`supabase-migration-v2.sql`, `care_tasks` and `care_logs` will also have `canonical_species_id` columns. These cascade-deleted rows would be permanently lost, including any canonical identity links set during Phase 2.2 backfill. This is architecturally correct (deleting a plant should delete all its history), but irreversibility must be documented.

---

## 8 — AUTOMATIC COLLAPSE NORMALIZATION

### Finding 8.1 — No collapse normalization code exists anywhere

**Severity:** LOW (zero risk from what exists)

As documented in the onboarding audit, the `collapse_mappings` table has:
- No application query code (not even commented-out stubs)
- No lookup function
- No routing slot in `resolveSpeciesProfile`
- No TypeScript runtime call sites anywhere

Zero automatic collapse normalization can occur. This is not a hidden risk — it is a confirmed absence.

**Files checked for collapse_mappings queries:** All files in `artifacts/mobile/`. No active query found.

**Coexistence implication:** Collapse normalization is not part of the coexistence topology. It does not interact with, and cannot interfere with, any current runtime path.

---

## 9 — RUNTIME ASSUMPTIONS CONFLICTING WITH COEXISTENCE TOPOLOGY

### Finding 9.1 — `getDaysUntilWatering` ignores `next_due_at` (UNMANAGED, HIGH)

**File:** `artifacts/mobile/types/plant.ts` — lines 238–249

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

**Severity:** HIGH  
**Why it matters:** `useWaterPlant` writes `next_due_at = Date.now() + frequency_days * ms` to `care_tasks`. The UI computation ignores this entirely. Today this is benign — both computations produce the same result because `last_completed_at` and `Date.now()` at watering time are equivalent sources for "now."

**The conflict activates when any of the following occurs:**
- A seasonal scheduler changes `next_due_at` based on a different seasonal frequency than the stored `frequency_days`
- A server-side system writes a future `next_due_at` to skip a watering cycle (e.g., vacation mode)
- An admin tool overwrites `next_due_at` directly
- A future "reschedule" feature allows users to push the next due date

In all these cases, `next_due_at` in the DB and the computed countdown in the UI will silently disagree. The user sees wrong data with no indication.

**Coexistence implication:** This is the most significant runtime assumption conflict. The coexistence design assumed `last_completed_at + frequency_days` would always match `next_due_at` — which is true only when the frequency is constant and the mutation is always `useWaterPlant`. Any external write to `next_due_at` breaks this assumption.

**Resolution required before seasonal activation:** `getDaysUntilWatering` must be rewritten to read `next_due_at` directly from the DB value, falling back to the computed value only when `next_due_at` is null.

---

### Finding 9.2 — Phase 2.1 shim must be removed in sync with migration — no automated gate

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 49–66 (useCreatePlant shim) and lines 106–116 (useUpdatePlant shim)

The shim strips:
- `user_entered_name`
- `canonical_species_id`
- `canonical_species_name`
- `species_resolution_method`

from all INSERT and UPDATE payloads.

**Severity:** HIGH  
**Why it matters:** There are two failure modes with opposite consequences:

| Failure mode | Trigger | Effect |
|---|---|---|
| Shim removed BEFORE migration | Developer removes shim without confirming migration applied | PostgREST `400 Bad Request` on all plant creates/edits. App broken for all users. |
| Shim LEFT IN after migration | Developer applies migration but forgets to remove shim | Phase 2.1 fields are silently discarded forever. Identity resolution never activates. No error — completely silent data loss. |

Mode 2 is the more dangerous failure because it produces no error. The app continues to work, but the canonical identity system never activates and the user never knows.

**Coexistence implication:** The shim is the primary coexistence mechanism for the insert/update path. Its removal must be tightly coordinated with the migration. No automated enforcement exists — `getSchemaMigrationStatus()` could provide this gate if wired to block shim removal, but it currently has zero call sites.

---

### Finding 9.3 — `QueryClient` `retry: 1` can double-execute failed mutations if the first attempt partially succeeded

**File:** `artifacts/mobile/app/_layout.tsx` — lines 23–24

```typescript
defaultOptions: {
  queries: {
    retry: 1,
```

**Severity:** LOW  
**Why it matters:** The `retry: 1` setting applies to **queries** (reads), not mutations. Mutations in React Query do not retry automatically by default. `useCreatePlant`, `useUpdatePlant`, `useDeletePlant`, and `useWaterPlant` are all mutations — they do not retry on failure.

However: within `useCreatePlant.mutationFn`, the operation is:
1. INSERT plant (mutation — no retry)
2. `generateDefaultCareTasks` (sequence of Supabase calls — no retry)
3. SELECT plant with care_tasks (query within mutation — no retry)

If step 2 fails after step 1 succeeds, the plant exists in the DB with no care tasks. The mutation returns an error. If the user retries by tapping "Add Plant" again, a NEW plant is created (duplicate), not a retry of the original. The original orphan plant remains in the DB.

**Coexistence implication:** This is a pre-existing race condition, unrelated to the schema migration. Migration does not change this behavior.

---

### Finding 9.4 — `species_name` is the sole onboarding signal for care resolution — case not normalized

**File:** `artifacts/mobile/components/PlantForm.tsx` — line 57

```typescript
species_name: speciesName.trim() || undefined,
```

**File:** `artifacts/mobile/lib/careProfiles.ts` — line 50

```typescript
.ilike("species_name", `%${speciesName.trim()}%`)
```

**Severity:** MEDIUM  
**Why it matters:** `species_name` is stored in the DB with the exact case the user typed (after whitespace trim). The ILIKE query is case-insensitive at query time, but the stored value retains original case. This means:
- Two users adding the same species may store `"Monstera"`, `"monstera"`, `"MONSTERA"` — all resolve to the same profile via ilike, but are stored as distinct strings
- Phase 2.2 alias resolution uses `input.species_name` — if stored as `"monstera"` and the alias is `"Monstera"`, the alias ILIKE will still match (case-insensitive), but any future exact-match logic would fail

**Coexistence implication:** The coexistence topology assumes `species_name` is the legacy identity field. Inconsistent case normalization across the 46 care profile rows and user plant rows creates a fragmented dataset that must be addressed before any case-sensitive lookup is introduced.

---

### Finding 9.5 — `care_logs` insert omits `canonical_species_id` — permanent historical gap

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 159–163

```typescript
const { error: logError } = await supabase.from("care_logs").insert({
  plant_id: plantId,
  task_type: "watering" as TaskType,
  completed_at: now,
  // canonical_species_id NOT included
});
```

**Severity:** HIGH  
**Why it matters:** Every watering event ever logged creates a `care_logs` row with `canonical_species_id = NULL`. This is true before AND after the schema migration, AND after Phase 2.2 canonical activation. Even if `plants.canonical_species_id` is correctly populated post-Phase-2.2, the associated `care_logs` rows for all waterings never inherit this FK.

**Coexistence implication:** This is the only runtime mutation path that writes to `care_logs`. There is no second path. All historical watering records for all users will permanently have `canonical_species_id = NULL` unless a specific backfill migration is run against `care_logs` after Phase 2.2 activation. No such backfill migration is planned or drafted.

---

## 10 — SUPABASE / REPLIT SCHEMA DRIFT RISKS

### Finding 10.1 — Env var swap detection: single-expression heuristic, not validated

**File:** `artifacts/mobile/lib/supabase.ts` — lines 7–11

```typescript
const a = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const b = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";

const supabaseUrl    = a.startsWith("https://") ? a : b;
const supabaseAnonKey = a.startsWith("https://") ? b : a;
```

**Severity:** MEDIUM  
**Why it matters:** This heuristic assumes:
1. Exactly one of the two env vars starts with `"https://"`
2. The URL is the one that starts with `"https://"`
3. The anon key is the one that does NOT start with `"https://"`

**Failure modes:**

| Scenario | Effect |
|---|---|
| Both env vars are empty strings | `supabaseUrl = ""`, `supabaseAnonKey = ""` — Supabase client instantiated with no credentials. All queries fail with connection errors. |
| Both env vars start with `"https://"` (e.g., two URLs entered) | `supabaseUrl = EXPO_PUBLIC_SUPABASE_URL`, `supabaseAnonKey = EXPO_PUBLIC_SUPABASE_ANON_KEY`. Client gets URL as anon key → auth fails silently (wrong credential type). |
| Neither starts with `"https://"` (e.g., two anon keys entered) | `supabaseUrl = EXPO_PUBLIC_SUPABASE_ANON_KEY`, `supabaseAnonKey = EXPO_PUBLIC_SUPABASE_URL`. Client gets anon key as URL → Supabase client may throw or fail all connections. |
| Only one env var set (other missing/undefined) | The `?? ""` default assigns `""` to the missing one. Detection still works if the present var starts with `"https://"`. But if the URL is missing and the anon key is present, `supabaseUrl = ""` → connection failure. |

**Coexistence implication:** The env var swap situation is documented (see `supabase-creds.md` in agent memory). The current live state has the keys swapped, and the heuristic correctly handles this. Any change to the Replit secrets configuration (e.g., correcting the swap) would make the heuristic unnecessarily correct both before and after the correction — but both values would need to be present and in their intended positions for the simpler initialization to work.

---

### Finding 10.2 — No PostgREST schema cache invalidation on migration

**Severity:** MEDIUM  
**Why it matters:** Supabase's PostgREST service caches the database schema (tables, columns, relationships) in memory. When `supabase-migration-v2.sql` is applied, PostgREST may continue serving the pre-migration schema for a period until it refreshes its cache. During this window:
- `SELECT *` queries may not return new columns
- `INSERT` queries with new columns may succeed at the SQL level but be ignored by PostgREST
- The Supabase Dashboard shows the new schema; the API does not

PostgREST reloads its schema on a configurable interval (default varies; Supabase-managed instances typically reload within seconds to a few minutes). The exact behavior depends on the Supabase-managed infrastructure.

**Coexistence implication:** There is a potential brief window after migration where the DB has the new columns but the API does not serve them. During this window, the Phase 2.1 shim is still needed even if the migration is confirmed applied. The shim removal should be done after confirming PostgREST is serving the new columns (verifiable via a direct API call checking for `canonical_species_id` in the response).

---

### Finding 10.3 — RLS policy names assumed in `PRE_DATASET_HARDENING_MIGRATION_v1.sql`

**File:** `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` — Section D

The hardening migration uses `DROP POLICY IF EXISTS "care_tasks: insert own" ON care_tasks` and similar named patterns. These policy names were defined in `supabase-setup.sql` and should exist in the live DB. However:

**Severity:** MEDIUM  
**Why it matters:** If the live DB's RLS policies have slightly different names (e.g., from being created via the Supabase Dashboard UI, which may auto-generate different names), the `DROP POLICY IF EXISTS` silently succeeds (does nothing), and `CREATE POLICY` adds a second policy. PostgreSQL evaluates multiple permissive policies with OR semantics — the result is still functionally correct (ownership-scoped), but the policy list becomes dirty.

**Detection query before running hardening migration:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('care_tasks', 'care_logs', 'plant_aliases', 'canonical_species')
ORDER BY tablename, policyname;
```

**Coexistence implication:** This is a pre-application verification step, not a runtime risk. The hardening migration can be safely re-run after detecting and correcting policy names if needed (idempotent `DROP IF EXISTS` + `CREATE`).

---

### Finding 10.4 — `plant_care_profiles` CHECK constraint names assumed in migration

**File:** `artifacts/mobile/supabase-migration-v2.sql` — Section B7

```sql
ALTER TABLE plant_care_profiles
  DROP CONSTRAINT IF EXISTS plant_care_profiles_light_requirement_check;
ALTER TABLE plant_care_profiles
  ADD CONSTRAINT plant_care_profiles_light_requirement_check
    CHECK (light_requirement IN ('low','medium','bright_indirect','full_sun',
                                 'low_light','medium_indirect','direct_sun'));
```

**Severity:** MEDIUM  
**Why it matters:** PostgreSQL auto-generates constraint names using a `{table}_{column}_check` convention when no name is specified. The original `supabase-setup.sql` used `CHECK (light_requirement IN (...))` without a `CONSTRAINT` name clause — meaning PostgreSQL generated the name. If the generated name differs from what the migration assumes, the `DROP CONSTRAINT IF EXISTS` does nothing and the `ADD CONSTRAINT` creates a second CHECK constraint, leaving two active constraints on the column.

**Detection query before running migration:**
```sql
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'plant_care_profiles'::regclass
  AND contype = 'c';
```

**Coexistence implication:** Two CHECK constraints on the same column are evaluated with AND semantics — both must pass. If the old constraint accepts only legacy values and the new one accepts both, a row with a canonical value would fail the old constraint and be rejected. This is the highest-risk single operation in `supabase-migration-v2.sql`.

---

### Finding 10.5 — `QueryClient` has no persistence layer — all cache lost on app restart

**File:** `artifacts/mobile/app/_layout.tsx` — lines 20–27

The `QueryClient` is instantiated fresh on every app startup. No `persistQueryClient` or `AsyncStorage`-backed persistence is configured.

**Severity:** LOW  
**Why it matters:** Every app restart triggers fresh Supabase fetches for all plant data. There is no offline-first cache. If the device has no network on startup, the app shows empty data (no plants, no care tasks) with no error surface — `usePlants` returns `data: []` (empty array default) while the query is pending.

**Coexistence implication:** Cache loss on restart is predictable and safe for the coexistence design. There is no risk of the app serving pre-migration cached data after a migration-and-restart cycle.

---

### Finding 10.6 — Supabase anon key grants read access to `plant_care_profiles` — no user isolation

**File:** `artifacts/mobile/supabase-setup.sql` — RLS policy for `plant_care_profiles`

```sql
CREATE POLICY "plant_care_profiles: public read"
  ON plant_care_profiles FOR SELECT
  TO authenticated
  USING (true);
```

**Severity:** LOW (by design)  
**Why it matters:** All authenticated users can read all rows in `plant_care_profiles`. This is intentional — care profiles are admin-curated species data shared across all users. However:
- There is no row-level filtering — a user can query all 46+ care profiles
- There is no INSERT/UPDATE/DELETE policy for authenticated users — writes are implicitly denied for non-admin roles
- The RLS `TO authenticated` means the anon (unauthenticated) role has NO access — correct

**Coexistence implication:** Post-dataset seeding (Phase B2.1+), `plant_care_profiles` may contain hundreds of rows. The ilike lookup (`LIMIT 1`) is safe. But any query that selects all care profiles (e.g., a future search-as-you-type feature) would return the full dataset to every user. This is by design but should be noted as dataset size grows.

---

### Finding 10.7 — `detectSessionInUrl: false` disables magic link and OAuth redirect handling

**File:** `artifacts/mobile/lib/supabase.ts` — line 18

```typescript
detectSessionInUrl: false,
```

**Severity:** LOW (intentional for React Native)  
**Why it matters:** Setting `detectSessionInUrl: false` disables Supabase's URL-based session detection. This is required for React Native because there is no browser URL bar. However, it also means:
- Magic link authentication does not work (requires URL session detection)
- OAuth redirect flows (Google, GitHub sign-in) do not work without additional deep link handling
- Password reset via email link requires custom deep link integration

**Coexistence implication:** The app currently supports only email/password authentication (`signInWithPassword`). The `detectSessionInUrl: false` setting is correctly matched to this constraint. If OAuth or magic links are added in a future phase, this setting must be revisited alongside deep link configuration.

---

## COMPOSITE RISK MATRIX

| # | Finding | Severity | Managed? | Pre-migration safe? | Post-migration safe? |
|---|---|---|---|---|---|
| 1.2 | `SELECT *` silently returns new columns post-migration | MEDIUM | YES — types handle null | ✅ | ✅ (null columns) |
| 2.2 | 30-second stale window | MEDIUM | YES — invalidation on mutation | ✅ | ✅ |
| 2.3 | `autoRefreshToken` silent background mutation | LOW | YES — correct auth behavior | ✅ | ✅ |
| 4.3 | No startup gate for migration status | MEDIUM | NO | ✅ | ⚠️ (shim must be removed manually) |
| 5.2 | TypeScript types manually synced to schema | MEDIUM | PARTIAL — shim covers Phase 2.1 | ✅ | ⚠️ (manual sync required) |
| 6.2 | Duplicate task guard misses `active_status = false` | MEDIUM | PARTIAL — UNIQUE index backstop | ✅ | ✅ |
| 6.3 | Orphan task on `useWaterPlant` before task generation | MEDIUM | NO | ✅ | ✅ |
| 7.1 | `useWaterPlant` doesn't invalidate `["plant", id]` | LOW | NO | ✅ | ✅ |
| 7.3 | `DELETE plants` cascades all child rows irreversibly | MEDIUM | YES — alert dialog | ✅ | ✅ |
| **9.1** | **`getDaysUntilWatering` ignores `next_due_at`** | **HIGH** | **NO** | **✅** | **⚠️ seasonal risk** |
| **9.2** | **Shim removal must sync with migration — no gate** | **HIGH** | **NO** | **✅** | **⚠️ manual discipline** |
| 9.3 | `retry: 1` only on queries, not mutations | LOW | YES — correct React Query behavior | ✅ | ✅ |
| 9.4 | `species_name` case not normalized at write | MEDIUM | NO | ✅ | ⚠️ (fragmented dataset) |
| **9.5** | **`care_logs` never receives `canonical_species_id`** | **HIGH** | **NO** | **✅** | **⚠️ permanent history gap** |
| 10.1 | Env var swap heuristic edge cases | MEDIUM | YES — current state correct | ✅ | ✅ |
| 10.2 | PostgREST schema cache lag post-migration | MEDIUM | NO | ✅ | ⚠️ (verify before shim removal) |
| 10.3 | RLS policy names assumed in hardening migration | MEDIUM | NO — detection query available | ✅ | ⚠️ (verify before applying) |
| 10.4 | CHECK constraint names assumed in migration | MEDIUM | NO — detection query available | ✅ | ⚠️ (highest risk in migration) |
| 10.5 | QueryClient has no persistence — empty on restart | LOW | YES — by design | ✅ | ✅ |
| 10.6 | `plant_care_profiles` full read for all authenticated users | LOW | YES — by design | ✅ | ✅ |

### Three actions required before Phase 2.1 migration

1. Run CHECK constraint name detection query (Finding 10.4) — resolve before `supabase-migration-v2.sql`
2. Run RLS policy name detection query (Finding 10.3) — resolve before `PRE_DATASET_HARDENING_MIGRATION_v1.sql`
3. Confirm PostgREST serving new columns (Finding 10.2) — verify before shim removal

### Three code fixes required before seasonal scheduler activation

1. Rewrite `getDaysUntilWatering` to read `next_due_at` (Finding 9.1)
2. Populate `canonical_species_id` in `care_logs` insert (Finding 9.5)
3. Wire `getSchemaMigrationStatus()` to shim removal gate (Finding 4.3)

---

*This document is read-only runtime activation risk documentation. No files were modified in its generation. Reflects project state as of Phase B2.0.*
