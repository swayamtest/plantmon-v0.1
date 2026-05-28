---
name: Runtime Topology Audit Key Findings
description: High-risk couplings, full gap register, and pre-dataset migration recommendations from Phase B1.75 audit
---

## Gap Register (from RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md, 2026-05-28)

### GAP-RAD-001 — next_due_at never updated after watering (MEDIUM)
- `getDaysUntilWatering` computes `last_completed_at + frequency_days * ms` — never reads `next_due_at`
- `useWaterPlant` updates `last_completed_at` only; `next_due_at` permanently stale after first water
- App is self-consistent today; risk activates when any system reads `next_due_at` directly from DB

### GAP-CL-001 — care_logs INSERT omits canonical_species_id (HIGH data quality)
- `useWaterPlant` INSERT: `{ plant_id, task_type, completed_at, notes }` — canonical_species_id absent
- DB column exists (migration-v2 Section D); will always be NULL in care_logs even post-Phase 2.2
- Fix: add `canonical_species_id: plant.canonical_species_id ?? null` — one line

### GAP-CT-001 — CareTask TS interface missing canonical_species_id (LOW)
- DB column exists in care_tasks (Phase 2.1); not in CareTask TypeScript interface; silently dropped at boundary
- Fix: add optional field to interface

### GAP-CL-002 — CareLog TS interface missing image_url (LOW)
- care_logs.image_url exists in DB; not in CareLog TypeScript interface

### GAP-JE-001 / GAP-HL-001 — No TS types for journal_entries or health_logs (LOW)
- Both tables exist in DB with full columns; zero TypeScript coverage; not yet built

### GAP-SEED-001 — plant_care_profiles seed only in supabase-setup.sql (MEDIUM)
- migration-v2.sql does NOT re-seed; live DB provisioned via migration-only has empty profiles table
- resolveSpeciesProfile legacy ilike path returns null silently if table empty

## Entity Alignment Summary (all confirmed against SQL)
- Plant TS type vs plants table: FULLY ALIGNED (19 columns)
- PlantCareProfile TS type vs plant_care_profiles table: FULLY ALIGNED
- CanonicalSpecies / PlantAlias / CollapseMapping: FULLY ALIGNED
- CareTask: 1 gap (canonical_species_id missing from TS interface)
- CareLog: 2 gaps (canonical_species_id, image_url missing from TS interface)

## Column Name Sharp Edges
- plants.display_name ≠ plant_name (schema freeze doc vocabulary artifact; DB is authoritative)
- plants.light_conditions vs plant_care_profiles.light_requirement (different tables, different legacy names)
- plants.humidity_preferences (plural) vs plant_care_profiles.humidity_preference (singular)

## Pre-Dataset Migration Checklist (before Phase 2.2 activation)
1. supabase-migration-v2.sql applied — verify via getSchemaMigrationStatus() on live plant row
2. PRE_DATASET_HARDENING_MIGRATION_v1.sql applied — verify via F1–F6 validation queries in that file
3. plant_care_profiles seeded with 45 species (seed is in supabase-setup.sql, not migration-v2)
4. canonical_species / plant_aliases / collapse_mappings tables empty before dataset load
5. GAP-CL-001 fix applied before Phase 2.2 to avoid permanent NULL care_log history

## Pre-Dataset Migration SQL (these were NOT in supabase-migration-v2.sql)
All 5 items below are NOW in PRE_DATASET_HARDENING_MIGRATION_v1.sql:
1. UNIQUE partial index on care_tasks(plant_id, task_type) WHERE active_status = TRUE
2. Composite index on care_tasks(plant_id, task_type, active_status)
3. GIN trgm index on plant_aliases(alias_name gin_trgm_ops) — requires pg_trgm extension
4. Composite partial index on plants(user_id, canonical_species_id) WHERE canonical_species_id IS NOT NULL
5. RLS WITH CHECK corrections on care_tasks/care_logs INSERT/UPDATE policies

## Other Notable Findings
- `@workspace/api-client-react` declared in mobile's package.json + tsconfig but never imported — dead dependency
- `CareTaskStatus` type in canonical.ts but no DB column uses it — future only
- Auth guard duplicated in 3 route files (cosmetic debt, works correctly)
- supabase-setup.sql seed uses canonical enum values; if live DB still has legacy enum values, migration REQUIRED before seeding

**Why recorded:** These were non-obvious findings requiring cross-file analysis. Not derivable from reading any single file.
