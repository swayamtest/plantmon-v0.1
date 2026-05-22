-- ============================================================
-- Plant Manager — Full Schema Migration
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to re-run: drops existing tables first (dev reset)
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
-- 2. plant_care_profiles
--    Shared, species-level care defaults (not user-specific).
--    Used to auto-generate default care_tasks on plant creation.
--    Admin-seeded; authenticated users can only SELECT.
-- ────────────────────────────────────────────────────────────
CREATE TABLE plant_care_profiles (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  species_name              TEXT        NOT NULL UNIQUE,
  watering_frequency_days   INTEGER     NOT NULL DEFAULT 7,
  fertilizing_frequency_days INTEGER,
  light_requirement         TEXT        CHECK (light_requirement IN ('low','medium','bright_indirect','full_sun')),
  humidity_preference       TEXT        CHECK (humidity_preference IN ('low','medium','high')),
  difficulty_level          TEXT        CHECK (difficulty_level IN ('easy','medium','hard')),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX plant_care_profiles_species_idx ON plant_care_profiles (species_name);

ALTER TABLE plant_care_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plant_care_profiles: read by authenticated"
  ON plant_care_profiles FOR SELECT
  TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 2a. Seed plant_care_profiles with common houseplants
-- ────────────────────────────────────────────────────────────
INSERT INTO plant_care_profiles
  (species_name, watering_frequency_days, fertilizing_frequency_days,
   light_requirement, humidity_preference, difficulty_level, notes)
VALUES
  -- ── Very low water (succulents & cacti) ──────────────────
  ('Sansevieria trifasciata',  14, 60, 'low',             'low',    'easy',   'Snake plant; tolerates neglect and low light'),
  ('Zamioculcas zamiifolia',   14, 60, 'low',             'low',    'easy',   'ZZ plant; drought-tolerant, near-indestructible'),
  ('Aloe vera',                14, 90, 'full_sun',        'low',    'easy',   'Water deeply and infrequently; avoid waterlogging'),
  ('Crassula ovata',           14, 60, 'bright_indirect', 'low',    'easy',   'Jade plant; drought-tolerant succulent'),
  ('Haworthiopsis attenuata',  14, 90, 'bright_indirect', 'low',    'easy',   'Zebra haworthia; very drought-tolerant'),
  ('Echeveria',                14, 60, 'full_sun',        'low',    'easy',   'Popular rosette succulent; needs bright light'),
  ('Sedum',                    14, 90, 'full_sun',        'low',    'easy',   'Stonecrop; extremely drought-tolerant'),
  ('Gasteria',                 14, 90, 'medium',          'low',    'easy',   'Slow-growing; tolerates low light better than aloe'),
  ('Hoya kerrii',              14, 60, 'bright_indirect', 'low',    'easy',   'Sweetheart hoya; slow-growing heart-leaf'),
  ('Cereus jamacaru',          21, 90, 'full_sun',        'low',    'easy',   'Column cactus; minimal water needed'),
  ('Echinopsis',               14, 90, 'full_sun',        'low',    'easy',   'Sea-urchin cactus; beautiful seasonal blooms'),
  ('Opuntia',                  21, 90, 'full_sun',        'low',    'easy',   'Prickly pear; very drought-tolerant'),
  ('Gymnocalycium',            14, 90, 'medium',          'low',    'easy',   'Chin cactus; tolerates lower light than most cacti'),

  -- ── Moderate water (popular foliage) ─────────────────────
  ('Epipremnum aureum',        7,  30, 'low',             'medium', 'easy',   'Golden pothos; very forgiving, trails or climbs'),
  ('Philodendron hederaceum',  7,  30, 'medium',          'medium', 'easy',   'Heartleaf philodendron; fast-growing viner'),
  ('Chlorophytum comosum',     7,  30, 'medium',          'medium', 'easy',   'Spider plant; produces many offshoots'),
  ('Monstera deliciosa',       7,  30, 'bright_indirect', 'medium', 'easy',   'Swiss cheese plant; iconic split leaves'),
  ('Monstera adansonii',       7,  30, 'bright_indirect', 'medium', 'easy',   'Adansonii monstera; smaller fenestrations'),
  ('Scindapsus pictus',        7,  30, 'medium',          'medium', 'easy',   'Satin pothos; silver-patterned trailing vine'),
  ('Aglaonema',                7,  30, 'low',             'medium', 'easy',   'Chinese evergreen; colourful, very adaptable'),
  ('Dracaena marginata',       10, 60, 'medium',          'low',    'easy',   'Dragon tree; architectural cane form'),
  ('Dracaena fragrans',        10, 60, 'medium',          'medium', 'easy',   'Corn plant; very adaptable, removes toxins'),
  ('Aspidistra elatior',       10, 60, 'low',             'low',    'easy',   'Cast iron plant; nearly indestructible'),
  ('Tradescantia zebrina',     7,  30, 'medium',          'medium', 'easy',   'Wandering Jew; vivid purple and silver foliage'),
  ('Peperomia obtusifolia',    10, 30, 'medium',          'medium', 'easy',   'Baby rubber plant; compact and low-maintenance'),
  ('Peperomia caperata',       10, 30, 'medium',          'medium', 'easy',   'Ripple peperomia; textured heart-shaped leaves'),
  ('Hoya carnosa',             10, 30, 'bright_indirect', 'medium', 'easy',   'Wax plant; fragrant star-shaped flowers'),
  ('Spathiphyllum',            5,  30, 'low',             'medium', 'easy',   'Peace lily; wilts visibly when thirsty'),
  ('Pothos',                   7,  30, 'low',             'medium', 'easy',   'Generic pothos; one of the easiest houseplants'),

  -- ── Medium maintenance ────────────────────────────────────
  ('Ficus elastica',           7,  30, 'bright_indirect', 'medium', 'medium', 'Rubber plant; large bold glossy leaves'),
  ('Ficus lyrata',             7,  30, 'bright_indirect', 'medium', 'hard',   'Fiddle-leaf fig; dramatic, hates being moved'),
  ('Strelitzia reginae',       7,  30, 'full_sun',        'low',    'medium', 'Bird of paradise; needs lots of sun'),
  ('Anthurium andraeanum',     7,  30, 'bright_indirect', 'high',   'medium', 'Flamingo flower; glossy heart spathes'),
  ('Phalaenopsis',             7,  60, 'bright_indirect', 'medium', 'medium', 'Moth orchid; long-lasting blooms, water weekly'),
  ('Calathea orbifolia',       5,  30, 'medium',          'high',   'hard',   'Round-leaf prayer plant; needs humidity'),
  ('Calathea zebrina',         5,  30, 'medium',          'high',   'hard',   'Zebra calathea; decorative, humidity-loving'),
  ('Maranta leuconeura',       5,  30, 'medium',          'high',   'medium', 'Prayer plant; folds leaves at night'),
  ('Ctenanthe',                7,  30, 'medium',          'high',   'medium', 'Never-never plant; prayer plant relative'),
  ('Croton codiaeum',          5,  30, 'full_sun',        'medium', 'medium', 'Colourful foliage; drops leaves if moved'),
  ('Alocasia',                 7,  30, 'bright_indirect', 'high',   'hard',   'Elephant ear; dramatic large arrow leaves'),
  ('Caladium',                 5,  30, 'bright_indirect', 'high',   'hard',   'Angel wings; spectacular patterned foliage'),

  -- ── Higher maintenance ────────────────────────────────────
  ('Nephrolepis exaltata',     4,  30, 'medium',          'high',   'medium', 'Boston fern; needs consistent moisture and humidity'),
  ('Adiantum',                 3,  30, 'medium',          'high',   'hard',   'Maidenhair fern; delicate, dries out quickly'),

  -- ── Herbs ─────────────────────────────────────────────────
  ('Ocimum basilicum',         3,  14, 'full_sun',        'medium', 'medium', 'Basil; needs frequent watering and full sun'),
  ('Mentha',                   4,  14, 'medium',          'medium', 'easy',   'Mint; vigorous grower, keep soil moist'),
  ('Rosmarinus officinalis',   7,  30, 'full_sun',        'low',    'easy',   'Rosemary; drought-tolerant Mediterranean herb')

ON CONFLICT (species_name) DO UPDATE
  SET watering_frequency_days    = EXCLUDED.watering_frequency_days,
      fertilizing_frequency_days = EXCLUDED.fertilizing_frequency_days,
      light_requirement          = EXCLUDED.light_requirement,
      humidity_preference        = EXCLUDED.humidity_preference,
      difficulty_level           = EXCLUDED.difficulty_level,
      notes                      = EXCLUDED.notes;

-- ────────────────────────────────────────────────────────────
-- 3. plants
--    Core identity record. Only display_name is required.
--    All enrichment fields are optional (progressive UX).
-- ────────────────────────────────────────────────────────────
CREATE TABLE plants (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- mandatory
  display_name         TEXT        NOT NULL,

  -- optional identity
  species_name         TEXT,
  botanical_name       TEXT,

  -- optional placement
  room_location        TEXT,

  -- optional enrichment
  notes                TEXT,
  image_url            TEXT,
  light_conditions     TEXT,
  humidity_preferences TEXT,
  watering_preferences TEXT,
  purchase_date        DATE,
  acquired_from        TEXT,

  -- timestamps
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ
);

CREATE INDEX plants_user_id_idx ON plants (user_id);

CREATE TRIGGER plants_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plants: select own"  ON plants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "plants: insert own"  ON plants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plants: update own"  ON plants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "plants: delete own"  ON plants FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 4. care_tasks
--    Recurring care schedules (watering, fertilizing, etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE care_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  task_type         TEXT        NOT NULL
                      CHECK (task_type IN ('watering','fertilizing','misting','pruning','repotting')),

  frequency_days    INTEGER     CHECK (frequency_days > 0),
  last_completed_at TIMESTAMPTZ,
  next_due_at       TIMESTAMPTZ,
  notes             TEXT,
  active_status     BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX care_tasks_plant_id_idx ON care_tasks (plant_id);
CREATE INDEX care_tasks_next_due_idx ON care_tasks (next_due_at) WHERE active_status = TRUE;

ALTER TABLE care_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_tasks: select own"
  ON care_tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "care_tasks: insert own"
  ON care_tasks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "care_tasks: update own"
  ON care_tasks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "care_tasks: delete own"
  ON care_tasks FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_tasks.plant_id AND plants.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 5. care_logs
--    Immutable history of completed care actions.
-- ────────────────────────────────────────────────────────────
CREATE TABLE care_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id     UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  task_type    TEXT        NOT NULL
                 CHECK (task_type IN ('watering','fertilizing','misting','pruning','repotting')),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  notes        TEXT,
  image_url    TEXT
);

CREATE INDEX care_logs_plant_id_idx     ON care_logs (plant_id);
CREATE INDEX care_logs_completed_at_idx ON care_logs (plant_id, completed_at DESC);

ALTER TABLE care_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_logs: select own"
  ON care_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_logs.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "care_logs: insert own"
  ON care_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_logs.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "care_logs: delete own"
  ON care_logs FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = care_logs.plant_id AND plants.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 6. journal_entries
-- ────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id   UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  title      TEXT,
  notes      TEXT,
  image_url  TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX journal_entries_plant_id_idx ON journal_entries (plant_id);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entries: select own"
  ON journal_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "journal_entries: insert own"
  ON journal_entries FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "journal_entries: update own"
  ON journal_entries FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "journal_entries: delete own"
  ON journal_entries FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = journal_entries.plant_id AND plants.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 7. health_logs
--    health_score: 1=Critical  2=Poor  3=Stable  4=Healthy  5=Thriving
-- ────────────────────────────────────────────────────────────
CREATE TABLE health_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id     UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  health_score SMALLINT    NOT NULL CHECK (health_score BETWEEN 1 AND 5),

  issue_type   TEXT,
  severity     TEXT,
  notes        TEXT,
  image_url    TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX health_logs_plant_id_idx   ON health_logs (plant_id);
CREATE INDEX health_logs_created_at_idx ON health_logs (plant_id, created_at DESC);

ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_logs: select own"
  ON health_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "health_logs: insert own"
  ON health_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "health_logs: update own"
  ON health_logs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));

CREATE POLICY "health_logs: delete own"
  ON health_logs FOR DELETE
  USING (EXISTS (SELECT 1 FROM plants WHERE plants.id = health_logs.plant_id AND plants.user_id = auth.uid()));
