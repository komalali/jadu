CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  variety TEXT,
  description TEXT,
  days_to_germination_min INTEGER,
  days_to_germination_max INTEGER,
  days_to_harvest_min INTEGER,
  days_to_harvest_max INTEGER,
  sun_requirement TEXT,
  water_frequency TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  source TEXT,
  quantity TEXT,
  plant_window_start TEXT,
  plant_window_end TEXT,
  year_purchased INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plantings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  seed_id INTEGER REFERENCES seeds(id) ON DELETE SET NULL,
  planted_at TEXT NOT NULL,
  location TEXT,
  expected_germination TEXT,
  expected_harvest TEXT,
  actual_germination TEXT,
  actual_harvest TEXT,
  status TEXT DEFAULT 'planted',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plantings_plant_id ON plantings(plant_id);
CREATE INDEX IF NOT EXISTS idx_plantings_status ON plantings(status);
CREATE INDEX IF NOT EXISTS idx_seeds_plant_id ON seeds(plant_id);
CREATE INDEX IF NOT EXISTS idx_seeds_plant_window ON seeds(plant_window_start, plant_window_end);
