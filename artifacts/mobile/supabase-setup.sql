-- ============================================================
-- Plant Manager — Full Schema (Phase 2.1)
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to re-run: drops existing tables first (dev reset only).
-- For live upgrades use: supabase-migration-v2.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Drop existing tables (ordered to respect foreign keys)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS health_logs          CASCADE;
DROP TABLE IF EXISTS journal_entries      CASCADE;
DROP TABLE IF EXISTS care_logs            CASCADE;
DROP TABLE IF EXISTS care_tasks           CASCADE;
DROP TABLE IF EXISTS plants               CASCADE;
DROP TABLE IF EXISTS plant_care_profiles  CASCADE;
DROP TABLE IF EXISTS plant_aliases        CASCADE;
DROP TABLE IF EXISTS collapse_mappings    CASCADE;
DROP TABLE IF EXISTS canonical_species    CASCADE;

-- ────────────────────────────────────────────────────────────
-- 1. Shared helper: auto-update updated_at column
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 2. canonical_species
--    Permanent operational identity registry.
--    canonical_species_id is immutable — NEVER changes or recycles.
--    Format: PLANT_0001, PLANT_0002, …
--    All scheduling/care/analytics MUST link through this table.
-- ────────────────────────────────────────────────────────────
CREATE TABLE canonical_species (
  canonical_species_id  TEXT        PRIMARY KEY,
  species_name          TEXT        NOT NULL,
  primary_archetype     TEXT,                       -- metadata only; NOT inheritance
  mainstream_priority   INTEGER,                    -- onboarding weighting
  india_relevance       INTEGER,                    -- localization weighting
  inventory_version     TEXT,                       -- dataset tracking
  identity_status       TEXT        NOT NULL DEFAULT 'active'
                          CHECK (identity_status IN ('active','deprecated','review_required')),
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX canonical_species_name_idx     ON canonical_species (species_name);
CREATE INDEX canonical_species_priority_idx ON canonical_species (mainstream_priority DESC, india_relevance DESC);

ALTER TABLE canonical_species ENABLE ROW LEVEL SECURITY;
CREATE POLICY "canonical_species: read by authenticated"
  ON canonical_species FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 3. plant_aliases
--    Recognition + onboarding normalization layer.
--    Aliases are onboarding tools ONLY.
--    They MUST resolve into canonical_species_id.
--    They MUST NOT drive scheduling directly.
-- ────────────────────────────────────────────────────────────
CREATE TABLE plant_aliases (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name             TEXT        NOT NULL,
  canonical_species_name TEXT        NOT NULL,
  canonical_species_id   TEXT        NOT NULL
                           REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE,
  alias_type             TEXT        NOT NULL
                           CHECK (alias_type IN (
                             'common_name','cultivar_name','regional_name',
                             'nursery_name','beginner_name'
                           )),
  language_region        TEXT,
  search_priority        INTEGER     NOT NULL DEFAULT 0,
  alias_confidence       FLOAT       NOT NULL DEFAULT 1.0
                           CHECK (alias_confidence BETWEEN 0 AND 1),
  review_notes           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX plant_aliases_name_idx       ON plant_aliases (alias_name);
CREATE INDEX plant_aliases_species_id_idx ON plant_aliases (canonical_species_id);
CREATE INDEX plant_aliases_priority_idx   ON plant_aliases (search_priority DESC);

ALTER TABLE plant_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plant_aliases: read by authenticated"
  ON plant_aliases FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. collapse_mappings
--    Operational normalization layer.
--    NOT a taxonomy system — maps variant inputs to one canonical ID.
--    Every mapping MUST terminate in exactly ONE canonical_species_id.
-- ────────────────────────────────────────────────────────────
CREATE TABLE collapse_mappings (
  id                           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  collapsed_species_name       TEXT    NOT NULL,
  canonical_species_name       TEXT    NOT NULL,
  canonical_species_id         TEXT    NOT NULL
                                 REFERENCES canonical_species(canonical_species_id) ON DELETE CASCADE,
  collapse_reason              TEXT,
  operational_similarity       FLOAT   CHECK (operational_similarity BETWEEN 0 AND 1),
  consumer_recognition_overlap FLOAT   CHECK (consumer_recognition_overlap BETWEEN 0 AND 1),
  collapse_confidence          FLOAT   CHECK (collapse_confidence BETWEEN 0 AND 1),
  review_notes                 TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX collapse_mappings_collapsed_name_idx ON collapse_mappings (collapsed_species_name);
CREATE INDEX collapse_mappings_species_id_idx     ON collapse_mappings (canonical_species_id);

ALTER TABLE collapse_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collapse_mappings: read by authenticated"
  ON collapse_mappings FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 5. plant_care_profiles
--    Operational source-of-truth for care intelligence.
--    Species-scoped (not user-scoped). Admin-seeded.
--    ALL scheduling MUST derive from here via canonical_species_id.
-- ────────────────────────────────────────────────────────────
CREATE TABLE plant_care_profiles (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canonical identity link (Phase 2.1)
  canonical_species_id      TEXT
                              REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL,

  -- Legacy identity (kept for ilike lookup backward compat)
  species_name              TEXT        NOT NULL UNIQUE,

  -- ── Legacy scheduling (superseded by seasonal fields; kept during migration) ──
  watering_frequency_days   INTEGER     NOT NULL DEFAULT 7,
  fertilizing_frequency_days INTEGER,

  -- ── Seasonal watering frequencies (days between watering) ──
  watering_frequency_spring INTEGER,
  watering_frequency_summer INTEGER,
  watering_frequency_autumn INTEGER,
  watering_frequency_winter INTEGER,

  -- ── Seasonal fertilizing frequencies (days between feeding) ──
  fertilizing_frequency_spring INTEGER,
  fertilizing_frequency_summer INTEGER,
  fertilizing_frequency_autumn INTEGER,
  fertilizing_frequency_winter INTEGER,

  -- ── Method systems ─────────────────────────────────────────
  watering_method           TEXT        CHECK (watering_method IN (
                              'soak_and_drain','consistent_moisture','infrequent_deep_watering',
                              'bottom_water','mist_and_airflow','submersion_soak'
                            )),
  watering_method_description TEXT,

  fertilizing_method        TEXT        CHECK (fertilizing_method IN (
                              'diluted_liquid_feed','slow_release_granules','compost_topdress',
                              'orchid_fertilizer','low_nutrient_requirement','foliar_feed'
                            )),
  fertilizing_method_description TEXT,

  repotting_method          TEXT        CHECK (repotting_method IN (
                              'upgrade_pot_size','refresh_substrate','bark_refresh',
                              'root_division','minimal_disturbance'
                            )),
  repotting_signs           TEXT,
  repotting_method_description TEXT,
  repotting_frequency_months INTEGER,

  -- ── Semantic intelligence (Section 7 of schema freeze doc) ──
  -- plant_profile        → "What is this plant generally like?"
  -- seasonal_adjustments → "What changes this season?"
  -- care_alerts          → "What should I watch out for?"
  plant_profile             TEXT,
  seasonal_adjustments      TEXT,
  care_alerts               TEXT,

  -- ── Additional runtime fields ───────────────────────────────
  placement_guidance        TEXT,
  suggested_location        TEXT,

  -- ── Governance enums (canonical Phase 2.1 values) ───────────
  light_requirement         TEXT        CHECK (light_requirement IN (
                              'low_light','medium_indirect','bright_indirect','direct_sun'
                            )),
  humidity_preference       TEXT        CHECK (humidity_preference IN ('low','medium','high')),
  difficulty_level          TEXT        CHECK (difficulty_level IN (
                              'beginner','intermediate','advanced'
                            )),

  -- ── Legacy guidance field (replaced by semantic fields above) ──
  notes                     TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX plant_care_profiles_species_idx      ON plant_care_profiles (species_name);
CREATE INDEX plant_care_profiles_canonical_id_idx ON plant_care_profiles (canonical_species_id);

ALTER TABLE plant_care_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plant_care_profiles: read by authenticated"
  ON plant_care_profiles FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- 5a. Seed plant_care_profiles with common houseplants
--     Legacy enum values used here for compatibility with existing
--     seeds; canonical enum migration happens in a separate pass.
-- ────────────────────────────────────────────────────────────
INSERT INTO plant_care_profiles
  (species_name, watering_frequency_days, fertilizing_frequency_days,
   light_requirement, humidity_preference, difficulty_level, notes)
VALUES
  -- ── Very low water (succulents & cacti) ──────────────────
  ('Sansevieria trifasciata',  14, 60, 'low_light',       'low',    'beginner',     'Snake plant; tolerates neglect and low light'),
  ('Zamioculcas zamiifolia',   14, 60, 'low_light',       'low',    'beginner',     'ZZ plant; drought-tolerant, near-indestructible'),
  ('Aloe vera',                14, 90, 'direct_sun',      'low',    'beginner',     'Water deeply and infrequently; avoid waterlogging'),
  ('Crassula ovata',           14, 60, 'bright_indirect', 'low',    'beginner',     'Jade plant; drought-tolerant succulent'),
  ('Haworthiopsis attenuata',  14, 90, 'bright_indirect', 'low',    'beginner',     'Zebra haworthia; very drought-tolerant'),
  ('Echeveria',                14, 60, 'direct_sun',      'low',    'beginner',     'Popular rosette succulent; needs bright light'),
  ('Sedum',                    14, 90, 'direct_sun',      'low',    'beginner',     'Stonecrop; extremely drought-tolerant'),
  ('Gasteria',                 14, 90, 'medium_indirect', 'low',    'beginner',     'Slow-growing; tolerates low light better than aloe'),
  ('Hoya kerrii',              14, 60, 'bright_indirect', 'low',    'beginner',     'Sweetheart hoya; slow-growing heart-leaf'),
  ('Cereus jamacaru',          21, 90, 'direct_sun',      'low',    'beginner',     'Column cactus; minimal water needed'),
  ('Echinopsis',               14, 90, 'direct_sun',      'low',    'beginner',     'Sea-urchin cactus; beautiful seasonal blooms'),
  ('Opuntia',                  21, 90, 'direct_sun',      'low',    'beginner',     'Prickly pear; very drought-tolerant'),
  ('Gymnocalycium',            14, 90, 'medium_indirect', 'low',    'beginner',     'Chin cactus; tolerates lower light than most cacti'),

  -- ── Moderate water (popular foliage) ─────────────────────
  ('Epipremnum aureum',        7,  30, 'low_light',       'medium', 'beginner',     'Golden pothos; very forgiving, trails or climbs'),
  ('Philodendron hederaceum',  7,  30, 'medium_indirect', 'medium', 'beginner',     'Heartleaf philodendron; fast-growing viner'),
  ('Chlorophytum comosum',     7,  30, 'medium_indirect', 'medium', 'beginner',     'Spider plant; produces many offshoots'),
  ('Monstera deliciosa',       7,  30, 'bright_indirect', 'medium', 'beginner',     'Swiss cheese plant; iconic split leaves'),
  ('Monstera adansonii',       7,  30, 'bright_indirect', 'medium', 'beginner',     'Adansonii monstera; smaller fenestrations'),
  ('Scindapsus pictus',        7,  30, 'medium_indirect', 'medium', 'beginner',     'Satin pothos; silver-patterned trailing vine'),
  ('Aglaonema',                7,  30, 'low_light',       'medium', 'beginner',     'Chinese evergreen; colourful, very adaptable'),
  ('Dracaena marginata',       10, 60, 'medium_indirect', 'low',    'beginner',     'Dragon tree; architectural cane form'),
  ('Dracaena fragrans',        10, 60, 'medium_indirect', 'medium', 'beginner',     'Corn plant; very adaptable, removes toxins'),
  ('Aspidistra elatior',       10, 60, 'low_light',       'low',    'beginner',     'Cast iron plant; nearly indestructible'),
  ('Tradescantia zebrina',     7,  30, 'medium_indirect', 'medium', 'beginner',     'Wandering Jew; vivid purple and silver foliage'),
  ('Peperomia obtusifolia',    10, 30, 'medium_indirect', 'medium', 'beginner',     'Baby rubber plant; compact and low-maintenance'),
  ('Peperomia caperata',       10, 30, 'medium_indirect', 'medium', 'beginner',     'Ripple peperomia; textured heart-shaped leaves'),
  ('Hoya carnosa',             10, 30, 'bright_indirect', 'medium', 'beginner',     'Wax plant; fragrant star-shaped flowers'),
  ('Spathiphyllum',            5,  30, 'low_light',       'medium', 'beginner',     'Peace lily; wilts visibly when thirsty'),
  ('Pothos',                   7,  30, 'low_light',       'medium', 'beginner',     'Generic pothos; one of the easiest houseplants'),

  -- ── Medium maintenance ────────────────────────────────────
  ('Ficus elastica',           7,  30, 'bright_indirect', 'medium', 'intermediate', 'Rubber plant; large bold glossy leaves'),
  ('Ficus lyrata',             7,  30, 'bright_indirect', 'medium', 'advanced',     'Fiddle-leaf fig; dramatic, hates being moved'),
  ('Strelitzia reginae',       7,  30, 'direct_sun',      'low',    'intermediate', 'Bird of paradise; needs lots of sun'),
  ('Anthurium andraeanum',     7,  30, 'bright_indirect', 'high',   'intermediate', 'Flamingo flower; glossy heart spathes'),
  ('Phalaenopsis',             7,  60, 'bright_indirect', 'medium', 'intermediate', 'Moth orchid; long-lasting blooms, water weekly'),
  ('Calathea orbifolia',       5,  30, 'medium_indirect', 'high',   'advanced',     'Round-leaf prayer plant; needs humidity'),
  ('Calathea zebrina',         5,  30, 'medium_indirect', 'high',   'advanced',     'Zebra calathea; decorative, humidity-loving'),
  ('Maranta leuconeura',       5,  30, 'medium_indirect', 'high',   'intermediate', 'Prayer plant; folds leaves at night'),
  ('Ctenanthe',                7,  30, 'medium_indirect', 'high',   'intermediate', 'Never-never plant; prayer plant relative'),
  ('Croton codiaeum',          5,  30, 'direct_sun',      'medium', 'intermediate', 'Colourful foliage; drops leaves if moved'),
  ('Alocasia',                 7,  30, 'bright_indirect', 'high',   'advanced',     'Elephant ear; dramatic large arrow leaves'),
  ('Caladium',                 5,  30, 'bright_indirect', 'high',   'advanced',     'Angel wings; spectacular patterned foliage'),

  -- ── Higher maintenance ────────────────────────────────────
  ('Nephrolepis exaltata',     4,  30, 'medium_indirect', 'high',   'intermediate', 'Boston fern; needs consistent moisture and humidity'),
  ('Adiantum',                 3,  30, 'medium_indirect', 'high',   'advanced',     'Maidenhair fern; delicate, dries out quickly'),

  -- ── Herbs ─────────────────────────────────────────────────
  ('Ocimum basilicum',         3,  14, 'direct_sun',      'medium', 'intermediate', 'Basil; needs frequent watering and full sun'),
  ('Mentha',                   4,  14, 'medium_indirect', 'medium', 'beginner',     'Mint; vigorous grower, keep soil moist'),
  ('Rosmarinus officinalis',   7,  30, 'direct_sun',      'low',    'beginner',     'Rosemary; drought-tolerant Mediterranean herb')

ON CONFLICT (species_name) DO UPDATE
  SET watering_frequency_days    = EXCLUDED.watering_frequency_days,
      fertilizing_frequency_days = EXCLUDED.fertilizing_frequency_days,
      light_requirement          = EXCLUDED.light_requirement,
      humidity_preference        = EXCLUDED.humidity_preference,
      difficulty_level           = EXCLUDED.difficulty_level,
      notes                      = EXCLUDED.notes;

-- ────────────────────────────────────────────────────────────
-- 6. plants
--    User-owned plant instances.
--    Four-layer identity separation (Section 2 of schema freeze doc):
--      1. display_name         → user ownership identity (emotional, editable)
--      2. user_entered_name    → recognition identity (raw onboarding input)
--      3. canonical_species_id → canonical operational identity (runtime backbone)
--      4. via plant_care_profiles.canonical_species_id → behavioral intelligence
--
--    Note: 'display_name' is this app's column name for what the schema freeze
--    doc calls 'plant_name'. Kept as-is for backward compat.
-- ────────────────────────────────────────────────────────────
CREATE TABLE plants (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Layer 1: User ownership identity (emotional, editable)
  display_name              TEXT        NOT NULL,

  -- Layer 2: Recognition identity (raw onboarding input)
  user_entered_name         TEXT,

  -- Layer 3: Canonical operational identity
  canonical_species_id      TEXT
                              REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL,
  canonical_species_name    TEXT,                   -- display helper; NOT runtime-stable
  species_resolution_method TEXT
                              CHECK (species_resolution_method IN (
                                'direct_species_match','alias_match','collapse_mapping_match',
                                'fuzzy_match','manual_override','unresolved'
                              )),

  -- Legacy identity (kept for backward compat during migration)
  species_name              TEXT,
  botanical_name            TEXT,

  -- Placement
  room_location             TEXT,

  -- Legacy enrichment (kept for compat; may be deprecated after migration)
  notes                     TEXT,
  image_url                 TEXT,
  light_conditions          TEXT,
  humidity_preferences      TEXT,
  watering_preferences      TEXT,
  purchase_date             DATE,
  acquired_from             TEXT,

  -- Timestamps
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ
);

CREATE INDEX plants_user_id_idx      ON plants (user_id);
CREATE INDEX plants_canonical_id_idx ON plants (canonical_species_id);

CREATE TRIGGER plants_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE plants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plants: select own"  ON plants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "plants: insert own"  ON plants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plants: update own"  ON plants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "plants: delete own"  ON plants FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 7. care_tasks
--    Generated operational actions per plant instance.
--    task_type includes 'cleaning' (Phase 2.1) and 'repotting' (legacy compat).
--    Repotting lifecycle tasks will migrate to repotting_tasks in a later phase.
-- ────────────────────────────────────────────────────────────
CREATE TABLE care_tasks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id              UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  canonical_species_id  TEXT
                          REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL,

  task_type             TEXT        NOT NULL
                          CHECK (task_type IN (
                            'watering','fertilizing','misting','pruning','cleaning',
                            'repotting'  -- legacy compat; will migrate to repotting_tasks
                          )),

  frequency_days        INTEGER     CHECK (frequency_days > 0),
  last_completed_at     TIMESTAMPTZ,
  next_due_at           TIMESTAMPTZ,
  notes                 TEXT,
  active_status         BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX care_tasks_plant_id_idx ON care_tasks (plant_id);
CREATE INDEX care_tasks_next_due_idx ON care_tasks (next_due_at) WHERE active_status = TRUE;

ALTER TABLE care_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "care_tasks: select own" ON care_tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "care_tasks: insert own" ON care_tasks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "care_tasks: update own" ON care_tasks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "care_tasks: delete own" ON care_tasks FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 8. care_logs
--    Immutable history of completed care actions.
--    Append-only: rows MUST NOT be updated after insert.
-- ────────────────────────────────────────────────────────────
CREATE TABLE care_logs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id              UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  canonical_species_id  TEXT
                          REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL,

  task_type             TEXT        NOT NULL
                          CHECK (task_type IN (
                            'watering','fertilizing','misting','pruning','cleaning',
                            'repotting'  -- legacy compat
                          )),

  completed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                 TEXT,
  image_url             TEXT
);

CREATE INDEX care_logs_plant_id_idx     ON care_logs (plant_id);
CREATE INDEX care_logs_completed_at_idx ON care_logs (plant_id, completed_at DESC);

ALTER TABLE care_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "care_logs: select own" ON care_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_logs.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "care_logs: insert own" ON care_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_logs.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "care_logs: delete own" ON care_logs FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_logs.plant_id AND plants.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 9. journal_entries
-- ────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id              UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  canonical_species_id  TEXT
                          REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL,

  title                 TEXT,
  notes                 TEXT,
  image_url             TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX journal_entries_plant_id_idx ON journal_entries (plant_id);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_entries: select own" ON journal_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "journal_entries: insert own" ON journal_entries FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "journal_entries: update own" ON journal_entries FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "journal_entries: delete own" ON journal_entries FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 10. health_logs
--     health_score: 1=Critical  2=Poor  3=Stable  4=Healthy  5=Thriving
-- ────────────────────────────────────────────────────────────
CREATE TABLE health_logs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id              UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  canonical_species_id  TEXT
                          REFERENCES canonical_species(canonical_species_id) ON DELETE SET NULL,

  health_score          SMALLINT    NOT NULL CHECK (health_score BETWEEN 1 AND 5),
  issue_type            TEXT,
  severity              TEXT,
  notes                 TEXT,
  image_url             TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX health_logs_plant_id_idx   ON health_logs (plant_id);
CREATE INDEX health_logs_created_at_idx ON health_logs (plant_id, created_at DESC);

ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health_logs: select own" ON health_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "health_logs: insert own" ON health_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "health_logs: update own" ON health_logs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));
CREATE POLICY "health_logs: delete own" ON health_logs FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));
