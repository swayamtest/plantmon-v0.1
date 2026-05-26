---
name: Phase 2.1 Schema Architecture
description: Canonical identity migration design decisions and backward-compat rules for PLANTMON Phase 2.1
---

## Core rule
ALL scheduling, task generation, and care logic must resolve through `canonical_species_id` (format: PLANT_0001).
Never use `species_name` or `display_name` as runtime operational identifiers.

## Column name mismatch (backward compat)
- `plants.display_name` is what the schema freeze doc calls `plant_name` (user ownership identity).
- Column was NOT renamed — all existing queries use `display_name`. Keep it.

## Four identity layers (Section 2 of schema freeze doc)
1. `display_name` — user emotional identity (editable)
2. `user_entered_name` — raw onboarding recognition input
3. `canonical_species_id` — permanent runtime operational identity
4. via `plant_care_profiles.canonical_species_id` — behavioral intelligence

## Enum governance
- Centralized in `types/canonical.ts` — no enum drift permitted anywhere else.
- `LightRequirementAny` / `DifficultyLevelAny` union types span legacy + canonical for hooks that read from DB during migration.
- Legacy DB check constraints expanded (not replaced) during migration to accept both old and new values.

## Migration safety
- `supabase-migration-v2.sql` is additive-only (ADD COLUMN IF NOT EXISTS, no DROP COLUMN).
- `task_type` keeps 'repotting' in check constraint for backward compat; 'cleaning' added.
- `canonical_species_id` FK columns are all nullable — existing rows unaffected.

**Why:** Schema freeze doc (Section 11) mandates backward compat + staged migration. Supabase push happens AFTER local runtime validation.

**How to apply:** When writing any new scheduler, query, or care logic, check that it uses `canonical_species_id` not `species_name`. When seeding new plant_care_profiles, use canonical enum values (`beginner/intermediate/advanced`, `low_light/medium_indirect/etc.`).
