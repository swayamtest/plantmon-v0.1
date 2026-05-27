---
name: Runtime Topology Audit Key Findings
description: High-risk couplings and pre-dataset migration recommendations from Phase B1.75 audit
---

## 3 High-Risk Couplings (must resolve before Phase 2.2)

### 1. `getDaysUntilWatering` ignores `next_due_at` (HIGH)
- Location: `types/plant.ts`
- Computes from `last_completed_at + frequency_days * ms` only
- `useWaterPlant` WRITES `next_due_at` but the UI NEVER READS IT
- Will cause visible divergence when seasonal scheduler activates (next_due_at recalculated seasonally, UI shows old value)
- **Fix:** `getDaysUntilWatering` should prefer `next_due_at` if set, fall back to computed value

### 2. `care_logs` inserts missing `canonical_species_id` (HIGH)
- Location: `hooks/usePlants.ts` → `useWaterPlant()`
- All historical care log rows will have `canonical_species_id = NULL` even for canonically-resolved plants
- **Fix at Phase 2.2 activation:** read `plant.canonical_species_id`, include in care_log insert

### 3. No backfill mechanism for pre-Phase 2.2 plants (HIGH)
- Plants created before Phase 2.2 will never have `canonical_species_id` populated
- Need a one-time backfill job: for each plant with `species_name`, look up canonical → update

---

## Pre-Dataset Migration Recommendations (before seeding canonical_species)

These are NOT in `supabase-migration-v2.sql` and should be applied as a separate pre-seeding pass:

1. **UNIQUE partial index** on `care_tasks(plant_id, task_type) WHERE active_status = TRUE`
   - Without this, app-level guard is the only protection against duplicate active tasks

2. **Composite index** on `care_tasks(plant_id, task_type, active_status)`
   - Phase 2.2 schedule recalculation will scan this frequently

3. **GIN trgm index** on `plant_aliases(alias_name gin_trgm_ops)`
   - The btree index created by migration does NOT accelerate `ilike` substring searches
   - Requires `CREATE EXTENSION pg_trgm` first

4. **Composite index** on `plants(user_id, canonical_species_id) WHERE canonical_species_id IS NOT NULL`
   - "Find all this user's plants for species X" query needs this join index

5. **RLS `WITH CHECK`** on care_tasks/care_logs INSERT/UPDATE policies
   - Currently uses `USING` on INSERT (works in Postgres but semantically wrong)

---

## Other Notable Findings

- `@workspace/api-client-react` declared in mobile's package.json + tsconfig but never imported — dead dependency
- `CareTaskStatus` type defined in canonical.ts but no DB column uses it — future only
- Auth guard is duplicated in 3 route files (cosmetic debt, works correctly)
- `supabase-setup.sql` seed uses canonical enum values; live DB has legacy enum values — migration REQUIRED before seeding

**Why recorded:** These were non-obvious findings requiring file-by-file cross-reference to discover. Not derivable from reading any single file.
