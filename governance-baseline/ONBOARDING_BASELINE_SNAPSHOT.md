# PLANTMON — Onboarding Baseline Snapshot

**Classification:** Governance Baseline Freeze  
**Status:** VALIDATED — READ-ONLY  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Source authority:** `governance-audit/replit-onboarding-audit.md`, `governance-audit/replit-runtime-risk-audit.md`, `governance-baseline/COEXISTENCE_STATE_FREEZE.md`  

This document is the authoritative onboarding behavior baseline for PLANTMON at the Phase B2.0 boundary. It records the exact plant creation flow, species resolution model, identity state, known debt, and future activation dependencies. No code was modified in its generation.

---

## ONBOARDING FLOW

### Current Plant Creation Flow

The plant creation flow is a **five-stage linear pipeline** with no branching, no species validation feedback, no autocomplete, and no user notification of resolution outcome.

```
Stage 1 — User Input Capture
  PlantForm (components/PlantForm.tsx)
    TextInput: "PLANT NAME" (required)    → displayName state
    TextInput: "SPECIES"    (optional)    → speciesName state
    TextInput: "LOCATION"   (optional)    → roomLocation state
    TextInput: "NOTES"      (optional)    → notes state

Stage 2 — Input Validation
  validate():
    if (!displayName.trim()) → error: "Plant name is required" → STOP
    species, location, notes: no validation

Stage 3 — PlantInput Construction
  onSubmit({
    display_name:     displayName.trim(),
    species_name:     speciesName.trim() || undefined,   ← empty → undefined (not "")
    user_entered_name: speciesName.trim() || undefined,  ← IDENTICAL to species_name
    room_location:    roomLocation.trim() || undefined,
    notes:            notes.trim() || undefined,
    // canonical_species_id:     never set (undefined)
    // canonical_species_name:   never set (undefined)
    // species_resolution_method: never set (undefined)
  })

Stage 4 — Phase 2.1 Shim (useCreatePlant — hooks/usePlants.ts:49–66)
  const {
    user_entered_name: _user_entered_name,          ← stripped
    canonical_species_id: _canonical_species_id,    ← stripped
    canonical_species_name: _canonical_species_name, ← stripped
    species_resolution_method: _sm,                 ← stripped
    ...v01Fields
  } = input;
  → v01Fields = { display_name, species_name, room_location, notes }

Stage 5 — Persistence + Task Generation
  supabase.from("plants").insert({ ...v01Fields, user_id: user.id })
    → plantCore returned: { id, display_name, species_name, ... }
  generateDefaultCareTasks(plantCore.id, plantCore.species_name)
    → species resolution → care task INSERT
  supabase.from("plants").select(PLANT_SELECT).eq("id", plantCore.id).single()
    → full plant record with care_tasks returned to React Query cache
```

**What the user sees:** A form with two meaningful fields (name and species). After tapping "Add Plant," a brief loading state, then navigation back to the plant list. No feedback on whether the species was recognized. No indication of the watering schedule that was assigned. No error if the species is unknown.

**What is discarded silently:**
- `user_entered_name` — captured in Stage 3, stripped in Stage 4, never reaches DB
- `SpeciesResolutionContext` — returned by `resolveSpeciesProfile`, destructured away in Stage 5
- `species_resolution_method` — never set in Stage 3, would be stripped in Stage 4 even if set

---

### Current Species Resolution Flow

Species resolution runs inside `generateDefaultCareTasks` — it is not a user-facing step. The user has no interaction with it and receives no output from it.

```
generateDefaultCareTasks(plantId, speciesName):

  Step 1 — Duplicate guard
    SELECT id FROM care_tasks
    WHERE plant_id = plantId AND task_type = 'watering' AND active_status = true
    → if row exists: RETURN EARLY (no new tasks generated)

  Step 2 — resolveSpeciesProfile({ species_name: speciesName })

    [SLOT: canonical_id_lookup — COMMENTED OUT (careProfiles.ts:98–105)]
    [SLOT: alias_lookup        — COMMENTED OUT (careProfiles.ts:107–114)]

    → lookupBySpeciesNameIlike(speciesName):
        SELECT * FROM plant_care_profiles
        WHERE species_name ILIKE '%{speciesName.trim()}%'
        ORDER BY species_name ASC
        LIMIT 1
        .maybeSingle()
        → PlantCareProfile | null

    if null:
      → { profile: null, context: { method: "default_fallback", resolved: false } }

  Step 3 — Care interval derivation
    if profile found:
      watering_fd  = profile.watering_frequency_days
      fertilizing_fd = profile.fertilizing_frequency_days  (may be null)
    if no profile:
      watering_fd  = DEFAULT_WATERING_DAYS (7)
      fertilizing_fd = not scheduled

  Step 4 — Care task INSERT
    INSERT care_tasks {
      plant_id:          plantId,
      task_type:         "watering",
      frequency_days:    watering_fd,
      next_due_at:       now + watering_fd * 86_400_000,
      active_status:     true (DB default),
      last_completed_at: null (no watering has occurred yet),
    }
    if fertilizing_fd:
      INSERT care_tasks { task_type: "fertilizing", frequency_days: fertilizing_fd, ... }

  Step 5 — Resolution context discarded
    const { profile } = await resolveSpeciesProfile(...)
    // context.method never stored, never logged, never surfaced
```

**Key behavioral facts:**
- Resolution is a single synchronous lookup — no multi-step disambiguation
- One result returned (first alphabetically) — no scoring, no ranking, no disambiguation
- Errors from Supabase are silently converted to null (the `error` field is not destructured)
- `last_completed_at` is null on creation — the countdown immediately reads `getDaysUntilWatering → 0 → "Water today"`
- The countdown resets to its full interval only after the first watering event

---

### ILIKE Lookup Behavior

`lookupBySpeciesNameIlike` is the sole active species resolution mechanism. Its behavior is fully specified and invariant across all schema states.

**Query executed:**

```sql
SELECT *
FROM plant_care_profiles
WHERE species_name ILIKE '%{speciesName.trim()}%'
ORDER BY species_name ASC
LIMIT 1;
```

**Behavior contract:**

| Property | Value |
|---|---|
| Pattern type | Substring match at any position (`%input%`) |
| Case sensitivity | Case-insensitive (PostgreSQL `ILIKE`) |
| Input normalization applied | `.trim()` — leading/trailing whitespace only |
| Internal whitespace | Preserved — `"monstera  deliciosa"` (double-space) does NOT match `"Monstera deliciosa"` |
| Ordering of results | `ORDER BY species_name ASC` — alphabetical |
| Tie resolution | First alphabetical match wins — no scoring, no preference ranking |
| Result count | `LIMIT 1` — exactly one match or null |
| No-match return | `null` → 7-day default applied |
| Error handling | `error` field not captured — PostgREST errors silently treated as null |
| Index usage | Sequential scan — `ILIKE '%pattern%'` cannot use a btree index; no GIN index on this column |

**Substring match risks:**

| User input | Could unexpectedly match |
|---|---|
| `"rose"` | `"Evening Primrose"` (if present in DB, alphabetically before `"Rose"`) |
| `"palm"` | `"Pampas Grass"` if it contains "palm" as substring |
| `"fern"` | `"Fern Palm"`, `"Maidenhair Fern"` — alphabetical ordering decides which |
| `"cat"` | Any entry containing "cat" as substring |

The user has no visibility into which profile was matched. There is no "matched to: Monstera deliciosa" confirmation in the UI.

---

### Fallback Behavior

When `lookupBySpeciesNameIlike` returns null, the fallback activates silently.

**Three conditions that trigger identical fallback output:**

| Trigger | How it occurs | User-visible signal |
|---|---|---|
| No species entered | `species_name = NULL`; ilike branch skipped by `if (input.species_name?.trim())` guard | None |
| Species entered, not recognized | ilike returns null for the input | None |
| PostgREST error during lookup | Network failure, Supabase outage, RLS denial — `error` discarded, `data = null` | None |

**Fallback output for all three conditions:**

```
frequency_days    = 7 (DEFAULT_WATERING_DAYS)
fertilizing       = not scheduled
next_due_at       = Date.now() + 7 * 86_400_000
context.method    = "default_fallback" (discarded — never stored or surfaced)
```

**The fallback is indistinguishable from a genuine 7-day species match.** A Pothos (a real 7-day watering plant, if present in `plant_care_profiles`) and an unrecognized species both produce `frequency_days = 7`. There is no field in the DB that records which of the four conditions was true. Post-migration, `species_resolution_method` would store `"ilike_species_name"` vs `"default_fallback"` — but the shim prevents this field from being written, and the context is discarded regardless.

---

## INACTIVE RUNTIME RESOLUTION LAYERS

### Alias Lookup

**State: OFF — double-commented at function body and call site**

**Function body** (`careProfiles.ts:74–88`) — commented out:
```typescript
// async function lookupByAlias(aliasName: string): Promise<PlantCareProfile | null> {
//   const { data: alias } = await supabase
//     .from("plant_aliases")
//     .select("canonical_species_id")
//     .ilike("alias_name", aliasName.trim())    // ← exact ILIKE, no % wildcards
//     .order("search_priority", { ascending: false })
//     .limit(1)
//     .maybeSingle();
//   if (!alias?.canonical_species_id) return null;
//   return lookupByCanonicalId(alias.canonical_species_id);
// }
```

**Call site** (`careProfiles.ts:107–114`) — commented out:
```typescript
// if (input.species_name?.trim()) {
//   const profile = await lookupByAlias(input.species_name);
//   if (profile) return { profile, context: { method: "alias_lookup", resolved: true } };
// }
```

**Behavioral distinction from ilike lookup (when active):**  
The alias lookup uses `ILIKE aliasName.trim()` — an exact case-insensitive match with no `%` wildcards. `"monstera"` matches `"Monstera"` but NOT `"Monstera deliciosa"`. The full alias string must be matched. This is stricter than the current ilike fallback and depends entirely on alias data quality at seed time.

**Inactivation invariant:** Uncommenting the function body alone — without the call site — produces a function that exists but is never called. Uncommenting the call site alone — without the function body — produces a compile error (`lookupByAlias` not defined). Both barriers must be removed simultaneously, and even then the lookup returns null for all inputs until `plant_aliases` is seeded with data.

---

### Collapse Routing

**State: OFF — no code exists at any layer**

Unlike alias lookup (which has commented-out code), collapse routing has **no implementation** of any kind:

| Layer | Collapse routing presence |
|---|---|
| TypeScript lookup function | ❌ DOES NOT EXIST — not even a commented stub |
| Routing slot in `resolveSpeciesProfile` | ❌ DOES NOT EXIST |
| Call site anywhere in codebase | ❌ DOES NOT EXIST |
| `collapse_mappings` query anywhere | ❌ DOES NOT EXIST |
| `collapse_mappings` table in live DB | ❌ TABLE ABSENT |
| `collapse_mappings` data | ❌ ZERO ROWS |

The `CollapseMapping` TypeScript interface exists in `types/canonical.ts` and `types/plant.ts` re-exports it — but no runtime code references either. Collapse routing is the least mature layer in the entire resolution system.

**What collapse routing would do when active:**  
Query `collapse_mappings` to map variant species input strings (e.g., multiple common names for the same plant) to canonical equivalents before alias or canonical lookup. The `CollapseMapping` interface includes `operational_similarity`, `consumer_recognition_overlap`, and `collapse_confidence` scores (0–1) to support threshold-based normalization decisions. None of this scoring logic has been designed or prototyped.

---

### Canonical Routing

**State: OFF — double-commented at function body and call site**

**Function body** (`careProfiles.ts:62–71`) — commented out:
```typescript
// async function lookupByCanonicalId(id: string): Promise<PlantCareProfile | null> {
//   const { data } = await supabase
//     .from("plant_care_profiles")
//     .select("*")
//     .eq("canonical_species_id", id)
//     .maybeSingle();
//   return (data as PlantCareProfile | null) ?? null;
// }
```

**Call site** (`careProfiles.ts:98–105`) — commented out:
```typescript
// if (input.canonical_species_id) {
//   const profile = await lookupByCanonicalId(input.canonical_species_id);
//   if (profile) return { profile, context: { method: "canonical_id_lookup", resolved: true } };
// }
```

**Why canonical routing has the strictest prerequisites:**  
Even with both layers uncommented and the migration applied, this route fires only when `input.canonical_species_id` is non-null. In the current onboarding flow, `canonical_species_id` is never set in `PlantInput` — the form has no field for it. Even post-Phase-2.2, it would be populated only after alias lookup resolves a canonical ID from the user's species input. Canonical routing is the output of alias lookup, not a parallel path.

**Lookup semantics (when active):**  
`SELECT * FROM plant_care_profiles WHERE canonical_species_id = id` — exact equality, no fuzzy matching. Depends entirely on `plant_care_profiles.canonical_species_id` being backfilled (a data prerequisite, not a code prerequisite).

---

### Archetype Routing

**State: ACTIVE LEGACY WRAPPER ONLY — `lookupCareProfile` routes to ilike exclusively**

The public resolution API is `lookupCareProfile(speciesName)` — a backward-compatibility wrapper:

```typescript
// careProfiles.ts — active
export async function lookupCareProfile(
  speciesName: string | null | undefined,
): Promise<PlantCareProfile | null> {
  const { profile } = await resolveSpeciesProfile({ species_name: speciesName });
  return profile;
}
```

This wrapper accepts `speciesName` only — not `canonical_species_id`. It cannot route to canonical or alias paths regardless of what is passed. Its purpose is to insulate legacy callers from the Phase 2.2 `resolveSpeciesProfile` API upgrade while preserving the internal routing infrastructure.

**Archetype routing state:**

| Archetype | Method | Active? |
|---|---|---|
| Legacy ilike | `lookupBySpeciesNameIlike()` | ✅ ACTIVE |
| Default fallback | Inline in `resolveSpeciesProfile` | ✅ ACTIVE |
| Alias-resolved canonical | `lookupByAlias()` | ❌ INACTIVE |
| Direct canonical ID | `lookupByCanonicalId()` | ❌ INACTIVE |
| Collapse-normalized | (no function) | ❌ NOT IMPLEMENTED |

---

## CURRENT IDENTITY BEHAVIOR

### `display_name` Usage

`display_name` is the **primary and required identity field** for every plant. It is the only field the user must provide.

**Capture:** `PlantForm.tsx:56` — `display_name: displayName.trim()`  
**Validation:** `PlantForm.tsx:47` — `if (!displayName.trim()) error: "Plant name is required"`  
**Storage:** `plants.display_name TEXT NOT NULL` — always present, no DB default  
**Usage in UI:**

| Screen | Usage | Style |
|---|---|---|
| `components/PlantCard.tsx:112` | Primary plant list title | `Inter_600SemiBold`, 16px, `foreground` color |
| `app/plant/[id].tsx:349` | Detail screen header | Primary |
| `app/plant/[id].tsx:365` | Hero card plant name | Primary |
| `app/plant/[id].tsx:249` | Delete confirmation dialog | `"${plant?.display_name}"` |

**Governance properties:**
- No minimum length constraint (a single character `"A"` is valid)
- No maximum length constraint (`TEXT` has no limit; no app-level cap)
- No character restrictions (emoji, non-Latin scripts, special characters all accepted)
- No case normalization (stored exactly as typed, after `.trim()`)
- No deduplication — multiple plants with the same `display_name` are permitted

`display_name` is the user's personal name for their plant. It is semantically distinct from `species_name` (the scientific/common species identity used for care scheduling). A plant named "Monty" with species "Monstera deliciosa" displays "Monty" prominently and "Monstera deliciosa" in muted secondary text.

---

### `user_entered_name` Handling

`user_entered_name` is captured at the form layer but **never persisted** in the current runtime.

**At capture time** (`PlantForm.tsx:62`):
```typescript
user_entered_name: speciesName.trim() || undefined,
```
This is byte-for-byte identical to the `species_name` assignment on the line above (`PlantForm.tsx:57`). Both read from the same `speciesName` state variable using the same expression. At form submission, `user_entered_name === species_name` in all cases.

**At persistence time** (`hooks/usePlants.ts:61`):
```typescript
const { user_entered_name: _user_entered_name, ... } = input;
```
The shim strips `user_entered_name` from the INSERT payload. The column does not exist in the live DB. The value is discarded at the DB boundary.

**At edit time** (`PlantForm.tsx:37`):
```typescript
const [speciesName, setSpeciesName] = useState(initialValues?.species_name ?? "");
```
The edit form pre-populates the SPECIES field from `initialValues?.species_name`, not `initialValues?.user_entered_name`. Post-Phase-2.2, where `species_name` may be normalized to a canonical species name while `user_entered_name` retains the original user input, editing a plant would overwrite `user_entered_name` with the normalized value — eliminating the preserved raw input.

**Lifecycle summary:**

| Stage | `user_entered_name` state |
|---|---|
| Form render (new plant) | Empty string (no `initialValues`) |
| User types "montera" (typo) in SPECIES field | `speciesName = "montera"` |
| Form submit | `user_entered_name = "montera"` (identical to `species_name`) |
| Shim applies | `user_entered_name` stripped from payload |
| DB INSERT executes | `user_entered_name` not written (column absent) |
| Plant loaded from DB | `user_entered_name` field is `undefined` in response |
| For all eternity | Raw user input "montera" is permanently unrecoverable |

---

### `canonical_species_id` Nullability

`canonical_species_id` is null or absent at every layer of the current onboarding output:

| Layer | `canonical_species_id` value | Reason |
|---|---|---|
| `PlantInput` from form | `undefined` | Form has no field for canonical ID; never set in handleSubmit |
| After shim | Stripped (would be `undefined` anyway) | Shim unconditionally strips it |
| `plants` row in DB | Column does not exist | Migration unapplied |
| `care_tasks` row in DB | Column does not exist | Migration unapplied |
| `care_logs` row in DB | Column does not exist | Migration unapplied |
| `plant_care_profiles` rows | Column does not exist | Migration unapplied |
| React Query cache (`Plant` object) | `undefined` (key absent from PostgREST response) | Column absent → PostgREST omits key |

**Post-migration nullability (when `supabase-migration-v2.sql` applied):**

| Layer | `canonical_species_id` value | Reason |
|---|---|---|
| `plants` row in DB | `NULL` | Column added but shim still strips writes; no resolver writes it |
| `care_tasks` row in DB | `NULL` | Column added but INSERT never includes it |
| `care_logs` row in DB | `NULL` | Column added but `useWaterPlant` INSERT never includes it |
| React Query cache (`Plant` object) | `null` (key present, value null) | PostgREST returns null for unset nullable columns |

**`getPlantIdentityStatus()` classification for all current plants:**  
`runtimeValidation.ts:16–22` defines three identity states. In the current runtime:
- Plants with `species_name` set → `"species_known"` (has species text, no canonical ID)
- Plants with no `species_name` → `"display_name_only"`
- Plants with `canonical_species_id` set → `"canonical"` — **UNREACHABLE in current runtime**

No plant in the live system can reach the `"canonical"` state.

---

### Coexistence-Safe Behavior

The onboarding pipeline is coexistence-safe by construction. Four properties confirm this:

**Property 1 — Shim guarantees schema-safe writes:**  
The INSERT payload contains exactly `{ display_name, species_name, room_location, notes, user_id }` — all columns that exist in the live DB. No Phase 2.1 column is sent to PostgREST regardless of what `PlantInput` contains.

**Property 2 — `species_name.trim() || undefined` prevents empty-string writes:**  
An empty `species_name` becomes `undefined` → omitted from the payload → `NULL` in DB. `plants.species_name IS NULL` (never entered) is cleanly distinguishable from a DB row that could theoretically hold an empty string.

**Property 3 — `PlantInput` type evolution is decoupled from DB write safety:**  
Adding more Phase 2.1 or Phase 2.2 fields to `PlantInput` does not affect the DB write as long as the shim strips them. The TypeScript type can evolve ahead of the DB schema without runtime risk.

**Property 4 — `PLANT_SELECT = "*, care_tasks(*)"` is forward-compatible:**  
Post-migration, new columns appear automatically in the SELECT response as `null` without any query change. The React Query cache shape transitions from `{ ..., canonical_species_id: undefined }` (pre-migration, key absent) to `{ ..., canonical_species_id: null }` (post-migration, key present, value null). TypeScript's `?: string | null` typing handles both correctly.

---

## KNOWN GOVERNANCE DEBT

### Silent Fallback Behavior

**Severity: HIGH — permanent data quality gap for all pre-Phase-2.2 plants**

The current fallback is invisible to the user and leaves no distinguishing marker in the DB. Three distinct conditions (no species entered, unrecognized species, lookup error) all produce identical output (`frequency_days = 7`, `species_resolution_method = NULL`).

**Consequences:**
- Users cannot verify their plant is receiving species-appropriate care
- Data analysts cannot distinguish well-resolved plants from defaulted plants without running a separate lookup
- When Phase 2.2 activates, there is no programmatic way to determine which existing plants need re-resolution vs. which genuinely have 7-day profiles
- PostgREST errors during species lookup are permanently indistinguishable from "species not in database"

**What a resolution-aware fallback would look like:**  
Surface the watering schedule to the user after onboarding ("We'll remind you to water every 7 days — you can adjust this later"). Store `species_resolution_method = "default_fallback"` vs `"ilike_species_name"` in the DB. Neither is implemented.

---

### Lack of Onboarding Confidence Visibility

**Severity: MEDIUM — UX gap; no data corruption**

`resolveSpeciesProfile` returns a `SpeciesResolutionContext` on every call:
```typescript
context: { method: SpeciesResolutionMethod, resolved: boolean }
```

This context is immediately discarded:
```typescript
const { profile } = await resolveSpeciesProfile(...);
// context garbage-collected
```

The app never surfaces to the user:
- Whether their species was recognized
- Which profile it was matched to
- What watering interval was assigned at creation
- Whether they are receiving a generic default vs. species-specific care

A user who types "Monstera deliciosa" and one who types "asdfghjkl" receive identical post-onboarding experiences. The plant list card shows the same countdown badge format for both.

---

### Unresolved Species Ambiguity

**Severity: MEDIUM — affects care quality for partial or ambiguous inputs**

The ILIKE `%pattern%` lookup has three categories of ambiguity that cannot be resolved in the current system:

**Ambiguity Type 1 — Short inputs match multiple species:**  
`"fern"` could match `"Maidenhair Fern"` (very high moisture needs) or `"Fern Palm"` (drought-tolerant). The alphabetically-first match wins. The user receives a care profile for a different plant than intended with no notification.

**Ambiguity Type 2 — Common names without scientific precision:**  
`"snake plant"` might match multiple Sansevieria/Dracaena variants with different care profiles. Only one is returned.

**Ambiguity Type 3 — Typos receive the fallback with no correction suggestion:**  
`"Montera"` (missing 's') produces no match → 7-day default. There is no "did you mean Monstera?" feedback. The user cannot distinguish their typo from an unknown species.

**Ambiguity Type 4 — No multi-word reordering:**  
`"deliciosa monstera"` does not match `"Monstera deliciosa"`. Word order must match the DB entry.

All four ambiguity types resolve silently with either a possibly-wrong profile or a 7-day default.

---

### Legacy Lookup Dependence

**Severity: MEDIUM — structural constraint; no current failure**

The entire active care intelligence system depends on a single lookup mechanism (`ILIKE '%pattern%'` on `plant_care_profiles.species_name`) that has four structural limitations:

| Limitation | Effect |
|---|---|
| Sequential scan (no GIN index on this column) | Post-dataset seeding, lookup performance degrades as profile count grows |
| Substring matching allows false positives | Short or common inputs may match unintended profiles |
| Alphabetical-first tie-breaking | Best match is not guaranteed — first alphabetical match wins |
| No error surface | PostgREST failures treated as "not found" — network issues silently default all plants |

The lookup was designed as a Phase 2.1 legacy compatibility layer — intended to be superseded by alias and canonical routing. The longer it remains the sole active mechanism, the larger the backlog of plants with ilike-derived (potentially incorrect) care profiles that will need backfilling when Phase 2.2 activates.

**The ilike dependence creates a compounding debt:**  
Every plant created pre-Phase-2.2 has a care profile derived from ilike or default fallback. When Phase 2.2 activates, existing plants will need a backfill migration to assign `canonical_species_id`. The quality of that backfill depends on whether the ilike-derived `species_name` is close enough to an alias or canonical name to resolve correctly. Plants with typos, abbreviated names, or common names that don't appear in `plant_aliases` will require manual review.

---

## FUTURE ACTIVATION DEPENDENCIES

### Alias Routing Activation

**Description:** When activated, the alias lookup becomes the second resolution attempt after canonical ID lookup fails. User species input is matched against `plant_aliases.alias_name` to derive a `canonical_species_id`, which then retrieves a care profile.

**Prerequisites:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | `supabase-migration-v2.sql` applied | DB — schema | ❌ UNAPPLIED — `plant_aliases` table absent |
| 2 | `plant_aliases` table seeded with alias rows | DB — data | ❌ NO DATA |
| 3 | `search_priority` values authored for all aliases | DB — data | ❌ NO DATA — determines tie-breaking |
| 4 | `plant_care_profiles.canonical_species_id` backfilled | DB — data | ❌ NULL on all rows — alias lookup returns null without this |
| 5 | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` applied | DB — schema | ❌ UNAPPLIED — GIN index absent |
| 6 | `lookupByAlias` function body uncommented | Code | ❌ COMMENTED OUT (`careProfiles.ts:74–88`) |
| 7 | Alias routing slot uncommented in `resolveSpeciesProfile` | Code | ❌ COMMENTED OUT (`careProfiles.ts:107–114`) |
| 8 | `lookupByCanonicalId` also uncommented | Code | ❌ COMMENTED OUT — `lookupByAlias` calls it |

**Sequencing constraint:** Dependencies 1–5 are data/schema prerequisites. They must all be satisfied before code activation (6–8) produces any non-null result. Code activation without data prerequisites produces a system where alias routing always returns null and falls through to ilike — functionally harmless but wasteful.

**Dependency 8 is non-obvious:** `lookupByAlias` internally calls `lookupByCanonicalId`. If only the alias function body is uncommented (dep 6) but `lookupByCanonicalId` remains commented out (dep 8 not satisfied), the code does not compile.

---

### Canonical Onboarding

**Description:** The onboarding pipeline resolves a `canonical_species_id` for each new plant at creation time and writes it to `plants.canonical_species_id`, `care_tasks.canonical_species_id`, and `care_logs.canonical_species_id` on all subsequent waterings.

**Prerequisites:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All alias routing activation prerequisites satisfied (1–8 above) | Mixed | ❌ NOT STARTED |
| 2 | `canonical_species` table seeded with PLANT_0001-format IDs | DB — data | ❌ TABLE ABSENT |
| 3 | Phase 2.1 shim removed from `useCreatePlant` (`usePlants.ts:49–66`) | Code | ❌ SHIM ACTIVE |
| 4 | Phase 2.1 shim removed from `useUpdatePlant` (`usePlants.ts:106–116`) | Code | ❌ SHIM ACTIVE |
| 5 | Onboarding pipeline upgraded to write `canonical_species_id` to `PlantInput` | Code | ❌ NOT IMPLEMENTED — form produces `undefined` for this field |
| 6 | `canonical_species_id` forwarded through `generateDefaultCareTasks` | Code | ❌ COMMENTED OUT (`careProfiles.ts:208`) |
| 7 | `care_tasks` INSERT updated to include `canonical_species_id` | Code | ❌ FIELD NOT IN PAYLOAD |
| 8 | `useWaterPlant` INSERT to `care_logs` updated to include `canonical_species_id` | Code | ❌ FIELD NOT IN PAYLOAD — permanent history gap |
| 9 | Backfill migration authored for existing `plants` rows | DB — data | ❌ NOT DRAFTED |

**Critical note on dependency 3 and 4 (shim removal):**  
Shim removal must be atomic with dependency 5 (canonical_species_id population). If the shim is removed before the onboarding pipeline populates `canonical_species_id`, the column is present in the schema but every write sends `null` — a technically valid write that produces no canonical resolution.

**Permanent debt note on dependency 8:**  
`useWaterPlant` writes to `care_logs` without `canonical_species_id`. This is a code-level gap independent of migration state. Every watering event — past, present, and future — permanently lacks canonical species linkage in `care_logs` until this line is changed. This is the only canonical onboarding dependency with no schema prerequisite.

---

### Collapse Normalization

**Description:** Before alias or canonical lookup, user species input is normalized against `collapse_mappings` — variant names are resolved to canonical equivalents to improve matching quality. Confidence scores gate which mappings are applied.

**Prerequisites:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All canonical onboarding prerequisites satisfied | Mixed | ❌ NOT STARTED |
| 2 | `collapse_mappings` table seeded with entries and confidence scores | DB — data | ❌ TABLE ABSENT |
| 3 | `lookupByCollapseMapping()` function authored | Code | ❌ DOES NOT EXIST |
| 4 | Confidence threshold logic designed and implemented | Design + Code | ❌ NOT DESIGNED |
| 5 | Collapse routing slot added to `resolveSpeciesProfile` | Code | ❌ DOES NOT EXIST |
| 6 | Collapsed output routed into alias/canonical lookup chain | Code | ❌ NOT DESIGNED |

**Maturity note:** Collapse normalization is the furthest from activation of any onboarding layer. It has no function stub, no routing slot, no algorithm design, and no prototype. Only the `CollapseMapping` TypeScript interface and the DB table definition exist. Net-new implementation is required at every layer.

---

### Archetype-Aware Onboarding

**Description:** The onboarding flow adapts its behavior based on the resolved identity archetype — presenting different UI affordances, schedule previews, and confirmation states depending on whether the plant resolved to a canonical identity, an alias-matched identity, an ilike approximation, or a fallback default.

**Prerequisites:**

| # | Dependency | Type | Current state |
|---|---|---|---|
| 1 | All collapse normalization prerequisites satisfied | Mixed | ❌ NOT STARTED |
| 2 | `SpeciesResolutionContext` written to DB (`species_resolution_method` on `plants`) | Code + DB | ❌ DISCARDED — shim active; column absent |
| 3 | `getPlantIdentityStatus()` called post-creation and result surfaced to UI | Code | ❌ ZERO CALL SITES — function exists in `runtimeValidation.ts` |
| 4 | UI designed for archetype-differentiated onboarding confirmation | Design | ❌ NOT DESIGNED |
| 5 | `summarizeIdentityStatus()` wired to a diagnostic or admin surface | Code | ❌ ZERO CALL SITES |
| 6 | Onboarding confidence visible to user (schedule preview, match confirmation) | Design + Code | ❌ NOT IMPLEMENTED |

**Maturity note:** Archetype-aware onboarding is the terminal dependency of the onboarding activation chain. It consumes the outputs of all prior layers (collapse normalization → alias routing → canonical routing → identity status classification) and presents them to the user. It cannot begin design until the data model and resolution pipeline are stable.

---

## ONBOARDING BASELINE SUMMARY

| Property | Current value |
|---|---|
| **Onboarding model** | Free-text capture, single-pass ilike, silent fallback |
| **Required fields** | `display_name` only |
| **Optional fields** | `species_name`, `room_location`, `notes` |
| **Species resolution mechanism** | `ILIKE '%input%'` on `plant_care_profiles.species_name` |
| **Resolution result ordering** | Alphabetical first match |
| **Fallback interval** | 7 days (hardcoded `DEFAULT_WATERING_DAYS`) |
| **User feedback on resolution** | NONE — silent in all outcomes |
| **`user_entered_name` persistence** | NEVER — stripped by shim, column absent |
| **`canonical_species_id` assigned at creation** | NEVER — column absent, resolver inactive |
| **`species_resolution_method` recorded** | NEVER — context discarded, column absent, shim active |
| **Alias routing** | OFF — double-commented |
| **Collapse routing** | OFF — not implemented |
| **Canonical routing** | OFF — double-commented |
| **Archetype routing** | OFF — legacy ilike wrapper only |
| **`runtimeValidation.ts` call sites** | ZERO — all 10 functions compiled but inert |
| **Identity status for all live plants** | `"display_name_only"` or `"species_known"` — never `"canonical"` |
| **Highest severity debt** | Silent fallback: lookup error = unrecognized species = default (indistinguishable) |
| **Fixable without migration** | `care_logs` canonical_species_id write (one-line fix in `useWaterPlant`) |

---

*This document is a read-only onboarding baseline snapshot. No application files, SQL files, or onboarding logic were modified in its generation. Supersede only after a confirmed onboarding behavior change.*
