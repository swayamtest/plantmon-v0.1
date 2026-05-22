-- ============================================================
-- Plant Manager — Full Schema Migration
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to re-run: drops existing tables first (dev reset)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Drop existing tables (ordered to respect foreign keys)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS health_logs     CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS care_logs       CASCADE;
DROP TABLE IF EXISTS care_tasks      CASCADE;
DROP TABLE IF EXISTS plants          CASCADE;

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
-- 2. plants
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
-- 3. care_tasks
--    Recurring care schedules (watering, fertilizing, etc.)
--    Linked to a plant; optional frequency and scheduling.
-- ────────────────────────────────────────────────────────────
CREATE TABLE care_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  -- mandatory
  task_type         TEXT        NOT NULL
                      CHECK (task_type IN ('watering','fertilizing','misting','pruning','repotting')),

  -- optional scheduling
  frequency_days    INTEGER     CHECK (frequency_days > 0),
  last_completed_at TIMESTAMPTZ,
  next_due_at       TIMESTAMPTZ,
  notes             TEXT,
  active_status     BOOLEAN     NOT NULL DEFAULT TRUE,

  -- timestamp
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX care_tasks_plant_id_idx  ON care_tasks (plant_id);
CREATE INDEX care_tasks_next_due_idx  ON care_tasks (next_due_at) WHERE active_status = TRUE;

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
-- 4. care_logs
--    Immutable history of completed care actions.
--    Append-only; never updated, only inserted or deleted.
-- ────────────────────────────────────────────────────────────
CREATE TABLE care_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id     UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  -- mandatory
  task_type    TEXT        NOT NULL
                 CHECK (task_type IN ('watering','fertilizing','misting','pruning','repotting')),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- optional
  notes        TEXT,
  image_url    TEXT
);

CREATE INDEX care_logs_plant_id_idx ON care_logs (plant_id);
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
-- 5. journal_entries
--    Free-form notes and photo observations per plant.
-- ────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id   UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  -- optional content
  title      TEXT,
  notes      TEXT,
  image_url  TEXT,

  -- timestamp
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
-- 6. health_logs
--    Timestamped health observations per plant.
--    health_score: 1=Critical, 2=Poor, 3=Stable, 4=Healthy, 5=Thriving
-- ────────────────────────────────────────────────────────────
CREATE TABLE health_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id     UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,

  -- mandatory
  health_score SMALLINT    NOT NULL CHECK (health_score BETWEEN 1 AND 5),

  -- optional
  issue_type   TEXT,
  severity     TEXT,
  notes        TEXT,
  image_url    TEXT,

  -- timestamp
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX health_logs_plant_id_idx    ON health_logs (plant_id);
CREATE INDEX health_logs_created_at_idx  ON health_logs (plant_id, created_at DESC);

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
