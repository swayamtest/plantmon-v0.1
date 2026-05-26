-- ============================================================
-- Plant Manager — Phase 2.1 Additive Migration
-- SAFE TO RUN ON LIVE DB — no destructive removals.
-- Adds canonical identity tables + new columns to existing tables.
-- Run in: Supabase Dashboard → SQL Editor
-- Idempotent: uses IF NOT EXISTS + DROP/ADD CONSTRAINT patterns.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A — NEW TABLES
-- These tables did not exist before Phase 2.1.
-- ────────────────────────────────────────────────────────────

-- A1. canonical_species
-- Permanent operational identity registry.
-- canonical_species_id is immutable — NEVER changes, NEVER recycles.
-- Format: PLANT_0001, PLANT_0002, …
CREATE TABLE IF NOT EXISTS canonical_species (
  canonical_species_id  TEXT        PRIMARY KEY,
  species_name          TEXT        NOT NULL,
  primary_archetype     TEXT,
  mainstream_priority   INTEGER,
  india_relevance       INTEGER,
  inventory_version     TEXT,
  identity_status       TEXT        NOT NULL DEFAULT 'active'
                          CHECK (identity_status IN ('active','deprecated','review_required')),
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS canonical_species_name_idx
  ON canonical_species (species_name);

CREATE INDEX IF NOT EXISTS canonical_species_priority_idx
  ON canonical_species (mainstream_priority DESC, india_relevance DESC);

ALTER TABLE canonical_species ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canonical_species: read by authenticated" ON canonical_species;
CREATE POLICY "canonical_species: read by authenticated"
  ON canonical_species FOR SELECT
  TO authenticated
  USING (true);

-- A2. plant_aliases
-- Recognition + onboarding normalization layer.
-- Aliases resolve INTO canonical_species_id — they never drive scheduling directly.
CREATE TABLE IF NOT EXISTS plant_aliases (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name            TEXT        NOT NULL,
  canonical_species_name TEXT       NOT NULL,
  canonical_species_id  TEXT        NOT NULL
                          REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE,
  alias_type            TEXT        NOT NULL
                          CHECK (alias_type IN (
                            'common_name','cultivar_name','regional_name',
                            'nursery_name','beginner_name'
                          )),
  language_region       TEXT,
  search_priority       INTEGER     NOT NULL DEFAULT 0,
  alias_confidence      FLOAT       NOT NULL DEFAULT 1.0
                          CHECK (alias_confidence BETWEEN 0 AND 1),
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plant_aliases_name_idx
  ON plant_aliases (alias_name);
CREATE INDEX IF NOT EXISTS plant_aliases_species_id_idx
  ON plant_aliases (canonical_species_id);
CREATE INDEX IF NOT EXISTS plant_aliases_priority_idx
  ON plant_aliases (search_priority DESC);

ALTER TABLE plant_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant_aliases: read by authenticated" ON plant_aliases;
CREATE POLICY "plant_aliases: read by authenticated"
  ON plant_aliases FOR SELECT
  TO authenticated
  USING (true);

-- A3. collapse_mappings
-- Operational normalization layer.
-- Maps variant species inputs → ONE canonical identity.
-- NOT a taxonomy system — purely for operational care normalization.
CREATE TABLE IF NOT EXISTS collapse_mappings (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  collapsed_species_name      TEXT    NOT NULL,
  canonical_species_name      TEXT    NOT NULL,
  canonical_species_id        TEXT    NOT NULL
                                REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE,
  collapse_reason             TEXT,
  operational_similarity      FLOAT   CHECK (operational_similarity BETWEEN 0 AND 1),
  consumer_recognition_overlap FLOAT  CHECK (consumer_recognition_overlap BETWEEN 0 AND 1),
  collapse_confidence         FLOAT   CHECK (collapse_confidence BETWEEN 0 AND 1),
  review_notes                TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS collapse_mappings_collapsed_name_idx
  ON collapse_mappings (collapsed_species_name);
CREATE INDEX IF NOT EXISTS collapse_mappings_species_id_idx
  ON collapse_mappings (canonical_species_id);

ALTER TABLE collapse_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collapse_mappings: read by authenticated" ON collapse_mappings;
CREATE POLICY "collapse_mappings: read by authenticated"
  ON collapse_mappings FOR SELECT
  TO authenticated
  USING (true);


-- ────────────────────────────────────────────────────────────
-- SECTION B — UPDATE plant_care_profiles
-- Additive only. Legacy columns (notes, watering_frequency_days,
-- fertilizing_frequency_days) preserved for backward compat.
-- ────────────────────────────────────────────────────────────

-- B1. Canonical identity link
ALTER TABLE plant_care_profiles
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS plant_care_profiles_canonical_id_idx
  ON plant_care_profiles (canonical_species_id);

-- B2. Seasonal watering frequencies (days between watering per season)
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS watering_frequency_spring  INTEGER;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS watering_frequency_summer  INTEGER;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS watering_frequency_autumn  INTEGER;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS watering_frequency_winter  INTEGER;

-- B3. Seasonal fertilizing frequencies (days between feeding per season)
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS fertilizing_frequency_spring  INTEGER;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS fertilizing_frequency_summer  INTEGER;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS fertilizing_frequency_autumn  INTEGER;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS fertilizing_frequency_winter  INTEGER;

-- B4. Method systems
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS watering_method TEXT
  CHECK (watering_method IN (
    'soak_and_drain','consistent_moisture','infrequent_deep_watering',
    'bottom_water','mist_and_airflow','submersion_soak'
  ));
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS watering_method_description   TEXT;

ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS fertilizing_method TEXT
  CHECK (fertilizing_method IN (
    'diluted_liquid_feed','slow_release_granules','compost_topdress',
    'orchid_fertilizer','low_nutrient_requirement','foliar_feed'
  ));
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS fertilizing_method_description TEXT;

ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS repotting_method TEXT
  CHECK (repotting_method IN (
    'upgrade_pot_size','refresh_substrate','bark_refresh',
    'root_division','minimal_disturbance'
  ));
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS repotting_signs              TEXT;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS repotting_method_description TEXT;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS repotting_frequency_months   INTEGER;

-- B5. Semantic intelligence (Section 7 of schema freeze doc)
-- plant_profile      → "What is this plant generally like?" (identity behavior)
-- seasonal_adjustments → "What changes this season?" (time-based operational changes)
-- care_alerts        → "What should I watch out for?" (risk prevention)
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS plant_profile        TEXT;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS seasonal_adjustments TEXT;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS care_alerts          TEXT;

-- B6. Additional runtime fields
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS placement_guidance TEXT;
ALTER TABLE plant_care_profiles ADD COLUMN IF NOT EXISTS suggested_location TEXT;

-- B7. Expand governance enums to accept both legacy + canonical values
-- light_requirement: legacy ('low','medium','full_sun') + canonical ('low_light','medium_indirect','direct_sun')
ALTER TABLE plant_care_profiles
  DROP CONSTRAINT IF EXISTS plant_care_profiles_light_requirement_check;
ALTER TABLE plant_care_profiles
  ADD CONSTRAINT plant_care_profiles_light_requirement_check
    CHECK (light_requirement IN (
      'low','medium','bright_indirect','full_sun',       -- legacy v0.1
      'low_light','medium_indirect','direct_sun'          -- canonical Phase 2.1
    ));

-- difficulty_level: legacy ('easy','hard') + canonical ('beginner','intermediate','advanced')
ALTER TABLE plant_care_profiles
  DROP CONSTRAINT IF EXISTS plant_care_profiles_difficulty_level_check;
ALTER TABLE plant_care_profiles
  ADD CONSTRAINT plant_care_profiles_difficulty_level_check
    CHECK (difficulty_level IN (
      'easy','medium','hard',                             -- legacy v0.1
      'beginner','intermediate','advanced'                -- canonical Phase 2.1
    ));


-- ────────────────────────────────────────────────────────────
-- SECTION C — UPDATE plants
-- Adds canonical identity fields. All nullable (no existing rows break).
-- display_name (legacy column name for 'plant_name' in schema freeze doc)
-- is preserved as-is for backward compat.
-- ────────────────────────────────────────────────────────────

-- C1. Canonical operational identity
ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;

-- C2. Recognition identity (raw onboarding input preserved)
ALTER TABLE plants ADD COLUMN IF NOT EXISTS user_entered_name TEXT;

-- C3. Canonical display helper (NOT runtime-stable — display only)
ALTER TABLE plants ADD COLUMN IF NOT EXISTS canonical_species_name TEXT;

-- C4. Resolution method tracking (onboarding analytics + future AI)
ALTER TABLE plants ADD COLUMN IF NOT EXISTS species_resolution_method TEXT
  CHECK (species_resolution_method IN (
    'direct_species_match','alias_match','collapse_mapping_match',
    'fuzzy_match','manual_override','unresolved'
  ));

CREATE INDEX IF NOT EXISTS plants_canonical_id_idx
  ON plants (canonical_species_id);


-- ────────────────────────────────────────────────────────────
-- SECTION D — ADD canonical_species_id TO OPERATIONAL TABLES
-- Section 4.2 of schema freeze doc: all operational tables
-- must link to canonical_species for scheduler + analytics.
-- These are nullable FKs — existing rows are unaffected.
-- ────────────────────────────────────────────────────────────

ALTER TABLE care_tasks
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;

ALTER TABLE care_logs
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;

ALTER TABLE health_logs
  ADD COLUMN IF NOT EXISTS canonical_species_id TEXT
    REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- SECTION E — EXPAND task_type ENUM
-- Phase 2.1 adds 'cleaning'. 'repotting' retained for compat
-- (repotting_tasks table is planned but not yet created).
-- ────────────────────────────────────────────────────────────

ALTER TABLE care_tasks
  DROP CONSTRAINT IF EXISTS care_tasks_task_type_check;
ALTER TABLE care_tasks
  ADD CONSTRAINT care_tasks_task_type_check
    CHECK (task_type IN ('watering','fertilizing','misting','pruning','cleaning','repotting'));

ALTER TABLE care_logs
  DROP CONSTRAINT IF EXISTS care_logs_task_type_check;
ALTER TABLE care_logs
  ADD CONSTRAINT care_logs_task_type_check
    CHECK (task_type IN ('watering','fertilizing','misting','pruning','cleaning','repotting'));


-- ────────────────────────────────────────────────────────────
-- SECTION F — MIGRATION SAFETY SUMMARY
-- No existing columns removed.
-- No existing NOT NULL constraints tightened.
-- No existing data modified.
-- Rollback: reverse with DROP COLUMN / DROP TABLE (not needed in normal flow).
-- Next step: local runtime validation, then Supabase production migration.
-- ────────────────────────────────────────────────────────────
