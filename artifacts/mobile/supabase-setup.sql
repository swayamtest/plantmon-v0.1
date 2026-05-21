-- Run this in your Supabase Dashboard → SQL Editor

-- Plants table
CREATE TABLE IF NOT EXISTS plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT,
  description TEXT,
  watering_interval_days INTEGER NOT NULL DEFAULT 7,
  last_watered_at TIMESTAMPTZ,
  image_url TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security: users can only see and modify their own plants
ALTER TABLE plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plants"
  ON plants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plants"
  ON plants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plants"
  ON plants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own plants"
  ON plants FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plants_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
