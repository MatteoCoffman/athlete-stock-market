-- Live market state. Roster columns from 001 stay; opening_price remains the catalog seed.
-- open_price is the session open that bots reset on startup.

ALTER TABLE players ADD COLUMN price REAL;
ALTER TABLE players ADD COLUMN open_price REAL;
ALTER TABLE players ADD COLUMN shares_outstanding INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE players ADD COLUMN shares_held INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN performance_score REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  cash_balance REAL NOT NULL,
  created_at TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS holdings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(key_id),
  shares INTEGER NOT NULL,
  avg_cost REAL NOT NULL,
  PRIMARY KEY (user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_player_id ON holdings (player_id);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(key_id),
  side TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price REAL NOT NULL,
  ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_player_id ON trades (player_id);
CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades (ts);

CREATE TABLE IF NOT EXISTS price_points (
  player_id TEXT NOT NULL REFERENCES players(key_id) ON DELETE CASCADE,
  t TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (player_id, t)
);

CREATE TABLE IF NOT EXISTS equity_points (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  t TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (user_id, t)
);
