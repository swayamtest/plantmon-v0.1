# PLANTMON — Supabase / Replit Alignment Matrix

**Classification:** Governance Reconciliation Audit  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** Full governance audit corpus (6 audits) + full governance baseline corpus (5 freeze documents) + `RUNTIME_AUTHORITY_DECLARATION.md`  

This document reconciles the assumptions embedded in Replit source files against the actual live Supabase schema topology. It does not propose fixes, generate migrations, or activate any system. It records the alignment state with precision so that future activation events begin from a verified ground truth.

---

## ALIGNMENT SUMMARY

### Five-Way Alignment Matrix

For every schema object of governance significance, the matrix below records its state across five independent planes of knowledge:

1. **Live Supabase** — what actually exists in the live DB right now (Tier 2 authority)
2. **TypeScript models** — what `artifacts/mobile/types/` declares
3. **`supabase-setup.sql`** — what the original schema file defines
4. **Migration SQL** — what the pending migrations would add (unapplied)
5. **Runtime assumption** — what the application code assumes is available at runtime

**Alignment legend:**
- ✅ EXISTS / ACTIVE — present and in use
- 🟡 DECLARED / TYPED — declared in code but not live or not actively used
- ⬜ ABSENT — not present at this layer
- 🔴 CONFLICT — assumption and reality disagree in a way that would cause a runtime error if not for a coexistence mechanism
- 🛡️ SHIM-PROTECTED — conflict exists but is blocked by the Phase 2.1 coexistence shim

---

### Core `plants` Table — Column Alignment

| Column | Live Supabase | TypeScript (`Plant`) | `setup.sql` | Migration SQL | Runtime assumption |
|---|---|---|---|---|---|
| `id` | ✅ UUID PK | ✅ `string` | ✅ defined | — | ✅ always present |
| `user_id` | ✅ UUID FK | ✅ `string` | ✅ defined | — | ✅ always written |
| `display_name` | ✅ TEXT NOT NULL | ✅ `string` | ✅ defined | — | ✅ always written |
| `species_name` | ✅ TEXT NULL | ✅ `string \| null` | ✅ defined | — | ✅ written when present |
| `room_location` | ✅ TEXT NULL | ✅ `string \| null \| undefined` | ✅ defined | — | ✅ written when present |
| `notes` | ✅ TEXT NULL | ✅ `string \| null \| undefined` | ✅ defined | — | ✅ written when present |
| `created_at` | ✅ TIMESTAMPTZ | ✅ `string \| null` | ✅ defined | — | ✅ read-only |
| `user_entered_name` | ⬜ ABSENT | 🟡 `string \| null \| undefined` (on `PlantInput`) | ⬜ absent | 🟡 added in migration | 🛡️ SHIM-PROTECTED — stripped before INSERT |
| `canonical_species_id` | ⬜ ABSENT | 🟡 `string \| null \| undefined` | ⬜ absent | 🟡 added in migration | 🛡️ SHIM-PROTECTED — stripped before INSERT |
| `canonical_species_name` | ⬜ ABSENT | 🟡 `string \| null \| undefined` | ⬜ absent | 🟡 added in migration | 🛡️ SHIM-PROTECTED — stripped before INSERT |
| `species_resolution_method` | ⬜ ABSENT | 🟡 `SpeciesResolutionMethod \| null \| undefined` | ⬜ absent | 🟡 added in migration | 🛡️ SHIM-PROTECTED — stripped before INSERT |

**Alignment finding:** All 7 v01 columns (id through created_at) are fully aligned across all five planes. All 4 Phase 2.1 columns are uniformly absent from the live DB and `setup.sql`, declared in TypeScript and the migration, and protected by the shim at runtime. No unprotected conflict exists on the `plants` table.

---

### `care_tasks` Table — Column Alignment

| Column | Live Supabase | TypeScript (`CareTask`) | `setup.sql` | Migration SQL | Runtime assumption |
|---|---|---|---|---|---|
| `id` | ✅ UUID PK | ✅ `string` | ✅ defined | — | ✅ always present |
| `plant_id` | ✅ UUID FK | ✅ `string` | ✅ defined | — | ✅ always written |
| `task_type` | ✅ TEXT | ✅ `string` | ✅ defined | — | ✅ `"watering"` / `"fertilizing"` |
| `frequency_days` | ✅ INTEGER NULL | ✅ `number \| null \| undefined` | ✅ defined | — | ✅ read in `getDaysUntilWatering` |
| `next_due_at` | ✅ TIMESTAMPTZ NULL | ✅ `string \| null \| undefined` | ✅ defined | — | 🔴 WRITE-ONLY — written on every mutation, never read by UI |
| `last_completed_at` | ✅ TIMESTAMPTZ NULL | ✅ `string \| null \| undefined` | ✅ defined | — | ✅ read in `getDaysUntilWatering` |
| `active_status` | ✅ BOOLEAN | ✅ `boolean \| undefined` | ✅ defined | — | ✅ filter in `getWateringTask` |
| `canonical_species_id` | ⬜ ABSENT | 🟡 not on `CareTask` type | ⬜ absent | 🟡 added in migration | ⬜ never written — code gap exists post-migration |

**Alignment finding — `next_due_at` anomaly:** `next_due_at` is fully aligned across all five planes (live, typed, setup.sql, migration, runtime) — but its runtime assumption is flagged 🔴 because the application writes it correctly on every mutation yet the UI computation never reads it. The column is alive; the read path is not. This is not a coexistence failure (no error is produced); it is a semantic divergence that becomes a correctness failure when seasonal scheduling writes a season-adjusted value. See `SCHEDULER_BASELINE_SNAPSHOT.md §Known Scheduler Governance Debt`.

---

### `care_logs` Table — Column Alignment

| Column | Live Supabase | TypeScript | `setup.sql` | Migration SQL | Runtime assumption |
|---|---|---|---|---|---|
| `id` | ✅ UUID PK | ✅ typed | ✅ defined | — | ✅ present |
| `plant_id` | ✅ UUID FK | ✅ typed | ✅ defined | — | ✅ written by `useWaterPlant` |
| `care_task_id` | ✅ UUID FK NULL | ✅ typed | ✅ defined | — | ✅ written when task found |
| `completed_at` | ✅ TIMESTAMPTZ | ✅ typed | ✅ defined | — | ✅ written as `now()` |
| `notes` | ✅ TEXT NULL | ✅ typed | ✅ defined | — | ⬜ never written (gap) |
| `canonical_species_id` | ⬜ ABSENT | ⬜ not typed | ⬜ absent | 🟡 added in migration | 🔴 UNPROTECTED GAP — no code ever writes this; one-line fix |

**Alignment finding — `care_logs.canonical_species_id` is the only unprotected canonical gap.** Post-migration, the column will exist and every new watering event will write `NULL` to it permanently. Unlike the `plants` table gaps (shim-protected) and `care_tasks` gaps (no runtime write attempt), `care_logs` has no shim and the code does not attempt the write. Every historical watering event is permanently unrecoverable for canonical linkage. This is the one-line fix (`useWaterPlant` INSERT) identified in `ONBOARDING_BASELINE_SNAPSHOT.md §Future Activation Dependencies`.

---

### `plant_care_profiles` Table — Column Alignment

| Column | Live Supabase | TypeScript (`PlantCareProfile`) | `setup.sql` | Migration SQL | Runtime assumption |
|---|---|---|---|---|---|
| `id` | ✅ UUID PK | ✅ typed | ✅ defined | — | ✅ present |
| `species_name` | ✅ TEXT UNIQUE | ✅ `string` | ✅ defined | — | ✅ ilike lookup target |
| `watering_frequency_days` | ✅ INTEGER | ✅ `number` | ✅ defined | — | ✅ read into `frequency_days` |
| `fertilizing_frequency_days` | ✅ INTEGER NULL | ✅ `number \| null` | ✅ defined | — | ✅ conditional fertilizing task |
| `light_requirement` | ✅ TEXT + CHECK | ✅ `string \| null \| undefined` | ✅ CHECK defined | 🟡 CHECK recreated in migration | 🔴 MIGRATION RISK — duplicate CHECK constraint possible if existing name differs |
| `water_volume_ml` | ✅ TEXT NULL | ✅ `string \| null \| undefined` | ✅ defined | — | ⬜ fetched in SELECT * but never rendered |
| `soil_type` | ✅ TEXT NULL | ✅ `string \| null \| undefined` | ✅ defined | — | ⬜ fetched but never rendered |
| `canonical_species_id` | ⬜ ABSENT | 🟡 `string \| null \| undefined` | ⬜ absent | 🟡 added in migration | 🔴 LOOKUP DEPENDENCY — `lookupByCanonicalId` requires this; routing is comment-gated |

**Alignment finding — `light_requirement` CHECK constraint risk:** The `setup.sql` defines the CHECK constraint with an auto-generated or explicit name. `supabase-migration-v2.sql` drops `plant_care_profiles` and recreates it — recreating the CHECK constraint under a new name. If the live DB has the original constraint name and the migration assumes a different name, the result is a duplicate constraint that accepts writes but creates unexpected validation behavior. This is the highest-risk operation in either pending migration. Pre-application detection query must run before this migration is applied.

---

### Phase 2.2 Tables — Existence Alignment

| Table | Live Supabase | TypeScript | `setup.sql` | Migration SQL | Runtime assumption |
|---|---|---|---|---|---|
| `canonical_species` | ⬜ ABSENT | 🟡 `CanonicalSpecies` interface typed | ⬜ absent | 🟡 created in migration | ⬜ never queried |
| `plant_aliases` | ⬜ ABSENT | 🟡 `PlantAlias` interface typed | ⬜ absent | 🟡 created in migration | ⬜ `lookupByAlias` comment-gated |
| `collapse_mappings` | ⬜ ABSENT | 🟡 `CollapseMapping` interface typed | ⬜ absent | ⬜ NOT in migration SQL | ⬜ no code exists |

**Alignment finding — `collapse_mappings` is absent from migration SQL.** `canonical_species` and `plant_aliases` are created by `supabase-migration-v2.sql`. `collapse_mappings` is typed in `types/canonical.ts` but has no CREATE TABLE statement in any SQL file. If `supabase-migration-v2.sql` is applied as-is, `collapse_mappings` still does not exist in the live DB. Any code attempting to query it post-migration would receive a PostgREST 404. No code currently queries it, but this misalignment between TypeScript declarations and migration SQL should be resolved before Phase B2.3B work begins.

---

## CANONICAL INFRASTRUCTURE ALIGNMENT

### `canonical_species`

| Dimension | State | Detail |
|---|---|---|
| Exists in Supabase? | ❌ NO | Table absent from live DB |
| Assumed in Replit TypeScript? | 🟡 TYPED | `CanonicalSpecies` interface in `types/canonical.ts`; re-exported from `types/plant.ts` |
| In `setup.sql`? | ❌ NO | Not present |
| In migration SQL? | 🟡 YES (unapplied) | `supabase-migration-v2.sql` creates `canonical_species (id TEXT PK, scientific_name TEXT, common_names TEXT[], ...)` |
| Actively used at runtime? | ❌ NO | No query to this table from any file |
| Activation status | BLOCKED — table absent; migration unapplied; no runtime query would reach it |
| Activation gate type | Double: infrastructure (migration) + data (seeding) |

---

### `plant_aliases`

| Dimension | State | Detail |
|---|---|---|
| Exists in Supabase? | ❌ NO | Table absent from live DB |
| Assumed in Replit TypeScript? | 🟡 TYPED | `PlantAlias` interface typed; `lookupByAlias` references it in commented-out function |
| In `setup.sql`? | ❌ NO | Not present |
| In migration SQL? | 🟡 YES (unapplied) | `supabase-migration-v2.sql` creates `plant_aliases (id UUID PK, canonical_species_id TEXT FK, alias_name TEXT, search_priority INTEGER, ...)` |
| Actively used at runtime? | ❌ NO | `lookupByAlias` is double-commented; table not queried |
| Activation status | BLOCKED — table absent; migration unapplied; function body commented; call site commented |
| Activation gate type | Quadruple: infrastructure (migration) + data (seeding + search_priority authoring) + code (two comment barriers) |

---

### `collapse_mappings`

| Dimension | State | Detail |
|---|---|---|
| Exists in Supabase? | ❌ NO | Table absent from live DB |
| Assumed in Replit TypeScript? | 🟡 TYPED | `CollapseMapping` interface in `types/canonical.ts`; includes `collapse_confidence`, `operational_similarity`, `consumer_recognition_overlap` fields |
| In `setup.sql`? | ❌ NO | Not present |
| In migration SQL? | ❌ NO — **ABSENT FROM ALL SQL FILES** | No CREATE TABLE for `collapse_mappings` in any SQL file; this is a TypeScript-only declaration |
| Actively used at runtime? | ❌ NO | No code references this table; no lookup function exists |
| Activation status | BLOCKED — no migration SQL, no code, no data |
| Activation gate type | Maximum: net-new migration SQL + data seeding + full implementation (no stubs exist) |

**Governance note:** `collapse_mappings` is the only canonical infrastructure component with a TypeScript declaration but no corresponding SQL definition in any file. The type exists; the table definition does not. This is a design-forward declaration — the interface was authored to define the data shape before the migration was written. Before Phase B2.3B work begins, a CREATE TABLE statement must be authored and added to either `supabase-migration-v2.sql` (if applied before B2.3B) or a new migration file.

---

### `canonical_species_id` Columns

| Location | Exists in Supabase? | Typed in Replit? | In `setup.sql`? | In migration SQL? | Written at runtime? |
|---|---|---|---|---|---|
| `plants.canonical_species_id` | ❌ NO | 🟡 YES (optional) | ❌ NO | 🟡 YES (unapplied) | 🛡️ SHIM-STRIPPED — written to `PlantInput`, stripped before INSERT |
| `care_tasks.canonical_species_id` | ❌ NO | ❌ NOT on `CareTask` | ❌ NO | 🟡 YES (unapplied) | ❌ NEVER — not in INSERT payload, not typed on CareTask |
| `care_logs.canonical_species_id` | ❌ NO | ❌ NOT typed anywhere | ❌ NO | 🟡 YES (unapplied) | ❌ NEVER — one-line code gap; permanent history loss post-migration |
| `plant_care_profiles.canonical_species_id` | ❌ NO | 🟡 YES (optional) | ❌ NO | 🟡 YES (unapplied) | ❌ NEVER — `lookupByCanonicalId` comment-gated; requires backfill |

**Alignment finding:** `canonical_species_id` propagation is uniformly absent from the live DB across all four tables. It is partially typed at the TypeScript layer (present on `Plant` and `PlantCareProfile`, absent from `CareTask` and typed nowhere for `care_logs`). The write path is blocked by the shim for `plants` and simply unimplemented for `care_tasks` and `care_logs`. The `care_logs` gap is the most consequential because it is permanent — watering history created before the fix cannot be retroactively assigned a canonical species.

---

### `species_resolution_method`

| Dimension | State | Detail |
|---|---|---|
| Exists in Supabase (`plants` table)? | ❌ NO | Column absent from live DB |
| Typed in Replit (`PlantInput`)? | 🟡 YES | `species_resolution_method?: SpeciesResolutionMethod` on `PlantInput` |
| Typed on `Plant` (the read type)? | 🟡 YES | `species_resolution_method?: SpeciesResolutionMethod \| null` |
| `SpeciesResolutionMethod` values defined? | 🟡 YES | `"ilike_species_name" \| "alias_lookup" \| "canonical_id_lookup" \| "default_fallback"` — all four defined |
| In `setup.sql`? | ❌ NO | Not present |
| In migration SQL? | 🟡 YES (unapplied) | Added to `plants` as TEXT NULL in `supabase-migration-v2.sql` |
| Populated by `resolveSpeciesProfile`? | ❌ NEVER | `SpeciesResolutionContext.method` is computed and returned but immediately discarded; never assigned to `PlantInput.species_resolution_method` |
| Written to DB at runtime? | 🛡️ SHIM-STRIPPED | Would be stripped even if populated; column absent |

**Alignment finding — double-layer discarding:** `species_resolution_method` is discarded at two independent points: (1) `resolveSpeciesProfile` returns a `SpeciesResolutionContext` containing the method, but the caller (`generateDefaultCareTasks`) destructures only `profile` and discards `context`; (2) even if `context.method` were assigned to `PlantInput.species_resolution_method`, the shim would strip it before the INSERT. The column cannot be populated by any in-app code path in the current runtime. Post-migration + post-shim-removal, an additional code change is required to wire `context.method` through to the `PlantInput` and into the INSERT payload.

---

### `user_entered_name`

| Dimension | State | Detail |
|---|---|---|
| Exists in Supabase (`plants` table)? | ❌ NO | Column absent from live DB |
| Typed in Replit (`PlantInput`)? | 🟡 YES | `user_entered_name?: string \| null` on `PlantInput` |
| Typed on `Plant` (the read type)? | 🟡 YES | `user_entered_name?: string \| null` |
| Captured at form time? | 🟡 YES (identically) | Set to `speciesName.trim() \|\| undefined` — byte-for-byte same as `species_name` |
| Distinct from `species_name` at form time? | ❌ NO | Both read from same state variable; `user_entered_name === species_name` always |
| In `setup.sql`? | ❌ NO | Not present |
| In migration SQL? | 🟡 YES (unapplied) | Added to `plants` as TEXT NULL |
| Written to DB at runtime? | 🛡️ SHIM-STRIPPED | Stripped before INSERT unconditionally |
| Edit form pre-populates from? | 🔴 WRONG FIELD | Edit form initializes `speciesName` state from `initialValues?.species_name`, not `initialValues?.user_entered_name` |

**Alignment finding — edit form pre-population conflict:** The `user_entered_name` field is intended (post-Phase-2.2) to preserve the raw user input before normalization. But the edit form pre-populates the SPECIES field from `species_name` (which post-Phase-2.2 would be normalized to a canonical name). If Phase 2.2 activates without fixing the edit form, any edit to a plant whose `species_name` was normalized would overwrite `user_entered_name` with the normalized value — eliminating the preserved raw input on save. This is the known coexistence gap from `COEXISTENCE_STATE_FREEZE.md §Coexistence Gap`.

---

## RUNTIME ACTIVATION ALIGNMENT

### Full System Activation State Matrix

| System | Schema-live? | Runtime-live? | Runtime-off? | Comment-gated? | Partially wired? |
|---|---|---|---|---|---|
| **v01 plant CRUD** | ✅ YES | ✅ YES | — | — | — |
| **ilike species resolution** | ✅ YES | ✅ YES | — | — | — |
| **7-day fallback scheduling** | ✅ YES | ✅ YES | — | — | — |
| **Watering task creation** | ✅ YES | ✅ YES | — | — | — |
| **Fertilizing task creation** | ✅ YES | ✅ YES | — | — | — |
| **Watering event logging** | ✅ YES | ✅ YES | — | — | — |
| **React Query cache layer** | ✅ YES | ✅ YES | — | — | — |
| **Phase 2.1 shim** | ✅ YES | ✅ YES (active coexistence) | — | — | — |
| **`next_due_at` write** | ✅ YES | ✅ YES | — | — | — |
| **`next_due_at` read (UI)** | ✅ YES | — | ✅ OFF | — | — |
| **`species_resolution_method` write** | ⬜ NO (column absent) | — | ✅ OFF | — | 🟡 context computed, discarded |
| **`user_entered_name` write** | ⬜ NO (column absent) | — | ✅ OFF | — | 🟡 value captured at form, stripped |
| **`canonical_species_id` write (plants)** | ⬜ NO (column absent) | — | ✅ OFF | — | 🟡 field on `PlantInput`, shim-stripped |
| **`canonical_species_id` write (care_logs)** | ⬜ NO (column absent) | — | ✅ OFF | — | ⬜ no code, no type — unimplemented |
| **Canonical routing** | ⬜ NO (tables absent) | — | ✅ OFF | ✅ YES (double) | 🟡 function body + call site |
| **Alias routing** | ⬜ NO (table absent) | — | ✅ OFF | ✅ YES (double) | 🟡 function body + call site |
| **Collapse routing** | ⬜ NO (no SQL, no code) | — | ✅ OFF | — | ⬜ not implemented |
| **Seasonal scheduling** | ⬜ NO (no seasonal columns) | — | ✅ OFF | ✅ YES | 🟡 `_season` param accepted, not used |
| **Canonical care task rebinding** | ⬜ NO | — | ✅ OFF | — | ⬜ not implemented |
| **Adaptive recurrence** | ⬜ NO | — | ✅ OFF | — | ⬜ not designed |
| **`runtimeValidation.ts` functions** | — | — | ✅ OFF | — | 🟡 compiled, zero call sites |
| **Schema migration detection** | — | — | ✅ OFF | — | 🟡 `getSchemaMigrationStatus()` compiled, uncalled |

**Definition of states used above:**
- **Schema-live** — the required DB objects exist in the live Supabase DB
- **Runtime-live** — the code path executes during normal app operation
- **Runtime-off** — the code path does not execute (but may exist)
- **Comment-gated** — inactivation is enforced by source code comments at function body and/or call site
- **Partially wired** — some code infrastructure exists (typed, parameter accepted, value computed) but the end-to-end path is not connected

---

## SCHEDULER ALIGNMENT

### What Schema Exists for Scheduling

All columns the scheduler depends on are fully live in the schema:

| Column | Table | Live? | Type | Scheduler role |
|---|---|---|---|---|
| `last_completed_at` | `care_tasks` | ✅ YES | TIMESTAMPTZ NULL | **Primary computation input** — `getDaysUntilWatering` reads this |
| `frequency_days` | `care_tasks` | ✅ YES | INTEGER NULL | **Primary computation input** — multiplied by ms-per-day |
| `next_due_at` | `care_tasks` | ✅ YES | TIMESTAMPTZ NULL | **Written** on creation and watering; **never read** by UI |
| `active_status` | `care_tasks` | ✅ YES | BOOLEAN | Filter in `getWateringTask` — only active tasks counted |
| `task_type` | `care_tasks` | ✅ YES | TEXT | Filter in `getWateringTask` — `"watering"` only |
| `plant_id` | `care_tasks` | ✅ YES | UUID FK | JOIN to plant |

**Schema-scheduler alignment: fully satisfied.** The scheduler requires no migration to function correctly. All columns it reads exist. The `next_due_at` divergence (written but not read) is a code issue, not a schema issue.

---

### What the Scheduler Actually Uses

| Data source | Scheduler usage | Alignment |
|---|---|---|
| `care_tasks.last_completed_at` | Read by `getDaysUntilWatering` step 3 | ✅ ALIGNED |
| `care_tasks.frequency_days` | Read by `getDaysUntilWatering` step 4 | ✅ ALIGNED |
| `care_tasks.active_status` | Filtered by `getWateringTask` | ✅ ALIGNED |
| `care_tasks.task_type` | Filtered by `getWateringTask` | ✅ ALIGNED |
| `care_tasks.next_due_at` | Written correctly; never read | 🔴 MISALIGNED — write path and read path use different inputs |
| `plant_care_profiles.watering_frequency_days` | Read once at task creation via `resolveSpeciesProfile` | ✅ ALIGNED |
| `plant_care_profiles.canonical_species_id` | Would be used by `lookupByCanonicalId` | ⬜ IRRELEVANT — routing comment-gated; column absent |
| `plant_care_profiles.seasonal_watering_adjustment` | Typed but column does not exist | ⬜ IGNORED — no DB column, no active code path |
| Device `Date.now()` | All countdown computations | ✅ ALIGNED (with documented timezone/DST caveats) |

---

### Ignored Fields

Fields that exist in the live schema but are fetched and never rendered or acted on:

| Field | Table | Fetched by `SELECT *`? | Used in any component? | Governance status |
|---|---|---|---|---|
| `next_due_at` | `care_tasks` | ✅ YES | ❌ NO | 🔴 Known debt — write/read divergence |
| `water_volume_ml` | `plant_care_profiles` | ✅ YES (via care_tasks JOIN? — no, separate query if any) | ❌ NO | ⬜ Profile detail fetched but not surfaced |
| `soil_type` | `plant_care_profiles` | ✅ YES | ❌ NO | ⬜ Profile detail fetched but not surfaced |
| `care_task_id` | `care_logs` | Not in main plant SELECT | — | ⬜ Written on watering; not displayed |
| `notes` | `care_logs` | Not in main plant SELECT | — | ⬜ Column exists; never written by app |

---

### Coexistence-Safe Scheduler Patterns

| Pattern | Mechanism | Safety guarantee |
|---|---|---|
| `SELECT *` on `plants?select=*,care_tasks(*)` | Forward-compatible wildcard | Post-migration, new columns appear automatically as null — no query change needed |
| `frequency_days ?? DEFAULT_WATERING_DAYS` in `useWaterPlant` | Null coalescing | If `frequency_days` is null (orphan task), defaults to 7 — no runtime error |
| `Math.max(0, diff)` in `getDaysUntilWatering` | Floor clamp | Overdue plants return 0, not negative — no UI crash |
| `getWateringTask` null guard (`!task?.last_completed_at`) | Optional chain + early return | Missing task data returns 0 without throwing |
| `task_type = "watering"` filter | Explicit type filter | Fertilizing tasks are never processed by the watering scheduler |

---

## ONBOARDING ALIGNMENT

### Live Schema Capability vs. Actual Onboarding Behavior

| Capability | Live schema supports it? | Onboarding actually does it? | Alignment |
|---|---|---|---|
| Create plant with name | ✅ YES | ✅ YES | ✅ ALIGNED |
| Create plant with species | ✅ YES | ✅ YES | ✅ ALIGNED |
| Resolve species via ilike | ✅ YES (table populated) | ✅ YES | ✅ ALIGNED |
| Apply 7-day fallback | ✅ YES | ✅ YES | ✅ ALIGNED |
| Create watering care task | ✅ YES | ✅ YES | ✅ ALIGNED |
| Create fertilizing care task | ✅ YES (if freq present) | ✅ YES (conditional) | ✅ ALIGNED |
| Store `user_entered_name` | ❌ NO (column absent) | ❌ NO (stripped) | ✅ ALIGNED (both absent) |
| Store `canonical_species_id` on plant | ❌ NO (column absent) | ❌ NO (stripped) | ✅ ALIGNED (both absent) |
| Store `species_resolution_method` | ❌ NO (column absent) | ❌ NO (stripped + discarded) | ✅ ALIGNED (both absent) |
| Resolve species via alias | ❌ NO (table absent) | ❌ NO (comment-gated) | ✅ ALIGNED (both absent) |
| Resolve species via canonical ID | ❌ NO (table absent) | ❌ NO (comment-gated) | ✅ ALIGNED (both absent) |
| Show user resolution confidence | ❌ NO (no UI) | ❌ NO (context discarded) | ✅ ALIGNED (both absent) |
| Store canonical ID on care_logs | ❌ NO (column absent) | ❌ NO (not in INSERT) | 🔴 MISALIGNED — post-migration, column exists but code never writes it |

**Alignment finding:** Onboarding is fully aligned at Phase B2.0. Every capability the schema currently supports, onboarding uses. Every capability the schema does not yet support, onboarding correctly does not attempt. The single misalignment (`care_logs.canonical_species_id`) is a post-migration future state issue — it does not affect current runtime.

---

### Inactive Routing Layers — Schema vs. Code Alignment

| Routing layer | Code exists? | Schema supports it? | Alignment |
|---|---|---|---|
| ilike lookup | ✅ ACTIVE function | ✅ `plant_care_profiles.species_name` indexed via UNIQUE | ✅ ALIGNED |
| 7-day default fallback | ✅ ACTIVE inline | ✅ no schema requirement | ✅ ALIGNED |
| Alias lookup | 🟡 COMMENTED function + call site | ❌ `plant_aliases` absent | ✅ ALIGNED (both absent/inactive) |
| Canonical ID lookup | 🟡 COMMENTED function + call site | ❌ `plant_care_profiles.canonical_species_id` absent | ✅ ALIGNED (both absent/inactive) |
| Collapse normalization | ❌ NO CODE at any layer | ❌ `collapse_mappings` absent from SQL | ✅ ALIGNED (both absent, for different reasons) |

**All routing layers are correctly aligned: active layers have live schema support; inactive layers lack both schema and code activation simultaneously.** There is no routing layer where the schema is live but the code is inactive, or where the code is active but the schema is absent.

---

### Fallback Behavior Alignment

| Fallback trigger | Detectable? | DB distinguishable? | Post-migration distinguishable? |
|---|---|---|---|
| No species entered | ❌ NO (same output as unrecognized) | ❌ NO | 🟡 PARTIAL — `species_resolution_method = "default_fallback"` if wired |
| Unrecognized species | ❌ NO | ❌ NO | 🟡 PARTIAL — same `"default_fallback"` as no-species case |
| PostgREST lookup error | ❌ NO | ❌ NO | ❌ NO — error discarded, indistinguishable from unrecognized |
| Genuine 7-day profile match | ✅ In principle (species matched) | ❌ NOT stored | 🟡 PARTIAL — `species_resolution_method = "ilike_species_name"` if wired |

**The fallback is correctly undetectable in the current schema** — not because detection is impossible, but because the required column (`species_resolution_method`) is absent and the resolution context is discarded. This is a governed limitation of Phase B2.0, not an alignment failure.

---

## GOVERNANCE CONCLUSIONS

### Where Replit Assumptions Are Stale

| Assumption location | Stale assumption | Actual state | Risk level |
|---|---|---|---|
| `types/plant.ts` — `Plant.canonical_species_id` | Column exists on `plants` | Column absent — shim prevents runtime error | LOW — managed by shim |
| `types/plant.ts` — `Plant.user_entered_name` | Column exists on `plants` | Column absent — shim prevents runtime error | LOW — managed by shim |
| `types/plant.ts` — `Plant.species_resolution_method` | Column exists on `plants` | Column absent — shim prevents runtime error | LOW — managed by shim |
| `types/canonical.ts` — `CollapseMapping` | Table exists in DB | No CREATE TABLE in any SQL file | MEDIUM — design-forward declaration without SQL backing |
| `types/plant.ts` — `PlantCareProfile.seasonal_watering_adjustment` | Seasonal adjustment column exists | No such column in `setup.sql` or migration | MEDIUM — typed field with no DB home in any SQL file |
| `types/plant.ts` — `CareTask` (implicit) | `care_tasks.canonical_species_id` typed | Column absent; not typed on `CareTask` | LOW — column absent, no code attempts write |
| Any edit form code | `user_entered_name` pre-populated from form | Edit form reads `species_name`, not `user_entered_name` | LOW — post-Phase-2.2 design issue, no current impact |

**The `PlantCareProfile.seasonal_watering_adjustment` field is the only stale assumption not covered by any SQL file.** Unlike the Phase 2.1 column gaps (which are in `supabase-migration-v2.sql`), `seasonal_watering_adjustment` appears in the TypeScript type but has no corresponding column in `setup.sql`, `supabase-migration-v2.sql`, or `PRE_DATASET_HARDENING_MIGRATION_v1.sql`. It is a forward-declaration without a migration path. Before Phase B2.3 (seasonal scheduling) work begins, a migration that adds this column must be authored.

---

### Where Governance Documents Became Stale

At Phase B2.0, all governance documents are fresh. However, these documents will become stale at specific future events:

| Document | Becomes stale when | Stale element |
|---|---|---|
| `COEXISTENCE_STATE_FREEZE.md` | `supabase-migration-v2.sql` applied | §Inactive systems: `canonical_species`, `plant_aliases` activation status changes |
| `COEXISTENCE_STATE_FREEZE.md` | Phase 2.1 shim removed | §Coexistence mechanisms: shim removed from active list |
| `SCHEDULER_BASELINE_SNAPSHOT.md` | `getDaysUntilWatering` fixed to read `next_due_at` | §Watering Computation Model: computation source changes |
| `SCHEDULER_BASELINE_SNAPSHOT.md` | Seasonal scheduler activated | §Lack of Seasonal Activation: all confirmed-absent rows change |
| `ONBOARDING_BASELINE_SNAPSHOT.md` | Alias routing uncommented | §Inactive Runtime Resolution Layers: alias lookup state changes |
| `OPERATIONAL_BASELINE_MANIFEST.md` | Any migration applied | §Live Schema State: reflects pre-migration schema |
| `MIGRATION_EXECUTION_LEDGER.md` | Either migration applied | §Migration Authority State: applied/unapplied status changes |
| `RUNTIME_AUTHORITY_DECLARATION.md` | Any tier-crossing activation event | §Governance Authority Hierarchy: Tier 2/3 alignment state changes |
| This document | Any migration applied or code activation | All alignment matrices change |

**Protocol:** Each activation event must be followed by an update to the governance documents that cover that activation's domain. The documents are not self-updating.

---

### Where Runtime Is Intentionally Conservative

The runtime is more conservative than the schema permits in three specific ways. These are deliberate governance choices, not technical limitations:

| Conservative behavior | What the schema permits | What the runtime does | Why intentionally conservative |
|---|---|---|---|
| Phase 2.1 shim strips all canonical fields | Post-migration, these columns would exist and accept writes | Shim strips them unconditionally — even post-migration they won't be written until shim is removed | Sequencing safety — shim removal is a deliberate activation event, not an automatic consequence of migration |
| `resolveSpeciesProfile` never routes to alias/canonical | Commented-out code is fully correct logic | Double-comment barrier prevents any routing to alias/canonical paths | Activation readiness — data prerequisites are not yet satisfied; routing to empty tables would produce null results indistinguishable from errors |
| `SpeciesResolutionContext` discarded | The context contains accurate method and resolution data | Caller destructures only `profile`, discards `context` | Schema prerequisite — `species_resolution_method` column absent; no point propagating context if it cannot be stored |

In all three cases, the conservative behavior is temporary. It is not an architectural choice about how the system should permanently operate — it is a phase-appropriate constraint enforced until the corresponding infrastructure activation prerequisites are met.

---

### Where Future Activation Must Remain Deferred

The following activations are explicitly deferred and must not be attempted at Phase B2.0. Each has a stated reason the deferral is non-negotiable:

| Activation | Why deferral is non-negotiable | Earliest possible phase |
|---|---|---|
| Phase 2.1 shim removal | `supabase-migration-v2.sql` unapplied — removal causes 400 Bad Request on all plant creation | After migration applied AND PostgREST cache refreshed |
| Alias routing uncomment | `plant_aliases` table absent — lookup always returns null; wasted query overhead and no safety until table exists and is seeded | Phase B2.2B, after all 8 listed prerequisites |
| Canonical routing uncomment | `plant_care_profiles.canonical_species_id` unbackfilled — lookup always returns null even post-migration | Phase B2.2A, after backfill complete |
| Collapse routing implementation | No SQL definition, no code, no data, no algorithm design | Phase B2.3B — last in activation chain |
| Seasonal scheduling activation | `getDaysUntilWatering` reads `last_completed_at + freq` — seasonal writes to `next_due_at` would diverge silently | After `getDaysUntilWatering` fix deployed; after seasonal freq columns added |
| `getSchemaMigrationStatus()` call-site activation | Zero call sites — function is correct but calling it without a display surface would discard results silently | After a diagnostic screen or startup log is designed to receive the output |
| `care_logs.canonical_species_id` write | One-line fix with no migration dependency — but activating before Phase 2.2 is live means writing null (column absent pre-migration) | Can be deployed now — **this is the only deferred activation with no hard prerequisites**; deploy before Phase 2.2 activation to avoid history gap |

**The `care_logs.canonical_species_id` write is the one deferred activation that should not remain deferred.** It has no schema dependency, no code complexity, and no sequencing risk. Every watering event that occurs before this fix creates a permanent canonical orphan in the care history log. Unlike all other deferred activations (which are correctly blocked on schema/data prerequisites), this one is blocked only by the absence of a single-line code change. It should be treated as an immediate implementation task, not a future-phase dependency.

---

## ALIGNMENT MATRIX SUMMARY

| Domain | Alignment state | Highest risk finding |
|---|---|---|
| `plants` table columns | ✅ FULLY ALIGNED | Shim-protected gaps are governed correctly |
| `care_tasks` table columns | ✅ ALIGNED with known debt | `next_due_at` write/read divergence — latent, activates on seasonal write |
| `care_logs` table columns | 🔴 POST-MIGRATION GAP | `canonical_species_id` never written — one-line fix available now |
| `plant_care_profiles` columns | ✅ ALIGNED with migration risk | CHECK constraint name conflict risk — must run detection query before migration |
| Phase 2.2 tables | ✅ UNIFORMLY ABSENT | `collapse_mappings` missing from all SQL files — TypeScript-only declaration |
| Canonical infrastructure | ✅ FULLY ISOLATED | All four canonical components absent from live DB and inactive in code |
| Scheduler | ✅ ALIGNED with known debt | `next_due_at` write-only; `seasonal_watering_adjustment` has no SQL home |
| Onboarding | ✅ ALIGNED | All active paths use only live schema; all inactive paths correctly blocked |
| Runtime activation states | ✅ ALIGNED | No unprotected conflict between schema state and code activation state |
| Governance document freshness | ✅ CURRENT AT B2.0 | Staleness triggers documented; update protocol defined |

**Overall alignment verdict at Phase B2.0:** The Supabase live schema and Replit implementation are correctly aligned for current operation. All gaps are either shim-protected, comment-gated, or intentionally absent. No unprotected schema/code conflict exists that could cause a runtime error under normal app operation. Two items require action before advancing: (1) the `care_logs.canonical_species_id` one-line fix (no prerequisites) and (2) the CHECK constraint name detection query (before `supabase-migration-v2.sql` is applied).

---

*This document is a read-only governance reconciliation audit. No application files, SQL files, schema state, or runtime behavior were modified in its generation. Supersede this document after any migration application, code activation, or schema change.*
