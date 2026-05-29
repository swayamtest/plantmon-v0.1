# PLANTMON — Onboarding / Runtime Resolution Governance Audit

**Scope:** All files controlling plant creation, species input, identity resolution, and canonical routing  
**Type:** Read-only onboarding governance documentation  
**Generated:** May 2026  
**Source:** Direct file inspection — all findings are line-referenced  

---

## EXECUTIVE SUMMARY

PLANTMON's onboarding pipeline is a **four-step linear flow** with no branching, no species validation, no autocomplete, and no user feedback on resolution success or failure.

```
User types species name (PlantForm)
  → PlantInput built with display_name + species_name + user_entered_name [identical values]
    → useCreatePlant strips Phase 2.1 fields (shim)
      → INSERT plants (display_name + species_name only)
        → generateDefaultCareTasks(plantId, species_name)
          → resolveSpeciesProfile({ species_name }) — ilike only
            → PlantCareProfile | null
              → 7-day default if null (silent)
                → INSERT care_tasks
```

**No alias lookup is active.** No collapse mapping is queried. No canonical species ID is assigned. No fuzzy scoring beyond `ILIKE '%text%'`. No user feedback on whether the species was recognized. The user's raw species input is captured in `user_entered_name` but immediately discarded — it is stripped before the DB insert and never persisted.

---

## 1 — ALIAS LOOKUP IMPLEMENTATION

### Current state: Not implemented

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 73–88 (commented out)

```typescript
// Phase 2.2 slot: alias lookup → canonical_species_id → plant_care_profiles.
// Uncomment and implement when plant_aliases table is seeded.
//
// async function lookupByAlias(
//   aliasName: string,
// ): Promise<PlantCareProfile | null> {
//   const { data: alias } = await supabase
//     .from("plant_aliases")
//     .select("canonical_species_id")
//     .ilike("alias_name", aliasName.trim())
//     .order("search_priority", { ascending: false })
//     .limit(1)
//     .maybeSingle();
//   if (!alias?.canonical_species_id) return null;
//   return lookupByCanonicalId(alias.canonical_species_id);
// }
```

The alias lookup function is **fully written but entirely commented out**. It will not execute under any runtime condition.

### Alias lookup routing slot: also commented out

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 107–114

```typescript
// ── Phase 2.2 slot: alias lookup route ─────────────────────────────────────
// if (input.species_name?.trim()) {
//   const profile = await lookupByAlias(input.species_name);
//   if (profile) return { profile, context: { method: "alias_lookup", resolved: true } };
// }
```

Even if `lookupByAlias` were uncommented, it would not be called because its routing slot in `resolveSpeciesProfile` is also commented out.

### What the alias lookup would do (when activated)

1. Query `plant_aliases` WHERE `alias_name ILIKE aliasName.trim()` — exact case-insensitive match, no `%` wildcards
2. Order by `search_priority DESC`, take the first result
3. Extract `canonical_species_id` from the alias row
4. Call `lookupByCanonicalId(canonical_species_id)` to retrieve the care profile
5. Return the profile with `context.method = "alias_lookup"`

**Governance implications:**

| Aspect | Implication |
|---|---|
| Exact ILIKE match | Alias lookup is NOT a fuzzy search. `"snake plant"` matches `"Snake Plant"` but `"snake"` alone does not match `"Snake Plant"`. The full alias name must be typed. |
| `search_priority` ordering | When multiple aliases match (exact case-insensitive), the highest `search_priority` wins. Priority data must be authored at seed time. |
| Prerequisite: `plant_aliases` table | Table does not exist in live DB. Alias lookup will fail with a PostgREST error if activated before `supabase-migration-v2.sql` is applied. |
| Prerequisite: `plant_aliases` data | Table structure exists in SQL files but zero rows. Lookup always returns null even after table creation until seeded. |
| Two-step lookup | Alias → canonical_species_id → care profile. If `canonical_species_id` exists in `plant_aliases` but the matching `plant_care_profiles` row has no `canonical_species_id` set (not backfilled), the second step returns null. |
| No `user_entered_name` used | The alias lookup receives `input.species_name`, not `input.user_entered_name`. Post-Phase 2.2, both hold the same string at creation time (see Section 5). |

---

## 2 — FUZZY SEARCH IMPLEMENTATION

### Current state: ILIKE substring match only (not true fuzzy search)

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 44–56

```typescript
async function lookupBySpeciesNameIlike(
  speciesName: string,
): Promise<PlantCareProfile | null> {
  const { data } = await supabase
    .from("plant_care_profiles")
    .select("*")
    .ilike("species_name", `%${speciesName.trim()}%`)   // line 50
    .order("species_name")                               // line 51
    .limit(1)                                            // line 52
    .maybeSingle();

  return (data as PlantCareProfile | null) ?? null;
}
```

### Exact behavior of the ILIKE search

| Property | Value |
|---|---|
| Pattern | `%{input.trim()}%` — substring match at any position |
| Case sensitivity | Case-insensitive (PostgreSQL `ILIKE`) |
| Normalization applied before search | `.trim()` only — whitespace stripped at both ends |
| Internal whitespace | Preserved — `"monstera  deliciosa"` (double space) does NOT match `"monstera deliciosa"` (single space) |
| Ordering | `ORDER BY species_name ASC` — alphabetically first match wins |
| Result count | `LIMIT 1` — only the first match is returned |
| No-match behavior | Returns `null` — silently falls through to default fallback |
| Error behavior | PostgREST errors are swallowed by `const { data }` destructuring (no `error` captured) |

### What "fuzzy" this is NOT

| True Fuzzy Feature | Present? | Notes |
|---|---|---|
| Levenshtein/edit distance | ❌ NO | `"Monstera delciosia"` (typo) returns null — no tolerance for misspelling |
| Phonetic matching (Soundex, Metaphone) | ❌ NO | No phonetic normalization |
| Trigram similarity scoring | ❌ NO at app layer | `pg_trgm` extension is added by `PRE_DATASET_HARDENING_MIGRATION_v1.sql` but only for the `plant_aliases.alias_name` GIN index, not applied to `plant_care_profiles.species_name` |
| Ranked results | ❌ NO | First alphabetical match returned, not best match |
| Multi-word reordering | ❌ NO | `"deliciosa monstera"` does not match `"Monstera deliciosa"` |
| User feedback on match quality | ❌ NO | No indication of whether the species was recognized or defaulted |

### ILIKE search governance risks

| Risk | Severity | Notes |
|---|---|---|
| Alphabetical ordering is non-deterministic for partial matches | MEDIUM | `"ficus"` could match `"Ficus benjamina"` or `"Ficus elastica"` depending on alphabetical ordering. The user gets whichever comes first alphabetically, not the best match. |
| Silent null fallback | HIGH | If species is not found, the app silently applies `DEFAULT_WATERING_DAYS = 7`. User receives no indication that their species was unrecognized. |
| Internal whitespace not normalized | LOW | Double-space or tab-separated input will fail to match single-space entries. Unlikely but possible on mobile keyboards with autocorrect. |
| No error surface for PostgREST failures | MEDIUM | `const { data }` destructuring discards the `error` field. A network failure or Supabase error during species lookup is treated identically to a "not found" result — the app silently defaults to 7 days. |

---

## 3 — `canonical_species_id` USAGE IN ONBOARDING

### State: Zero canonical_species_id assignment in current onboarding

Every step in the current onboarding flow passes through `canonical_species_id` as either absent, stripped, or commented-out:

| Step | File | `canonical_species_id` status |
|---|---|---|
| Form input | `PlantForm.tsx:55–65` | Never set — form has no field for canonical ID. `PlantInput.canonical_species_id` is always `undefined` at form submission. |
| PlantInput type | `types/plant.ts:219` | `canonical_species_id?: string` — optional, never populated by form |
| `useCreatePlant` insert | `hooks/usePlants.ts:60–66` | Stripped by Phase 2.1 shim — even if present in PlantInput, it is excluded from the DB insert |
| `plantCore` after insert | `hooks/usePlants.ts:78–83` | `canonical_species_id: string \| null` typed — comes back as `null` from DB (column doesn't exist pre-migration, `undefined` would be returned; post-migration, `null`) |
| `generateDefaultCareTasks` call | `hooks/usePlants.ts:85` | Called as `generateDefaultCareTasks(plantCore.id, plantCore.species_name)` — `canonical_species_id` argument NOT passed |
| `generateDefaultCareTasks` signature | `careProfiles.ts:192` | `_canonicalSpeciesId?: string \| null` — accepted with underscore prefix (intentionally unused) |
| `resolveSpeciesProfile` call | `careProfiles.ts:205–209` | `canonical_species_id` slot commented out — ilike path only |
| `canonical_id_lookup` routing | `careProfiles.ts:98–105` | Entire block commented out |
| `care_tasks` INSERT | `careProfiles.ts:214–228` | No `canonical_species_id` in payload |
| `care_logs` INSERT | `hooks/usePlants.ts:159–163` | No `canonical_species_id` in payload |

**Net effect:** After a plant is created, `canonical_species_id` is `NULL` on:
- `plants` row
- All `care_tasks` rows for that plant
- All `care_logs` rows for that plant

And will remain `NULL` permanently for all pre-Phase-2.2 plants unless a backfill migration is run.

### Phase 2.2 activation requirement

For `canonical_species_id` to flow through onboarding, ALL of the following must be activated in sequence:

1. `supabase-migration-v2.sql` applied — column exists on `plants`, `care_tasks`, `care_logs`
2. `canonical_species` table seeded with PLANT_0001-format IDs
3. `plant_care_profiles.canonical_species_id` backfilled
4. Onboarding resolution pipeline upgraded to produce `canonical_species_id` (alias lookup or canonical lookup)
5. Phase 2.1 shim removed from `useCreatePlant` and `useUpdatePlant`
6. `canonical_species_id` forwarded through `generateDefaultCareTasks` (uncomment `careProfiles.ts:208`)
7. `canonical_id_lookup` route uncommented in `resolveSpeciesProfile` (uncomment `careProfiles.ts:98–105`)

Steps 1–3 are DB prerequisites. Steps 4–7 are code activation. None can be skipped or reordered.

---

## 4 — COLLAPSE MAPPING USAGE

### State: Zero usage anywhere in the codebase

**Table status:** `collapse_mappings` does not exist in the live Supabase DB. Defined in `supabase-setup.sql` (fresh install) and `supabase-migration-v2.sql` §A3 (migration). Status: UNAPPLIED.

**Application code queries:** None. A search across all application source files finds zero references to `collapse_mappings` in any active code path.

| File | Reference | Active? |
|---|---|---|
| `artifacts/mobile/supabase-setup.sql` | `CREATE TABLE collapse_mappings` | SQL definition only |
| `artifacts/mobile/supabase-migration-v2.sql` | `CREATE TABLE IF NOT EXISTS collapse_mappings` | Migration only |
| `artifacts/mobile/types/canonical.ts` | `CollapseMapping` interface | Type definition only |
| `artifacts/mobile/types/plant.ts` | `export type { CollapseMapping }` | Re-export only |
| All other files | No reference | — |

### What collapse mappings are intended to do (from type definition)

**File:** `artifacts/mobile/types/canonical.ts`

```typescript
export interface CollapseMapping {
  id: string;
  collapsed_species_name: string;   // The input variant
  canonical_species_name: string;   // The resolved canonical name
  canonical_species_id: string;     // The resolved canonical ID
  collapse_reason: string | null;
  operational_similarity: number | null;   // 0–1
  consumer_recognition_overlap: number | null;  // 0–1
  collapse_confidence: number | null;  // 0–1
  review_notes: string | null;
  created_at: string;
}
```

**Governance implication:** Collapse mappings are an operational normalization layer — they are intended to route variant species inputs (e.g., multiple Monstera cultivar names) to a single canonical identity. Until data is authored and the table is queried, all onboarding resolution bypasses this layer entirely.

No lookup function for `collapse_mappings` has been written anywhere in the application. Unlike `lookupByAlias` (which exists as commented-out code), there is no `lookupByCollapseMapping` function, not even a stub. This layer is at an earlier stage of development than the alias system.

---

## 5 — `user_entered_name` HANDLING

### At form level: identical value to `species_name`

**File:** `artifacts/mobile/components/PlantForm.tsx` — lines 36–38, 56–62

```typescript
// State:
const [speciesName, setSpeciesName] = useState(initialValues?.species_name ?? "");

// Submitted as:
await onSubmit({
  display_name: displayName.trim(),
  species_name: speciesName.trim() || undefined,   // line 57
  user_entered_name: speciesName.trim() || undefined,  // line 62
  room_location: roomLocation.trim() || undefined,
  notes: notes.trim() || undefined,
});
```

`user_entered_name` and `species_name` are assigned **from the same state variable** (`speciesName`) using the **same expression** (`speciesName.trim() || undefined`). At form submission time, they are always byte-for-byte identical.

**Intended semantic distinction** (from inline comment at line 58–61):
> `user_entered_name` preserves what the user typed before any alias/canonical normalization occurs.

This distinction is meaningful for Phase 2.2: after canonical resolution runs, `species_name` may be updated to the matched canonical species name while `user_entered_name` retains the original raw input. But **in the current implementation, no normalization occurs during onboarding** — resolution happens only in `careProfiles.ts` to look up a care profile, and the result is not written back to `species_name`. So the distinction is semantically meaningful but practically irrelevant until Phase 2.2.

### At persistence level: stripped by shim, never written to DB

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 60–66

```typescript
const {
  user_entered_name: _user_entered_name,     // line 61 — stripped
  canonical_species_id: _canonical_species_id,
  canonical_species_name: _canonical_species_name,
  species_resolution_method: _species_resolution_method,
  ...v01Fields
} = input;

supabase.from("plants").insert({ ...v01Fields, user_id: user!.id })
```

`user_entered_name` is captured by the form, passed through `PlantInput`, then immediately stripped before the Supabase insert. The value reaches the DB boundary and is discarded.

**The same strip pattern applies in `useUpdatePlant`** (lines 110–116) — editing a plant also strips `user_entered_name`.

### Persistence gap: `user_entered_name` is permanently lost for all current plants

For every plant created before `supabase-migration-v2.sql` is applied and the shim removed:
- `user_entered_name` was captured in the TypeScript layer
- `user_entered_name` was stripped before insert
- The DB column does not exist
- The raw species input typed by the user is permanently unrecoverable from the DB

This means the intended audit trail (what did the user type → what was it resolved to → what canonical ID was assigned) is broken at the first step for all pre-Phase-2.2 plants. `species_name` is the only retained species signal for these plants.

### `user_entered_name` in edit form

**File:** `artifacts/mobile/app/plant/[id].tsx` — lines 316–322

```typescript
<PlantForm
  initialValues={plant}   // ← populates initialValues from Plant record
  onSubmit={handleUpdate}
  ...
/>
```

**File:** `artifacts/mobile/components/PlantForm.tsx` — line 37

```typescript
const [speciesName, setSpeciesName] = useState(initialValues?.species_name ?? "");
```

The edit form pre-populates the "SPECIES" field from `initialValues?.species_name`, not from `initialValues?.user_entered_name`. If the two values ever diverge (post-Phase 2.2, where `species_name` may be updated to a canonical name while `user_entered_name` retains the original input), editing the plant would show the canonical species name in the field, not the user's original input. On save, `user_entered_name` would be set to the canonical name, overwriting the original input.

**Governance risk:** This is a silent overwrite. The user never sees both values and cannot distinguish between their original input and the resolved canonical name.

---

## 6 — `display_name` HANDLING

### At form level: required, whitespace-only validation

**File:** `artifacts/mobile/components/PlantForm.tsx` — lines 33–35, 45–50, 56

```typescript
const [displayName, setDisplayName] = useState(initialValues?.display_name ?? "");

const validate = () => {
  const e: Record<string, string> = {};
  if (!displayName.trim()) e.displayName = "Plant name is required";  // line 47
  setErrors(e);
  return Object.keys(e).length === 0;
};

// Submitted as:
display_name: displayName.trim(),   // line 56
```

**Validation rules applied:**
- Required: YES — empty string or whitespace-only fails
- Minimum length: NONE — a single character (`"A"`) is valid
- Maximum length: NONE — no character limit enforced at form level (DB column is `TEXT NOT NULL`, which has no length limit)
- Character restrictions: NONE — emoji, special characters, non-Latin scripts all accepted
- Case normalization: NONE — submitted exactly as typed, with only leading/trailing whitespace stripped

**Governance implications:**
- A plant named `" "` (single space) fails validation (`.trim()` produces empty string)
- A plant named `"."` (single period) passes validation
- A plant named `"🌿"` (emoji) passes validation
- A plant named with 10,000 characters passes validation

### At DB level: `TEXT NOT NULL`

**File:** `artifacts/mobile/supabase-setup.sql`

The `plants.display_name` column is `TEXT NOT NULL` with no `CHECK` constraint on length or content. The only enforcement is presence (NOT NULL). The column name is `display_name` in both the DB and all application code, despite the schema freeze document calling it `plant_name` (see schema audit for full details).

### UI rendering: `display_name` is the primary plant identity in all views

| File | Usage |
|---|---|
| `components/PlantCard.tsx:112` | `{plant.display_name}` — list item title |
| `app/plant/[id].tsx:349` | `{plant.display_name}` — detail screen header |
| `app/plant/[id].tsx:365` | `{plant.display_name}` — hero card plant name |
| `app/plant/[id].tsx:249` | `"${plant?.display_name}"` — delete confirmation dialog |
| `hooks/usePlants.ts:120` | `updated_at` update — `display_name` passed through `v01Fields` to UPDATE |

`display_name` is **always** shown as the plant's name. `species_name` is shown below it in `PlantCard` (line 113–115) and `[id].tsx` (line 366–368) only when non-null — it is a secondary label, never the primary identity.

### `display_name` vs `species_name` visual hierarchy in PlantCard

```typescript
// PlantCard.tsx:112–115
<Text style={styles.name}>{plant.display_name}</Text>
{plant.species_name ? (
  <Text style={styles.species}>{plant.species_name}</Text>
) : null}
```

`display_name` is always rendered in a larger, bolder font (`Inter_600SemiBold`, 16px). `species_name` is rendered below in a smaller, muted style (`Inter_400Regular`, 13px, `mutedForeground` color) only when it has a value.

**Governance implication:** The user's emotional/personal name for their plant (`display_name`) and the species identity used for care scheduling (`species_name`) are visually distinct. A plant named "Monty" with species "Monstera deliciosa" shows "Monty" prominently. This is architecturally sound — it correctly separates user identity from species identity.

---

## 7 — RUNTIME CANONICAL ROUTING BEHAVIOR

### Current state: No canonical routing is active

All canonical routing is defined, structured, and commented out. The runtime follows exactly one path for all plant creation:

```
resolveSpeciesProfile({ species_name })
  → [SLOT: canonical_id_lookup — COMMENTED OUT]
  → [SLOT: alias_lookup — COMMENTED OUT]
  → lookupBySpeciesNameIlike(species_name)   ← ONLY ACTIVE PATH
    → PlantCareProfile | null
  → { profile: null, context: { method: "default_fallback", resolved: false } }
```

### `SpeciesResolutionContext` is returned but never consumed

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 28–36

Every call to `resolveSpeciesProfile` returns a `SpeciesResolutionContext` alongside the profile:

```typescript
export type SpeciesResolutionContext = {
  method: SpeciesResolutionMethod;   // which path resolved the profile
  resolved: boolean;                  // whether a profile was found
};
```

However, in `generateDefaultCareTasks` (line 205):

```typescript
const { profile } = await resolveSpeciesProfile({ species_name: speciesName });
// context is destructured away — never stored, never logged, never written to DB
```

The `context` is discarded. The resolution method (ilike vs canonical vs alias vs default) is never:
- Logged
- Written to `plants.species_resolution_method` (column doesn't exist pre-migration, and even post-migration the shim prevents it)
- Surfaced to the user
- Used for any branching logic downstream

**Governance implication:** There is currently no way to audit which resolution method was used for a given plant. All plants in the live DB, regardless of how their species was or was not resolved, are indistinguishable in terms of resolution quality.

### `runtimeValidation.ts` — Phase 2.2 gate checks (diagnostic only, never called)

**File:** `artifacts/mobile/lib/runtimeValidation.ts`

Ten pure functions are defined for inspecting plant and care task state:

| Function | Purpose | Called anywhere? |
|---|---|---|
| `getPlantIdentityStatus()` | Returns `"canonical"`, `"species_known"`, or `"display_name_only"` | ❌ NO |
| `isCanonicallyResolved()` | Returns `true` if `canonical_species_id` set | ❌ NO |
| `hasResolvableSpecies()` | Returns `true` if any species signal available | ❌ NO |
| `hasUserEnteredName()` | Returns `true` if `user_entered_name` is set | ❌ NO |
| `hasActiveWateringSchedule()` | Returns `true` if active task with `frequency_days` | ❌ NO |
| `getActiveWateringTask()` | Returns the active watering task | ❌ NO |
| `getSchemaMigrationStatus()` | Detects if Phase 2.1 migration applied | ❌ NO |
| `getMigrationWarnings()` | Lists missing Phase 2.1 columns | ❌ NO |
| `isReadyForCanonicalResolution()` | Gate: has `species_name` but no `canonical_species_id` | ❌ NO |
| `summarizeIdentityStatus()` | Counts plants by identity status | ❌ NO |

None of these functions are imported by any screen, hook, or component. The file is compiled but has zero runtime call sites.

**Critical governance note on `getSchemaMigrationStatus`** — lines 76–85:

```typescript
// NOTE: Supabase returns undefined for unknown columns (not null), so
// `canonical_species_id` being `undefined` means the column doesn't exist yet.
// `canonical_species_id` being `null` means the column exists but is unset.
export function getSchemaMigrationStatus(plantRow: Record<string, unknown>): SchemaMigrationStatus {
  if (!("canonical_species_id" in plantRow)) return "not_migrated";
  if (!("user_entered_name" in plantRow)) return "not_migrated";
  return "migrated";
}
```

This function provides a programmatic way to detect whether `supabase-migration-v2.sql` has been applied — by checking whether Phase 2.1 columns appear in a PostgREST response. This is the cleanest available migration status detection mechanism. However, because the current query uses `SELECT "*, care_tasks(*)"` which returns all columns (but only existing ones), the `in` operator correctly distinguishes `undefined` (column absent) from `null` (column present, value unset).

**This function must be called somewhere before Phase 2.2 activation is enabled.** Currently it is not.

---

## 8 — COEXISTENCE-COMPATIBLE ONBOARDING LOGIC

### Pattern 1: `PlantInput` carries Phase 2.1 fields that the DB does not yet have

**File:** `artifacts/mobile/types/plant.ts` — lines 211–230

`PlantInput` includes:
- `user_entered_name?: string`
- `canonical_species_id?: string`
- `canonical_species_name?: string`
- `species_resolution_method?: SpeciesResolutionMethod`

These fields are populated (for `user_entered_name`) or typed but never populated (for canonical fields) at the form layer. The DB does not yet have these columns. The shim strips them before insert. This allows the TypeScript model to evolve ahead of the DB without runtime errors.

**Coexistence function:** The form can be extended to populate canonical fields in the TypeScript layer without any DB change — the data is ready to persist the moment the shim is removed.

---

### Pattern 2: `species_name.trim() || undefined` empty-string normalization

**File:** `artifacts/mobile/components/PlantForm.tsx` — line 57

```typescript
species_name: speciesName.trim() || undefined,
```

An empty species input is converted to `undefined` (not an empty string). This ensures the DB insert does not attempt to write an empty string to `plants.species_name` (which would pass NOT NULL if present, but semantically means "no species entered"). The DB receives `species_name = null` when `undefined` is passed in the insert object (Supabase omits undefined fields from the payload).

**Coexistence function:** This means `species_name IS NULL` (never entered species) is distinguishable from `species_name = ''` (empty string entered) in the DB. All "no species entered" plants have `species_name = NULL`, which is the correct sentinel for "skip ilike lookup."

**The same normalization applies to `user_entered_name`** (line 62) — same expression, same coexistence function.

---

### Pattern 3: `resolveSpeciesProfile` accepts `canonical_species_id` input but doesn't use it

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 14–20

```typescript
export type SpeciesResolutionInput = {
  species_name: string | null | undefined;
  canonical_species_id?: string | null;    // Phase 2.2 slot
};
```

The input type already supports `canonical_species_id`. The router accepts it today without error. Only the routing logic (commented out) needs to be activated. No type changes required at activation time.

---

### Pattern 4: `SpeciesResolutionMethod` typed for all four states

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 22–26

```typescript
export type SpeciesResolutionMethod =
  | "canonical_id_lookup"   // Phase 2.2
  | "alias_lookup"          // Phase 2.2
  | "ilike_species_name"    // Phase 2.1 current
  | "default_fallback";     // No profile
```

The method enum is fully typed for all four resolution paths. The `context.method` field is already being populated correctly by the current ilike path and the default fallback. When new paths are activated, they slot into this enum without type changes.

---

### Pattern 5: `SELECT "*, care_tasks(*)"` forward-compatible query

**File:** `artifacts/mobile/hooks/usePlants.ts` — line 9

```typescript
const PLANT_SELECT = "*, care_tasks(*)";
```

After `supabase-migration-v2.sql` runs, PostgREST will return all new columns (`canonical_species_id`, `user_entered_name`, etc.) as `null` values in the same response without any query change. Pre-migration, these columns simply aren't present in the response (`undefined` in JavaScript). The `*` selector handles both states.

---

## 9 — UNRESOLVED ONBOARDING FLOWS

### Flow 1: Species entered but not recognized — no user feedback

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 124–128

```typescript
return {
  profile: null,
  context: { method: "default_fallback", resolved: false },
};
```

When `resolveSpeciesProfile` returns `null`, the scheduler silently applies `DEFAULT_WATERING_DAYS = 7`. The user:
- Is not notified that their species was not recognized
- Cannot distinguish between "recognized, 7-day species" and "unrecognized, 7-day default"
- Has no path to correct the species entry or confirm the schedule
- Sees no indication that their plant is receiving generic care

**Governance risk:** The unresolved onboarding path is invisible. Users may assume their plant is receiving species-appropriate care when it is receiving a generic default.

---

### Flow 2: No species entered — same silent default

When `display_name` is entered but `species_name` is left blank:

```typescript
// PlantForm.tsx:57 — species_name becomes undefined
species_name: speciesName.trim() || undefined,

// careProfiles.ts:117 — ilike branch skipped entirely
if (input.species_name?.trim()) { ... }
// Falls through to default_fallback immediately
```

A no-species plant and an unrecognized-species plant follow the same silent default path. Both get 7-day watering. The distinction between "I don't know the species" and "I entered a species name that wasn't found" is not preserved in the DB or surfaced to the user.

---

### Flow 3: Species edit does not update care schedule

**File:** `artifacts/mobile/hooks/usePlants.ts` — lines 102–131

`useUpdatePlant` updates only the `plants` row. It does not:
- Call `resolveSpeciesProfile` with the new species name
- Call `generateDefaultCareTasks` with the new species name
- Update `care_tasks.frequency_days`
- Re-derive `next_due_at`

A user who adds "Cactus" (resolves to 30-day profile) then edits to "Maidenhair Fern" (should be 3-day) retains the 30-day watering task permanently.

The edit form does not display the current watering schedule, so the user has no signal that their schedule is now wrong.

---

### Flow 4: `user_entered_name` and `species_name` diverge post-Phase 2.2 but edit overwrites `user_entered_name`

As described in Section 5: after Phase 2.2, `species_name` may be normalized (e.g., replaced with the canonical species name after alias resolution) while `user_entered_name` retains the original input. The edit form pre-populates the SPECIES field from `species_name`, not `user_entered_name`. On save, `user_entered_name` is set to the current (normalized) `species_name` value, overwriting the original. The original input is permanently lost.

This flow has no current runtime impact (Phase 2.2 not active) but is a structural risk in the existing form implementation.

---

### Flow 5: PostgREST error during species lookup treated as "not found"

**File:** `artifacts/mobile/lib/careProfiles.ts` — lines 47–55

```typescript
const { data } = await supabase
  .from("plant_care_profiles")
  .select("*")
  .ilike(...)
  .maybeSingle();

return (data as PlantCareProfile | null) ?? null;
```

The Supabase client returns `{ data, error }`. Only `data` is destructured. If the query fails (network error, Supabase outage, RLS denial, malformed query), `data` will be `null` and the error is silently discarded. The plant is created with default 7-day watering as if the species was simply not found.

A user creating a plant during a Supabase service disruption will permanently receive a generic 7-day schedule with no indication that the species lookup failed.

---

### Flow 6: No autocomplete or suggestions during species entry

The SPECIES field in `PlantForm` is a plain `TextInput` with no:
- Autocomplete dropdown
- Species suggestion list
- Real-time search as the user types
- "Did you mean?" correction
- Validation that the species was recognized

The species is submitted as free text, and resolution happens invisibly in the background during task generation. The user has no feedback loop during entry.

---

## 10 — HIDDEN NORMALIZATION RISKS

### Risk 1: `user_entered_name === species_name` at write time — distinction meaningless pre-Phase 2.2

**File:** `PlantForm.tsx:57,62`

Both fields are set from `speciesName.trim() || undefined`. The intended semantic distinction (raw input vs normalized species name) does not exist in practice because no normalization runs during onboarding. Any analytics or audit trail that assumes `user_entered_name ≠ species_name` will be incorrect for pre-Phase-2.2 plants.

After Phase 2.2: if `species_name` is updated to a canonical name during resolution but `user_entered_name` is not updated (correct behavior), the two fields diverge correctly. But the edit form's overwrite risk (Flow 4 above) can re-collapse them.

---

### Risk 2: `.trim()` whitespace normalization is the only normalization applied

**File:** `PlantForm.tsx:56–62`, `careProfiles.ts:50`

The form applies `.trim()` before submission. The ilike lookup applies `.trim()` before the query pattern. No other normalization is applied:

| Input transformation | Applied? |
|---|---|
| `.trim()` (leading/trailing whitespace) | ✅ YES — form and lookup |
| `.toLowerCase()` (case fold) | ❌ NO — ILIKE handles case at DB level, but the stored `species_name` retains original case |
| Internal whitespace collapse | ❌ NO — double spaces preserved |
| Unicode normalization (NFC/NFD) | ❌ NO — accented characters stored as-is |
| Diacritic removal | ❌ NO — `"Münz"` and `"Munz"` are distinct |

**Governance risk:** `species_name` values in the DB will have mixed case, inconsistent spacing, and varying Unicode normalization depending on what the user typed. When Phase 2.2 begins normalizing species names, or when alias lookup compares inputs, inconsistent normalization at write time creates a fragmented dataset.

---

### Risk 3: ILIKE `%pattern%` can match unintended entries

The `%{speciesName}%` pattern matches the input as a substring at any position. For short or common inputs:

| Input | Could match |
|---|---|
| `"rose"` | `"Evening Primrose"`, `"Rosemary"`, `"Roseapple"` |
| `"fern"` | `"Maidenhair Fern"`, `"Fern Palm"`, `"Ferncroft"` |
| `"palm"` | `"Palm Lily"`, `"Pampas Grass"` (unlikely but depends on DB contents) |
| `"cat"` | Any species name containing the substring "cat" |

First alphabetical match wins. A user typing "rose" intending "Climbing Rose" might get "Evening Primrose" if it sorts alphabetically first. The user has no visibility into which profile was matched.

---

### Risk 4: ilike lookup queries all 46 care profile rows on every plant creation

**File:** `careProfiles.ts:47–55`

The lookup performs a full table scan of `plant_care_profiles` on every plant creation. With 46 rows, this is negligible. At 460 rows or 4,600 rows (post-dataset seeding), this remains fast with the existing `species_name` UNIQUE index (which supports equality lookups efficiently) but `ILIKE '%pattern%'` cannot use a btree index — it always requires a sequential scan or a trigram index.

`PRE_DATASET_HARDENING_MIGRATION_v1.sql` adds a GIN trigram index on `plant_aliases.alias_name` but NOT on `plant_care_profiles.species_name`. Post-dataset seeding, the ilike fallback on care profiles could become slow without a GIN index on that column.

---

### Risk 5: `speciesName.trim() || undefined` — falsy coercion includes `"0"`

**File:** `PlantForm.tsx:57,62`

```typescript
species_name: speciesName.trim() || undefined,
```

The `||` operator converts any falsy string to `undefined`. `"0".trim()` is `"0"` (truthy), so `"0"` would be stored as a species name. Only the empty string is coerced to `undefined`. This is correct behavior, but it means species names that are numbers (e.g., a user typing "0" accidentally) would be stored and trigger an ilike lookup with pattern `%0%` — matching any species name containing "0".

---

### Risk 6: No deduplication — identical plants can be created

There is no guard against creating multiple plants with the same `display_name` and `species_name`. A user could accidentally create ten plants named "Monty" all with species "Monstera deliciosa". The DB has no UNIQUE constraint on `(user_id, display_name)` or `(user_id, display_name, species_name)`. Each plant receives its own care tasks independently.

---

### Risk 7: `generateDefaultCareTasks` is async but errors are not surfaced to the user

**File:** `hooks/usePlants.ts` — lines 84–86

```typescript
// 2. Auto-generate default care tasks based on species (or fallback defaults)
await generateDefaultCareTasks(plantCore.id, plantCore.species_name);
```

If `generateDefaultCareTasks` throws (e.g., the care_tasks INSERT fails), the error propagates to `useCreatePlant`'s `mutationFn`, which surfaces it as a mutation error in `new.tsx`'s `submitError` banner (line 27–33).

However, the plant row has already been committed at this point (line 69–76). A task generation failure produces a plant in the DB with no care tasks, while the user sees an error banner and may believe the plant creation failed. The user might:
- Try to add the plant again (creating a duplicate)
- Give up and have an orphan plant with no schedule

There is no transactional wrapper around the plant INSERT + task INSERT. They are separate Supabase operations with no rollback mechanism.

---

## GOVERNANCE SUMMARY TABLE

| Finding | Severity | Managed? | Resolution Path |
|---|---|---|---|
| Alias lookup fully written but commented out | HIGH | YES — Phase 2.2 slot | Uncomment after alias table seeded |
| Zero true fuzzy matching — ILIKE only | HIGH | PARTIAL — ilike covers partial text | Add trigram index on `plant_care_profiles.species_name` |
| `canonical_species_id` never assigned at onboarding | HIGH | YES — shim + Phase 2.2 slots | Activate post-migration + seeding |
| `collapse_mappings` — zero code, zero data, zero queries | MEDIUM | YES — future phase | Author data + write lookup function |
| `user_entered_name === species_name` at write time | MEDIUM | YES — intentional pre-2.2 | Distinct post-Phase 2.2 normalization |
| `user_entered_name` stripped, never persisted | HIGH | YES — shim | Remove shim after migration applied |
| Edit form overwrites `user_entered_name` | MEDIUM | NO | Populate from `user_entered_name`, not `species_name` |
| No user feedback on unrecognized species | HIGH | NO | Surface default state in UI |
| Species edit doesn't update care schedule | MEDIUM | NO | Re-resolve and re-task on `species_name` change |
| `SpeciesResolutionContext` returned but discarded | MEDIUM | NO | Write to `species_resolution_method` post-migration |
| All `runtimeValidation.ts` functions uncalled | LOW | YES — diagnostic layer ready | Call at Phase 2.2 activation gating |
| ILIKE can match unintended entries (substring) | MEDIUM | NO | Add scoring / ranking; show user which profile matched |
| PostgREST errors treated as "not found" | MEDIUM | NO | Capture and surface `error` from Supabase responses |
| No autocomplete during species entry | HIGH | NO — known MVP gap | Phase 2.2 alias search feature |
| No transactional guard on plant + task creation | MEDIUM | NO | Orphan plant risk on task INSERT failure |
| No UNIQUE constraint on `(user_id, display_name)` | LOW | NO | Add constraint to prevent accidental duplicates |

---

*This document is read-only onboarding governance documentation. No files were modified in its generation. Reflects project state as of Phase B2.0.*
