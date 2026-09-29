-- 001_foundation.sql
-- Foundational schema for athlete_market_app, mirrored from the live SQLite
-- market (users, players, holdings, trades, price/equity points, week-stats cache).
--
-- Player identity uses TEXT primary keys (stable across systems). Current app IDs
-- look like gsis-… / key_id values; future permanent IDs such as QB_0001 fit the
-- same column without a schema change.
--
-- Auth today is email + password_hash (bcrypt) in the Express app. Nullable
-- auth_provider / auth_subject leave room for an external IdP later without
-- inventing a second password system.
--
-- Do NOT put ML training / research tables here — those belong in athlete_market_ml.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  auth_provider TEXT,
  auth_subject TEXT,
  cash_balance NUMERIC NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_bot BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT users_auth_identity_chk CHECK (
    password_hash IS NOT NULL
    OR (auth_provider IS NOT NULL AND auth_subject IS NOT NULL)
  ),
  CONSTRAINT users_auth_provider_subject_uniq UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE players (
  key_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  team_abbr TEXT NOT NULL,
  position_abbr TEXT NOT NULL,
  gsis_id TEXT,
  sleeper_id TEXT,
  espn_id TEXT,
  headshot_url TEXT,
  opening_price NUMERIC,
  price NUMERIC,
  open_price NUMERIC,
  shares_outstanding INTEGER NOT NULL DEFAULT 10000,
  shares_held INTEGER NOT NULL DEFAULT 0,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_team_abbr ON players (team_abbr);
CREATE INDEX idx_players_position_abbr ON players (position_abbr);
CREATE INDEX idx_players_name_lower ON players (lower(name));
CREATE INDEX idx_players_active ON players (active);
CREATE INDEX idx_players_sleeper_id ON players (sleeper_id);
CREATE INDEX idx_players_gsis_id ON players (gsis_id);

CREATE TABLE holdings (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (key_id),
  shares INTEGER NOT NULL,
  avg_cost NUMERIC NOT NULL,
  PRIMARY KEY (user_id, player_id),
  CONSTRAINT holdings_shares_nonneg CHECK (shares >= 0)
);

CREATE INDEX idx_holdings_player_id ON holdings (player_id);

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (key_id),
  side TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  CONSTRAINT trades_side_chk CHECK (side IN ('buy', 'sell')),
  CONSTRAINT trades_qty_positive CHECK (qty > 0)
);

CREATE INDEX idx_trades_player_id ON trades (player_id);
CREATE INDEX idx_trades_user_id ON trades (user_id);
CREATE INDEX idx_trades_ts ON trades (ts);

CREATE TABLE price_points (
  player_id TEXT NOT NULL REFERENCES players (key_id) ON DELETE CASCADE,
  t TIMESTAMPTZ NOT NULL,
  price NUMERIC NOT NULL,
  PRIMARY KEY (player_id, t)
);

CREATE TABLE equity_points (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  t TIMESTAMPTZ NOT NULL,
  value NUMERIC NOT NULL,
  PRIMARY KEY (user_id, t)
);

CREATE TABLE player_week_stats (
  sleeper_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  payload_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sleeper_id, season, week)
);

CREATE INDEX idx_player_week_stats_fetched ON player_week_stats (fetched_at);
