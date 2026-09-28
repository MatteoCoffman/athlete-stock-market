-- 001_players.sql
CREATE TABLE IF NOT EXISTS players (
  key_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  team_abbr TEXT NOT NULL,
  position_abbr TEXT NOT NULL,
  gsis_id TEXT,
  sleeper_id TEXT,
  espn_id TEXT,
  headshot_url TEXT,
  opening_price REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_team_abbr ON players (team_abbr);
CREATE INDEX IF NOT EXISTS idx_players_position_abbr ON players (position_abbr);
CREATE INDEX IF NOT EXISTS idx_players_name ON players (name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_players_active ON players (active);
CREATE INDEX IF NOT EXISTS idx_players_sleeper_id ON players (sleeper_id);
CREATE INDEX IF NOT EXISTS idx_players_gsis_id ON players (gsis_id);
