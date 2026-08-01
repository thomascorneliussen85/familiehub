-- FamilieHub database-skjema (SQLite)

CREATE TABLE IF NOT EXISTS family_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'voksen', -- 'voksen' | 'barn'
  color       TEXT NOT NULL DEFAULT '#7c9cff',
  avatar      TEXT,                            -- emoji eller initial
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  start_at        TEXT NOT NULL, -- ISO datetime
  end_at          TEXT NOT NULL, -- ISO datetime
  all_day         INTEGER NOT NULL DEFAULT 0,
  location        TEXT,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'local', -- 'local' | 'google'
  google_event_id TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  recurrence   TEXT NOT NULL DEFAULT 'once', -- 'once' | 'daily' | 'weekly:mon' | 'weekly:tue' ...
  due_date     TEXT,                          -- kun relevant for 'once'
  stars        INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registrerer hver fullførte forekomst av et gjøremål (håndterer gjentakelse)
CREATE TABLE IF NOT EXISTS chore_completions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id       INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  completed_on   TEXT NOT NULL, -- YYYY-MM-DD
  stars_awarded  INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chore_id, completed_on)
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  checked     INTEGER NOT NULL DEFAULT 0,
  checked_at  TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quick_items (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  icon   TEXT
);

CREATE TABLE IF NOT EXISTS smart_plugs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  ip           TEXT NOT NULL,
  is_on        INTEGER NOT NULL DEFAULT 0,
  last_watt    REAL,
  last_seen_at TEXT,
  online       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gps_positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name  TEXT NOT NULL DEFAULT 'Adelia',
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  speed        REAL,
  battery      REAL,
  accuracy     REAL,
  recorded_at  TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'traccar', -- 'traccar' | 'fallback'
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author      TEXT,
  text        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#fff59d',
  pos_x       REAL NOT NULL DEFAULT 0,
  pos_y       REAL NOT NULL DEFAULT 0,
  rotation    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

CREATE TABLE IF NOT EXISTS play_locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT NOT NULL UNIQUE,
  emoji       TEXT NOT NULL DEFAULT '📍',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS play_status (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id    INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  location    TEXT NOT NULL,
  emoji       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS friend_families (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  pairing_code  TEXT,
  paired_at     TEXT,
  approved      INTEGER NOT NULL DEFAULT 0,
  friend_hub_id TEXT
);

CREATE TABLE IF NOT EXISTS cameras (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  rtsp_url    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS garmin_activities (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  garmin_activity_id  INTEGER NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  activity_type       TEXT,
  start_time          TEXT NOT NULL,
  duration_seconds    REAL,
  distance_m          REAL,
  calories            REAL,
  avg_hr              REAL,
  max_hr              REAL,
  elevation_gain_m    REAL,
  synced_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_chore_completions_chore ON chore_completions(chore_id);
CREATE INDEX IF NOT EXISTS idx_gps_positions_recorded ON gps_positions(recorded_at);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_start ON garmin_activities(start_time);
CREATE INDEX IF NOT EXISTS idx_play_status_child ON play_status(child_id);
CREATE INDEX IF NOT EXISTS idx_play_status_active ON play_status(ended_at, expires_at);
