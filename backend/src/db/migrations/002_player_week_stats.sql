-- 002_player_week_stats.sql
CREATE TABLE IF NOT EXISTS player_week_stats (
  sleeper_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sleeper_id, season, week)
);

CREATE INDEX IF NOT EXISTS idx_player_week_stats_fetched ON player_week_stats (fetched_at);
