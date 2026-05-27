---
name: Phase B1.5A Runtime Compatibility
description: Compatibility shim pattern used to make the runtime Phase 2.1 schema-compatible pre-migration; what is activated post-migration and what remains blocked.
---

## The shim pattern

`PlantInput` carries Phase 2.1 canonical fields (`user_entered_name`, `canonical_species_id`, `canonical_species_name`, `species_resolution_method`). These columns do not exist in the live DB until `supabase-migration-v2.sql` runs. Spreading `...input` into a Supabase insert with unknown columns causes a PostgREST 400 error.

Fix: destructure the Phase 2.1 fields out before the insert, use only `...v01Fields`. Applied in both `useCreatePlant` and `useUpdatePlant`. Fields are prefixed with `_` and marked `// ACTIVATE POST-MIGRATION`.

## Post-migration activation (surgical — two files)

**`hooks/usePlants.ts`** — in both `useCreatePlant` and `useUpdatePlant`:
1. Remove the 4-field destructuring block
2. Change `{ ...v01Fields, user_id: user!.id }` → `{ ...input, user_id: user!.id }`

**`lib/careProfiles.ts`** — when canonical_species seeded:
1. Uncomment `lookupByCanonicalId()` and its slot in `resolveSpeciesProfile`
2. Pass `_canonicalSpeciesId` into `resolveSpeciesProfile` in `generateDefaultCareTasks`

**`lib/careProfiles.ts`** — when alias table seeded:
1. Uncomment `lookupByAlias()` and its slot in `resolveSpeciesProfile`

## What is currently blocked (Phase 2.2)

- Supabase migration not yet applied → columns missing → canonical fields not persisted
- canonical_species table empty → no canonical ID lookup possible
- plant_aliases table empty → no alias resolution possible
- collapse_mappings table empty
- seasonal data not authored → seasonal scheduler not activatable

## Key files

- `hooks/usePlants.ts` — shim lives here
- `lib/careProfiles.ts` — routing entry point `resolveSpeciesProfile()`; all Phase 2.2 slots commented
- `lib/runtimeValidation.ts` — pure inspection utilities; identity status, migration detection, Phase 2.2 gates
- `artifacts/mobile/LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` — authoritative record + activation checklist
- `artifacts/mobile/supabase-migration-v2.sql` — ready to run; additive only; all new columns nullable

**Why:** display_name ≠ plant_name (legacy column name); canonical fields spread into insert would silently corrupt DB or hard-error until this shim was in place.
