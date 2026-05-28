# PLANTMON — Runtime Compatibility Contract

**Classification:** Governance Reconciliation Audit  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus + full governance baseline corpus + `ACTIVATION_BOUNDARY_REGISTRY.md` + `STALE_ASSUMPTION_REGISTRY.md`  

This document is the authoritative runtime compatibility contract for PLANTMON at the Phase B2.0 boundary. It defines the guarantees that currently protect live user data and app behavior, the isolation invariants that prevent accidental activation, and the compatibility constraints that each future phase must preserve to avoid regression. No code was modified in its generation.

**Contract terminology:**

| Term | Meaning |
|---|---|
| **Guarantee** | A property that holds unconditionally in the current runtime; violation requires deliberate, multi-step action |
| **Invariant** | A structural property that cannot be violated by any single code or schema change |
| **Constraint** | A requirement that future activation phases must satisfy before altering a governed behavior |
| **Preservation** | A future phase's obligation to maintain a guarantee that currently holds |

---

## RUNTIME COMPATIBILITY GUARANTEES

### Guarantee 1 — Legacy Onboarding Continuity

**Statement:** Every plant creation attempt in the current runtime either succeeds with a complete, valid DB record and at least one active care task, or fails with a user-visible error. No plant creation silently produces a corrupt, incomplete, or schema-invalid record.

**Mechanism breakdown:**

| Step | What protects it |
|---|---|
| Form submission with empty display_name | Validation gate: `if (!displayName.trim()) → error` — prevented before any DB call |
| INSERT with Phase 2.1 columns in payload | Phase 2.1 shim: strips `user_entered_name`, `canonical_species_id`, `canonical_species_name`, `species_resolution_method` unconditionally |
| INSERT with unrecognized species | 7-day fallback: `DEFAULT_WATERING_DAYS = 7` — no null `frequency_days` on any successful creation |
| Care task creation for duplicate plant attempt | Duplicate guard: `SELECT WHERE task_type = 'watering' AND active_status = true` → early return if task exists |
| Any PostgREST or network failure | `submitError` banner in `new.tsx`: mutation error surfaces as visible UI message, never silently discarded |

**What this guarantee does NOT cover:**  
The care profile quality of a successfully created plant. A plant with an unrecognized species receives `frequency_days = 7` with no notification to the user. The creation succeeds; the data is not corrupt; but the care schedule may not match the plant's actual needs. This is a documented quality limitation, not a guarantee violation.

**Preservation obligation for future phases:** Any phase that removes the Phase 2.1 shim, modifies the species resolution path, or alters the care task creation logic must preserve this guarantee. Specifically: shim removal must not create a window where an unguarded INSERT sends Phase 2.1 columns to a pre-migration schema.

---

### Guarantee 2 — Scheduler Continuity

**Statement:** The watering countdown displayed for every plant in the live system is computed from valid, non-null data and produces a non-negative integer. No plant displays a negative countdown, an error state, or a missing value due to null data.

**Mechanism breakdown:**

| Failure scenario | What prevents it |
|---|---|
| `last_completed_at` is null (new plant, never watered) | Null guard at step 2 of `getDaysUntilWatering` → returns `0` ("Water today") |
| `frequency_days` is null (orphan task) | Null guard at step 2 → returns `0` |
| No active watering task on a plant | `getWateringTask` returns null → null guard fires → returns `0` |
| `diff` is negative (overdue plant) | `Math.max(0, diff)` → returns `0`, never negative |
| React Query cache is stale (up to 30s) | `getDaysUntilWatering` uses `Date.now()` at render time — countdown freshness is not bound by cache staleness |
| PostgREST error on plant fetch | React Query holds last-good cache; countdown continues from stale data; no crash |

**The "Water today" floor contract:** `getDaysUntilWatering` never returns a value below `0`. An overdue plant and a never-watered plant both return `0` and display "Water today." The semantic distinction between "overdue" and "never watered" is not preserved in the UI — both show the same badge. This is an intentional design simplification, not a data loss.

**Preservation obligation for future phases:** The floor contract (`Math.max(0, diff)`) must be preserved. The null guard must be preserved. The `frequency_days ?? DEFAULT_WATERING_DAYS` null coalescing in `useWaterPlant` must be preserved. Any scheduler rewrite must continue to return a non-negative integer for every plant in all data states.

---

### Guarantee 3 — Canonical Nullability

**Statement:** `canonical_species_id` is null or absent on every plant, care task, and care log row in the live system. No application code path produces a non-null `canonical_species_id` value in any DB row.

**Mechanism breakdown:**

| Write path | How canonical nullability is enforced |
|---|---|
| `useCreatePlant` INSERT to `plants` | Shim strips `canonical_species_id` before INSERT; column absent pre-migration — doubly protected |
| `useUpdatePlant` UPDATE to `plants` | Shim strips `canonical_species_id` before UPDATE; column absent — doubly protected |
| `generateDefaultCareTasks` INSERT to `care_tasks` | `_canonicalSpeciesId` parameter never forwarded to INSERT payload; column absent — doubly protected |
| `useWaterPlant` INSERT to `care_logs` | `canonical_species_id` field absent from INSERT object; column absent — doubly protected |
| `useWaterPlant` UPDATE to `care_tasks` | Only `last_completed_at` and `next_due_at` updated; `canonical_species_id` untouched |
| Direct DB write by admin (outside app) | Outside application authority; coexistence handles correctly — app ignores the value |

**Pre-migration vs. post-migration nullability behavior:**

| State | `plant.canonical_species_id` in React Query cache | TypeScript handling |
|---|---|---|
| Pre-migration (current) | `undefined` — key absent from PostgREST response | `?: string \| null \| undefined` — optional chain, no crash |
| Post-migration (future) | `null` — key present, DB value NULL | `?: string \| null \| undefined` — nullish coalescing, no crash |

Both states are handled identically by the TypeScript type system. The transition from `undefined` to `null` at migration time requires zero code changes.

**Preservation obligation for future phases:** The transition from canonical nullability to canonical population is a Tier 1 activation event (Phase 2.2A). Until that phase is deliberately activated, canonical nullability must remain a system-wide invariant. No phase between B2.0 and B2.2A may write a non-null `canonical_species_id` to any row.

---

### Guarantee 4 — Coexistence-Safe Reads

**Statement:** Every plant read operation returns a complete, valid `Plant` object regardless of migration state. No read operation crashes, returns an error, or produces a partially-hydrated object due to schema evolution.

**Mechanism breakdown:**

| Read scenario | What makes it safe |
|---|---|
| `SELECT *` pre-migration | Returns 7 v01 columns; Phase 2.1 TypeScript fields are `undefined`; app renders normally |
| `SELECT *` post-migration | Returns 11 columns; Phase 2.1 fields are `null`; app renders normally |
| `SELECT *, care_tasks(*)` with no care tasks | `care_tasks` is an empty array `[]`; `getWateringTask` returns `undefined`; null guard returns `0` |
| `SELECT *` with new column added by future migration | `*` selector includes it automatically; TypeScript optional fields absorb it; no query change needed |
| React Query cache serving stale data | TypeScript types model both fresh and stale correctly; stale countdown remains valid (uses `Date.now()` at render) |

**The `SELECT *` forward-compatibility guarantee** is the cornerstone of read safety. By selecting all columns rather than naming them, the query remains valid across every past and future schema state. No migration can cause a read failure by adding a column — the new column appears automatically as `null` in the response, and TypeScript's optional fields absorb it silently.

**What this guarantee does NOT cover:**  
Read correctness for Phase 2.1 fields post-migration. After `supabase-migration-v2.sql` is applied, `plants.canonical_species_id` will be present in every SELECT response as `null`. The read returns correctly — but the returned value (`null`) does not mean "has a canonical species ID" — it means "column exists, value unset." Any code that checks `plant.canonical_species_id !== null` post-migration must account for the unset-vs-populated distinction.

---

### Guarantee 5 — Coexistence-Safe Writes

**Statement:** Every plant creation and edit operation produces a valid DB write that conforms to the live schema, regardless of what fields are present in `PlantInput`. No write operation produces a PostgREST error due to schema mismatch.

**Mechanism breakdown:**

The Phase 2.1 shim transforms any `PlantInput` object — regardless of how many future fields it contains — into a schema-valid payload containing exactly the columns that exist in the live DB:

```
Input (any PlantInput including all future fields):
  { display_name, species_name, room_location, notes,
    user_entered_name, canonical_species_id, canonical_species_name,
    species_resolution_method, ...any future fields }

After shim (useCreatePlant:49–66):
  const { user_entered_name: _, canonical_species_id: _,
          canonical_species_name: _, species_resolution_method: _,
          ...v01Fields } = input;
  // v01Fields = { display_name, species_name, room_location, notes }

INSERT payload:
  { ...v01Fields, user_id: user.id }
  = { display_name, species_name, room_location, notes, user_id }
```

The shim is a structural transform, not a conditional. It cannot be bypassed by passing different values, different field names, or different TypeScript types. The output is always the same five-field payload.

**`species_name.trim() || undefined` — empty-string protection:**  
An empty species field becomes `undefined` in the payload, not `""` (empty string). This ensures `plants.species_name IS NULL` cleanly represents "no species provided" without requiring a separate null-vs-empty-string handling path in any consumer.

**`useUpdatePlant` shim parity:**  
The same four-field strip applies to the UPDATE path (`usePlants.ts:106–116`). Plant edits are subject to the same schema-valid payload guarantee. There is no write path to `plants` that bypasses the shim.

**Preservation obligation for future phases:** Shim removal is a Tier 4 implementation event that must not precede the migration application (Tier 2 event). The safe write guarantee holds until shim removal; after shim removal, the migration must already have been applied and the PostgREST schema cache refreshed.

---

### Guarantee 6 — Backward Compatibility

**Statement:** The behavior of every feature that was operational before Phase B2.0 (plant creation, editing, watering, countdown display, plant list, detail view) remains unchanged at Phase B2.0 and will remain unchanged through any future phase that does not explicitly activate a new capability.

**Behavioral invariants preserved at Phase B2.0:**

| Feature | Preserved behavior |
|---|---|
| Plant creation | Creates `plants` row + active watering task + optional fertilizing task |
| Species ilike resolution | Returns first alphabetical match for `%species_name%` substring |
| 7-day fallback | Applied silently for unrecognized species, empty species, or lookup errors |
| Watering countdown | `Math.ceil((last + freq * ms - now) / ms)`, clamped to `[0, ∞)` |
| "Water today" display | `daysLeft === 0` → "Water today" badge |
| "Due soon" display | `daysLeft <= 2` → warning treatment |
| Watering event | Updates `last_completed_at` + `next_due_at`; inserts `care_logs` row |
| Plant edit | Updates `plants` row only; care tasks untouched |
| Plant list | `PLANT_SELECT = "*, care_tasks(*)"` — all plants with nested care tasks |
| Plant detail | Detail screen reads from React Query cache populated by same query |

**The backward compatibility guarantee is structurally enforced:** ilike resolution, the 7-day fallback, and the static-interval scheduler are the only active pathways. No activation event in Phases B2.1 through B2.0 has occurred to alter them. The comment gates, shim, and underscore parameters ensure that all future infrastructure is inert. The active pathways have not changed since the app was first operable.

---

## RUNTIME ISOLATION GUARANTEES

### Isolation Guarantee 1 — Absence of Hidden Canonical Propagation

**Statement:** No currently-active code path writes a non-null `canonical_species_id` to any table, logs any canonical species data, or routes any request through canonical infrastructure. Canonical infrastructure is hermetically isolated from the active runtime.

**Proof by enumeration:**

| Potential propagation vector | Status | Evidence |
|---|---|---|
| `useCreatePlant` INSERT on `plants` | ❌ ISOLATED | Shim strips `canonical_species_id`; column absent |
| `useUpdatePlant` UPDATE on `plants` | ❌ ISOLATED | Shim strips `canonical_species_id`; column absent |
| `generateDefaultCareTasks` INSERT on `care_tasks` | ❌ ISOLATED | `_canonical` param never forwarded; column absent |
| `useWaterPlant` INSERT on `care_logs` | ❌ ISOLATED | Field absent from INSERT object; column absent |
| `resolveSpeciesProfile` canonical routing slot | ❌ ISOLATED | Comment-gated; `input.canonical_species_id` always `undefined` after shim |
| `lookupByCanonicalId` function | ❌ ISOLATED | Comment-gated; never called |
| `lookupByAlias` function | ❌ ISOLATED | Comment-gated; never called |
| `runtimeValidation.ts` functions | ❌ ISOLATED | Zero call sites; functions compiled but inert |
| React Query canonical field display | ❌ ISOLATED | No component renders `canonical_species_id`, `canonical_species_name`, or `species_resolution_method` |
| `SpeciesResolutionContext.method` | ❌ ISOLATED | Computed by `resolveSpeciesProfile`; destructured away immediately; never reaches any storage |

**The isolation is redundant by design:** For any canonical value to reach the DB, it would need to pass through the shim (which strips it) AND bypass the comment gates (which prevent the code that would generate it from executing) AND traverse a column that does not exist in the live schema (which rejects it). Three independent barriers. The isolation cannot be violated by any single failure.

---

### Isolation Guarantee 2 — Absence of Automatic Rebinding

**Statement:** No currently-active code path recalculates or updates an existing plant's `care_tasks.frequency_days` based on any trigger — not on plant edit, not on app launch, not on timer, not on schema state change.

**Proof by enumeration:**

| Potential rebinding trigger | Status |
|---|---|
| Plant name edit (`display_name` change) | ❌ NO REBINDING — `useUpdatePlant` updates `plants` row only; care tasks untouched |
| Species name edit (`species_name` change) | ❌ NO REBINDING — `useUpdatePlant` updates `plants` row only; `resolveSpeciesProfile` not called on edit |
| Room location change | ❌ NO REBINDING — `useUpdatePlant` updates `plants` row only |
| Notes change | ❌ NO REBINDING — `useUpdatePlant` updates `plants` row only |
| Watering event | ❌ NO REBINDING — `useWaterPlant` updates `last_completed_at` and `next_due_at` only; `frequency_days` untouched |
| App launch | ❌ NO REBINDING — app startup sequence contains no scheduler computation |
| React Query cache refresh | ❌ NO REBINDING — cache refresh is a read operation; no write side-effects |
| `generateDefaultCareTasks` called twice | ❌ DUPLICATE GUARD — second call finds existing task and returns early; no frequency change |
| Schema migration applied (external) | ❌ NO REBINDING — migration is a DB event; no application code triggers on schema change |

**Rebinding invariant:** A plant created with species "Cactus" (30-day profile) that is edited to species "Maidenhair Fern" (3-day profile) retains 30-day watering permanently. The only mechanism that could change `frequency_days` is a direct SQL UPDATE or delete-and-recreate. This is not a bug — it is a governed design property of Phase B2.0. Rebinding is a Phase B2.2 capability that does not exist in the current runtime.

---

### Isolation Guarantee 3 — Absence of Implicit Migration Execution

**Statement:** No application code, startup sequence, scheduled task, or background process executes SQL DDL, applies schema changes, or alters the live DB schema. Schema changes require deliberate manual execution.

**Proof by enumeration:**

| Potential implicit migration path | Status |
|---|---|
| App startup (`_layout.tsx` `useEffect`) | ❌ NO MIGRATION — startup sequence: auth check → React Query client init → navigation ready → first plant fetch (READ ONLY) |
| Drizzle ORM push (`pnpm --filter @workspace/db run push`) | ❌ ISOLATED — Drizzle targets `DATABASE_URL` (api-server's separate Postgres); NOT the Supabase DB |
| Supabase JS client (`supabase.from(...)`) | ❌ NO DDL CAPABILITY — PostgREST HTTP client; cannot execute DDL; `from().insert/update/select/delete` only |
| `runtimeValidation.ts` `getSchemaMigrationStatus()` | ❌ NO MIGRATION — read-only diagnostic; zero call sites; executes no DDL even if called |
| Any `useEffect` or React hook | ❌ NO MIGRATION — all hooks are React Query mutations/queries (DML only) |
| Expo background fetch / task manager | ❌ NOT INSTALLED — `expo-background-fetch` and `expo-task-manager` not present in dependencies |
| Supabase Edge Function trigger | ❌ NOT CONFIGURED — no edge function files in project |
| `pnpm run` script at startup | ❌ NO AUTO-RUN — migration scripts require explicit `pnpm` invocation; no startup hook |

**The migration authority contract:** Every schema change to the live Supabase DB requires: (1) explicit human decision to apply, (2) manual SQL execution in the Supabase Dashboard SQL Editor, (3) pre-application verification (constraint name detection, table existence checks), and (4) post-application verification (schema inspection). This process is documented in `MIGRATION_EXECUTION_LEDGER.md` and protected by `RUNTIME_AUTHORITY_DECLARATION.md §Migration Safety`.

---

### Isolation Guarantee 4 — Absence of ORM Synchronization

**Statement:** Drizzle ORM, the only ORM present in the project, does not and cannot synchronize schema state with the live Supabase DB. The Supabase DB is not reachable by any ORM push or sync operation from within the PLANTMON mobile app.

**Proof:**

| ORM property | State |
|---|---|
| ORM used in mobile app | NONE — Supabase JS client is a PostgREST HTTP wrapper, not an ORM |
| Drizzle ORM location | `lib/db/` — a shared library package used exclusively by `artifacts/api-server` |
| Drizzle target database | `DATABASE_URL` environment variable — a separate Postgres instance provisioned for the api-server |
| Drizzle target is Supabase? | ❌ NO — `DATABASE_URL` ≠ Supabase connection string |
| Can Drizzle `push` reach Supabase? | ❌ NO — different connection string; different DB instance |
| Can the Supabase JS client push schema? | ❌ NO — PostgREST has no DDL endpoint; `supabase.from()` is DML-only |
| `pnpm --filter @workspace/db run push` | Affects the api-server's Postgres DB only; Supabase DB unaffected |

**The two-database architecture** is the structural reason for this guarantee. The api-server uses its own Postgres DB managed by Drizzle ORM. The mobile app uses Supabase, managed by manual SQL migrations. These are distinct instances with distinct connection strings, managed by distinct tools. There is no code path, configuration file, or environment variable that bridges them.

---

## SCHEDULER COMPATIBILITY GUARANTEES

### Legacy Frequency Continuity

**Statement:** Every plant in the live system retains its creation-time `frequency_days` value indefinitely. No currently-active process recalculates, normalizes, or updates `frequency_days` after creation.

**The frequency lifecycle:**

```
Plant created with species "Monstera deliciosa":
  → resolveSpeciesProfile finds profile via ilike
  → watering_frequency_days = 10 (from profile row)
  → INSERT care_tasks: { frequency_days: 10 }

Plant created with unrecognized species:
  → resolveSpeciesProfile returns null profile
  → frequency_days = DEFAULT_WATERING_DAYS = 7
  → INSERT care_tasks: { frequency_days: 7 }

T + 30 days: user edits plant name to "Monty":
  → useUpdatePlant: UPDATE plants SET display_name = "Monty"
  → care_tasks: UNTOUCHED
  → frequency_days: still 10 (or 7) — unchanged

T + 60 days: user edits species to "Monstera":
  → useUpdatePlant: UPDATE plants SET species_name = "Monstera"
  → care_tasks: UNTOUCHED
  → frequency_days: still 10 (or 7) — unchanged
  → resolveSpeciesProfile: NOT CALLED on edit

T + 365 days: plant has been watered 52 times:
  → care_tasks: last_completed_at updated 52 times
  → frequency_days: still 10 (or 7) — never changed
```

**Frequency immutability has one known exception in the current runtime:** the orphan task path. If `useWaterPlant` fires for a plant with no active watering task, it inserts a new task with `frequency_days = null` (the INSERT omits the field and the DB has no default). The null guard in `getDaysUntilWatering` catches this and returns `0` permanently. This is the known orphan task failure mode — it is not a frequency change, it is a permanent null state.

---

### Static Interval Continuity

**Statement:** All watering interval computations use a fixed milliseconds-per-day constant of `24 * 60 * 60 * 1000` (86,400,000 ms). No dynamic interval, timezone correction, DST adjustment, or seasonal variation alters this constant in the current runtime.

**The static interval contract — three files, one value:**

| File | Expression | Evaluates to |
|---|---|---|
| `artifacts/mobile/lib/careProfiles.ts` | `frequency_days * 24 * 60 * 60 * 1000` | `frequency_days * 86_400_000` |
| `artifacts/mobile/hooks/usePlants.ts` | `(task.frequency_days ?? DEFAULT_WATERING_DAYS) * 24 * 60 * 60 * 1000` | Same |
| `artifacts/mobile/types/plant.ts` | `task.frequency_days * 24 * 60 * 60 * 1000` | Same |

All three use the same expression. All three evaluate to the same numeric value. No named constant unifies them — this is a known maintainability debt (three independent expressions that happen to agree) — but for compatibility purposes, all three produce identical behavior.

**DST behavior under static interval:**  
On a spring-forward day (23 hours): the 86,400,000 ms interval produces a `next_due_at` that is 1 hour earlier in wall clock time than the equivalent calendar day. On a fall-back day (25 hours): 1 hour later. Net annual drift: zero (two transitions cancel). Per-transition drift: ±1 hour. For plant care purposes, this is operationally negligible.

**What "static interval continuity" requires of future phases:**  
Seasonal scheduling (Phase B2.3) may write a season-adjusted `next_due_at` that uses a different interval. But the static interval contract must continue to hold for the `care_tasks.frequency_days` column — it stores the base interval, not the seasonal-adjusted interval. Seasonal adjustment must be applied on top of `frequency_days`, not as a replacement for it. If `frequency_days` is altered to store a seasonal value, all downstream frequency computations (including the static fallback in `useWaterPlant`) break.

---

### `next_due_at` Coexistence Behavior

**Statement:** `next_due_at` is written correctly on every plant creation and watering event. It is never read by the UI countdown computation. The write and read paths compute identical values under current conditions, producing latent agreement that masks the divergence risk.

**The write path (three locations):**

| Location | Expression | When executed |
|---|---|---|
| `careProfiles.ts` — profile-based task creation | `new Date(Date.now() + watering_fd * 24 * 60 * 60 * 1000).toISOString()` | Plant creation, species matched |
| `careProfiles.ts` — default-fallback task creation | `new Date(Date.now() + DEFAULT_WATERING_DAYS * 24 * 60 * 60 * 1000).toISOString()` | Plant creation, species not matched |
| `usePlants.ts` — watering event | `new Date(Date.now() + (task.frequency_days ?? DEFAULT_WATERING_DAYS) * 24 * 60 * 60 * 1000).toISOString()` | Every watering event |

**The read path (UI countdown):**

```
getDaysUntilWatering:
  last = new Date(task.last_completed_at)
  next = new Date(last.getTime() + task.frequency_days * 24 * 60 * 60 * 1000)
  diff = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  return Math.max(0, diff)
```

**Why they agree in the current runtime:**  
At watering time, `useWaterPlant` sets both `last_completed_at = now` and `next_due_at = now + freq * ms`. `getDaysUntilWatering` computes `next = last_completed_at + freq * ms`. Since `last_completed_at = now` was just written, the computation is equivalent to `next = now + freq * ms`. Both produce the same future timestamp. The agreement is a coincidence of timing, not a design constraint.

**The coexistence-safe property of this agreement:**  
Because both produce the same value, no user-visible error occurs today. `next_due_at` in the DB and the UI countdown are always in sync. This is the coexistence-safe state: the latent divergence cannot be triggered by any current code path.

**The future compatibility constraint:**  
Any system that writes a different value to `next_due_at` — a seasonal scheduler writing `now + seasonal_adjusted_freq * ms`, a vacation-mode feature writing `now + extra_days * ms`, an admin tool writing an arbitrary timestamp — will cause the UI countdown to diverge silently from the DB value. The coexistence-safe agreement breaks permanently at the moment of the first divergent write. The `getDaysUntilWatering` fix (read `next_due_at` directly) is the prerequisite that must be deployed before any such write is introduced.

---

## ONBOARDING COMPATIBILITY GUARANTEES

### Current ILIKE Lookup Behavior

**Statement:** Every plant creation that includes a non-empty `species_name` field executes exactly one `SELECT` against `plant_care_profiles` using an ILIKE substring match. The result deterministically determines the care schedule for that plant for all time (until the plant is deleted or explicitly rebound via Phase B2.2).

**The ilike behavioral contract — 8 invariants:**

| Invariant | Value | Notes |
|---|---|---|
| Pattern | `'%' + species_name.trim() + '%'` | Leading and trailing wildcards; substring match anywhere in column value |
| Case sensitivity | Case-insensitive | `ILIKE` semantics — "monstera" matches "Monstera deliciosa" |
| Input normalization | `.trim()` only | Leading/trailing whitespace removed; internal whitespace and punctuation preserved |
| Ordering | `ORDER BY species_name ASC` | Alphabetical — first alphabetical match wins |
| Result count | `LIMIT 1` | Exactly one result or null; ties broken alphabetically |
| No-match return | `null` | → 7-day fallback applied |
| Error handling | `error` field not captured | Supabase errors treated as null → 7-day fallback applied |
| Index usage | Sequential scan | No GIN index on `plant_care_profiles.species_name`; `ILIKE '%..%'` cannot use btree |

**These 8 invariants are stable across all schema states.** Applying `supabase-migration-v2.sql` does not add a GIN index to `species_name` on `plant_care_profiles`. Applying `PRE_DATASET_HARDENING_MIGRATION_v1.sql` adds a GIN index on `plant_aliases.alias_name` — not on `plant_care_profiles.species_name`. The ilike lookup will remain a sequential scan until a separate index migration is authored and applied.

**Practical consequence of alphabetical tie-breaking:**  
If `plant_care_profiles` contains both "Boston Fern" and "Bird's Nest Fern," a user who types "fern" receives the "Bird's Nest Fern" profile (alphabetically first). The user who typed "fern" and owns a Boston Fern receives an incorrect profile — with no notification. This is an inherent limitation of the ilike lookup mechanism and will persist until alias routing (Phase B2.2B) replaces it as the primary resolution path.

---

### Fallback Behavior Compatibility

**Statement:** When `plant_care_profiles` contains no row matching the user's species input — or when the lookup fails for any reason — exactly one fallback behavior applies: `frequency_days = 7`, no fertilizing task, `species_resolution_method` uncaptured. This fallback is silent, unconditional, and indistinguishable from a genuine 7-day species match in the current schema.

**The fallback is a compatibility guarantee, not a limitation:**  
In Phase B2.0, the fallback is the designed behavior for unrecognized species. It ensures every plant creation succeeds with a valid care task regardless of species recognition state. The silence is intentional — surfacing resolution confidence to the user is a Phase B2.3+ UX feature, not a Phase B2.0 requirement.

**Fallback compatibility invariants:**

| Property | Current value | Must this be preserved? |
|---|---|---|
| Default watering interval | 7 days | YES — existing plants created under this fallback have `frequency_days = 7`; changing the constant does not retroactively update them |
| Fallback trigger for errors | Any PostgREST error | YES — changing error handling to throw instead of returning null would break the onboarding continuity guarantee |
| Fallback for empty species | Identical to unrecognized species | YES — the null guard `if (input.species_name?.trim())` skips the lookup; fallback fires; same output |
| Fertilizing task on fallback | NOT created | YES — no fertilizing task on fallback is a defined behavior; creating one would silently change care schedules for all future unrecognized-species plants |
| User notification | NONE | Can change — surfacing confidence in a future phase is additive, not breaking |

---

### Non-Destructive Canonical Coexistence

**Statement:** The presence of canonical infrastructure (TypeScript types, commented routing slots, underscore parameters) in the current codebase has zero effect on the care data written for any plant. No canonical field appears in any DB row. No resolution decision is influenced by canonical data.

**Non-destructive coexistence proof:**

The active onboarding pathway can be written as a closed system:

```
Input: { display_name, species_name?, room_location?, notes? }
         (all Phase 2.1 and 2.2 fields stripped or undefined)

Resolution: lookupBySpeciesNameIlike(species_name)
              → PlantCareProfile | null
              (canonical routing slot: comment-gated, never reached)
              (alias routing slot: comment-gated, never reached)

Output:
  plants row:   { id, user_id, display_name, species_name, room_location, notes, created_at }
  care_tasks:   { id, plant_id, task_type, frequency_days, next_due_at, active_status }

  canonical fields in plants row:   ABSENT (column absent)
  canonical fields in care_tasks:   ABSENT (column absent)
  canonical fields in care_logs:    ABSENT (column absent)
  resolution_method in plants row:  ABSENT (column absent)
```

The canonical infrastructure could be completely removed from the codebase — every TypeScript type, every commented function, every underscore parameter — and the onboarding output would be byte-for-byte identical. The canonical infrastructure is additive overhead, not a dependency of the active system.

**The non-destructive coexistence guarantee must be preserved through migration application.** When `supabase-migration-v2.sql` is applied, the canonical columns appear in the DB with `NULL` values. The `SELECT *` query will return them as `null`. No component renders them. No conditional branches on them in any active code path. The migration adds columns; it does not activate any code. Non-destructive coexistence continues to hold post-migration.

---

## FUTURE COMPATIBILITY CONSTRAINTS

### Phase B2.2A — Canonical Routing Activation

**What changes:** `canonical_species_id` is written to `plants` and `care_tasks` rows for newly created plants where an alias resolves a canonical ID. The Phase 2.1 shim is removed. `species_resolution_method` is recorded.

**Compatibility constraints — what B2.2A MUST preserve:**

| Constraint | Requirement | Reason |
|---|---|---|
| **Legacy plants unaffected** | All plants created before B2.2A retain their existing `frequency_days`, `species_name`, and `last_completed_at` values unchanged | No forced rebinding on activation; existing users see no countdown change |
| **ilike fallback preserved** | Plants whose species does not resolve via canonical chain still receive the 7-day fallback | The fallback is the safety net; removing it at B2.2A activation would break all future unrecognized-species plants |
| **Scheduler countdown unchanged** | The `getDaysUntilWatering` function must be fixed to read `next_due_at` BEFORE B2.2A activates — but must produce identical countdowns for all legacy plants post-fix | The fix must be a transparent behavioral preservation for existing data; only plants with divergent `next_due_at` values see a change |
| **Watering event integrity** | `useWaterPlant` must continue to correctly update `last_completed_at` and `next_due_at` for all plants — canonical and non-canonical alike | All plants are watered through the same code path; the path must be universal |
| **Onboarding continuity** | Every plant creation still succeeds with a valid care task; no creation silently fails due to B2.2A changes | The onboarding continuity guarantee is non-negotiable through all phases |
| **Atomic shim removal** | Shim removal, canonical ID wiring, context method wiring, and care_logs write must deploy as a single atomic unit | Any partial deployment creates a window of incorrect data |
| **`care_logs` canonical write** | The `useWaterPlant` care_logs INSERT must include `canonical_species_id` at or before B2.2A activation | Every watering after B2.2A that lacks this write creates a permanent canonical orphan in care history |

**What B2.2A MUST NOT do:**

- Retroactively change `frequency_days` for any plant created before B2.2A (that is Phase B2.2 scheduler rebinding — a separate activation)
- Write `canonical_species_id` to existing plants via the onboarding path (new plants only — existing plants require explicit backfill)
- Break the fallback chain for plants whose species does not resolve
- Remove the `lookupCareProfile` legacy wrapper without deprecation warnings to any callers outside the activation unit

---

### Phase B2.2B — Alias Routing Activation

**What changes:** User species input is matched against `plant_aliases` before the ilike lookup. Matched plants receive a care profile derived from their canonical species ID rather than a substring match.

**Compatibility constraints — what B2.2B MUST preserve:**

| Constraint | Requirement | Reason |
|---|---|---|
| **ilike fallback preserved** | Plants not resolved by alias lookup still fall through to ilike | The activation chain is additive: collapse → alias → canonical → ilike → default. ilike must remain active as the penultimate fallback |
| **Alphabetical-first ilike behavior** | The ilike lookup's ordering and LIMIT 1 behavior is unchanged | Existing plants whose `species_resolution_method = "ilike_species_name"` received their care schedule from this lookup; the lookup must remain consistent for future plants in the same position |
| **`search_priority` tie-breaking** | When multiple aliases match, `ORDER BY search_priority DESC LIMIT 1` must apply | Documented in `lookupByAlias` — the alias lookup uses priority ordering, not alphabetical; this must be consistent with alias seed data quality |
| **No double-routing** | A plant cannot be resolved by both alias and ilike in the same creation call | The routing slot structure ensures alias is tried first; ilike is the fallback; both cannot fire for the same plant |
| **Legacy plant countdown unaffected** | Plants created before B2.2B with ilike-derived `frequency_days` retain their schedules | No retroactive alias-based rebinding at B2.2B activation |
| **Edit form `user_entered_name` divergence** | At B2.2B activation (or before), the edit form must read `user_entered_name` to pre-populate the SPECIES field, not `species_name` | Post-B2.2B, `species_name` may be a normalized canonical name; editing from it would overwrite the user's raw input |

---

### Phase B2.3 — Seasonal Scheduling Activation

**What changes:** `next_due_at` is written with a season-adjusted interval on watering events. The countdown reflects the season-appropriate interval rather than the static `frequency_days` value.

**Compatibility constraints — what B2.3 MUST preserve:**

| Constraint | Requirement | Reason |
|---|---|---|
| **`getDaysUntilWatering` fix deployed first** | `getDaysUntilWatering` must read `next_due_at` before any seasonal writer is activated | This is the only B2.3 prerequisite that can — and must — be deployed before all other B2.3 work begins |
| **`frequency_days` immutability** | `care_tasks.frequency_days` stores the base interval; seasonal adjustment is applied ON TOP of it, not as a replacement | If `frequency_days` is altered to hold a seasonal value, all static-interval code paths (fallback, orphan recovery, `useWaterPlant` null coalescing) break |
| **Fallback plants receive no seasonal adjustment** | Plants with `frequency_days = 7` from the fallback should not receive seasonal adjustment — or if they do, it must be explicitly designed | Applying seasonal adjustment to an already-uncertain fallback amplifies the care quality error |
| **Non-canonical plants continue to function** | Plants without a `canonical_species_id` must continue to water correctly | Seasonal scheduling must work for all plants, not only canonical ones; or it must gracefully fall back to static interval for non-canonical plants |
| **Hemisphere awareness required** | `getCurrentSeason()` must accept or infer the user's hemisphere | Southern Hemisphere users receive inverted seasons; a hemisphere-unaware implementation inverts their care |
| **Countdown remains non-negative** | `Math.max(0, diff)` floor must be preserved even with seasonal `next_due_at` | Seasonal scheduling can produce longer intervals; it cannot produce negative countdowns |

---

### Phase B2.3B — Collapse Normalization Activation

**What changes:** Species input is normalized against `collapse_mappings` before alias lookup. Variant names are collapsed to canonical equivalents using confidence scoring.

**Compatibility constraints — what B2.3B MUST preserve:**

| Constraint | Requirement | Reason |
|---|---|---|
| **Alias and canonical routing preserved** | Collapse normalization is the first stage of the resolution pipeline, not a replacement for any existing stage | The waterfall order is collapse → alias → canonical → ilike → default; all four subsequent stages must remain active |
| **ilike preserved as penultimate fallback** | Even with collapse + alias + canonical active, ilike remains the last-resort lookup before default | An input that does not collapse, does not match an alias, and does not have a canonical ID should still be checked by ilike |
| **Confidence threshold must be non-zero** | A threshold of 0.0 collapses everything; a threshold of 1.0 collapses nothing | The threshold must be calibrated against real data before activation; no default value is safe without validation |
| **Collapse failure is safe** | A null return from collapse normalization (input does not match any mapping above threshold) must fall through to alias lookup without error | The fallthrough behavior of the entire resolution chain depends on every stage returning null gracefully on no-match |
| **No retroactive collapse** | Collapse normalization applies to new plant creation only | Existing plants with `species_name = "Montera"` (typo) retain their current `frequency_days`; collapse does not retroactively normalize stored names |
| **`collapse_mappings` CREATE TABLE authored before B2.3B begins** | The table has no SQL definition in any current file | B2.3B cannot begin without a migration that creates this table |

---

## CONTRACT VALIDITY SUMMARY

| Guarantee | Current status | Threat that would violate it | Earliest threat phase |
|---|---|---|---|
| Legacy onboarding continuity | ✅ HOLDING | Shim removal before migration applied | B2.2A preparation |
| Scheduler continuity | ✅ HOLDING | Seasonal write before `getDaysUntilWatering` fix | B2.3 preparation |
| Canonical nullability | ✅ HOLDING | `canonical_species_id` write to any row | B2.2A activation |
| Coexistence-safe reads | ✅ HOLDING | Named column SELECT that excludes future columns | Any phase — never change `SELECT *` |
| Coexistence-safe writes | ✅ HOLDING | Shim removal before migration applied | B2.2A preparation |
| Backward compatibility | ✅ HOLDING | Any active behavior change without phase authorization | Any phase |
| Absence of hidden propagation | ✅ HOLDING | Any canonical field reaching a DB write without shim | B2.2A preparation |
| Absence of automatic rebinding | ✅ HOLDING | Any edit path that calls `resolveSpeciesProfile` | B2.2A implementation |
| Absence of implicit migration | ✅ HOLDING | Any startup `useEffect` that executes SQL | Any phase |
| Absence of ORM sync | ✅ HOLDING | Drizzle connection string changed to Supabase URL | Any phase |
| Legacy frequency continuity | ✅ HOLDING | Any edit path that updates `care_tasks.frequency_days` | B2.2A (rebinding) |
| Static interval continuity | ✅ HOLDING | `DEFAULT_WATERING_DAYS` changed without data migration | Any phase |
| `next_due_at` coexistence | ✅ HOLDING (latent risk) | Any system writing a different `next_due_at` before the fix | B2.3 preparation |
| ilike lookup determinism | ✅ HOLDING | GIN index added without full ilike→alias transition | Any phase |
| Fallback continuity | ✅ HOLDING | Error handling changed from null-return to throw | Any phase |
| Non-destructive canonical coexistence | ✅ HOLDING | Any active code path branching on `canonical_species_id` | B2.2A activation |

**All 16 compatibility guarantees are currently holding.** No guarantee is at immediate risk. Two guarantees have latent future risks that are correctly deferred:

1. **`next_due_at` coexistence** — holding now; will fail the moment any system writes a divergent `next_due_at`. The `getDaysUntilWatering` fix eliminates this risk at zero cost, deployable immediately.

2. **Scheduler continuity** — holding now; will fail under seasonal scheduling if the `getDaysUntilWatering` fix is not deployed first. Both risks are resolved by the same single code change.

---

*This document is a read-only runtime compatibility contract. No application files, SQL files, runtime behavior, or schema state were modified in its generation. A guarantee is considered preserved if and only if the mechanism that enforces it remains intact. Supersede or amend individual guarantees only when their enforcement mechanism is deliberately altered by an authorized activation event.*
