-- 001_create_schemas.sql
-- Logical groups for athlete_market_ml:
--   raw  = sheet/CSV import staging (TEXT-heavy, lineage columns)
--   core = cleaned / modeled tables (none yet)

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS core;

COMMENT ON SCHEMA raw IS 'Raw import staging from sheets/CSVs; not production market state.';
COMMENT ON SCHEMA core IS 'Cleaned/core ML entities; populated in later migrations.';
