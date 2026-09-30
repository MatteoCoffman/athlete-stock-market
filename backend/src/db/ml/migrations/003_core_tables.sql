-- 003_core_tables.sql
-- Cleaned / typed entities derived from raw sheet imports.
-- CREATE SCHEMA is idempotent (also created in 001_create_schemas).

CREATE SCHEMA IF NOT EXISTS core;


-- ============================================================
-- 1. PLAYERS
-- Canonical identity record for each athlete.
-- ============================================================

CREATE TABLE core.players (
    player_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    position VARCHAR(3) NOT NULL,
    dob DATE,
    college_final TEXT,

    retirement_year SMALLINT,
    retirement_age SMALLINT,
    nfl_career_length SMALLINT,
    college_career_length SMALLINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT players_position_check
        CHECK (position IN ('QB', 'RB', 'WR', 'TE'))
);


-- ============================================================
-- 2. NFL TEAMS
-- Permanent franchise IDs.
-- Create this before player_draft because draft_team_id
-- references it.
-- ============================================================

CREATE TABLE core.nfl_teams (
    nfl_team_id SMALLINT PRIMARY KEY,
    nfl_team TEXT NOT NULL,
    nfl_abbreviation VARCHAR(5) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT nfl_teams_team_unique
        UNIQUE (nfl_team),

    CONSTRAINT nfl_teams_abbreviation_unique
        UNIQUE (nfl_abbreviation)
);


-- ============================================================
-- 3. PLAYER DRAFT
-- One draft record per player.
-- ============================================================

CREATE TABLE core.player_draft (
    player_id TEXT PRIMARY KEY,

    draft_year SMALLINT,
    draft_age NUMERIC(4,2),
    draft_round SMALLINT,
    draft_pick SMALLINT,
    position_draft_rank SMALLINT,
    draft_team_id SMALLINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT player_draft_player_fk
        FOREIGN KEY (player_id)
        REFERENCES core.players(player_id)
        ON DELETE CASCADE,

    CONSTRAINT player_draft_team_fk
        FOREIGN KEY (draft_team_id)
        REFERENCES core.nfl_teams(nfl_team_id),

    CONSTRAINT player_draft_round_check
        CHECK (draft_round IS NULL OR draft_round > 0),

    CONSTRAINT player_draft_pick_check
        CHECK (draft_pick IS NULL OR draft_pick > 0),

    CONSTRAINT player_draft_position_rank_check
        CHECK (
            position_draft_rank IS NULL
            OR position_draft_rank > 0
        )
);


-- ============================================================
-- 4. PLAYER COLLEGE SEASONS
-- QB/RB/WR/TE Google Sheet tabs all consolidate here.
-- ============================================================

CREATE TABLE core.player_college_seasons (
    player_id TEXT NOT NULL,
    season SMALLINT NOT NULL,
    school TEXT NOT NULL,

    games_played SMALLINT,
    games_started SMALLINT,

    pass_ints SMALLINT,
    pass_attempts INTEGER,
    pass_completions INTEGER,
    pass_tds SMALLINT,
    pass_yds INTEGER,

    rush_attempts INTEGER,
    rush_yds INTEGER,
    rush_tds SMALLINT,

    receptions INTEGER,
    rec_yds INTEGER,
    rec_tds SMALLINT,

    routes_run INTEGER,
    yds_after_catch INTEGER,
    drops INTEGER,
    targets INTEGER,

    fumbles INTEGER,
    yds_after_contact INTEGER,

    college_sos NUMERIC(8,4),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (player_id, season),

    CONSTRAINT college_seasons_player_fk
        FOREIGN KEY (player_id)
        REFERENCES core.players(player_id)
        ON DELETE CASCADE
);


-- ============================================================
-- 5. PLAYER COMBINE MEASURABLES
-- One combine/measurables record per player.
-- ============================================================

CREATE TABLE core.player_combine_measurables (
    player_id TEXT PRIMARY KEY,

    combine_invited BOOLEAN,
    combine_participated BOOLEAN,

    height_inches NUMERIC(5,2),
    weight_lbs SMALLINT,
    arm_length_inches NUMERIC(5,2),
    hand_size_inches NUMERIC(5,2),
    wingspan_inches NUMERIC(5,2),

    forty_time NUMERIC(4,2),
    ten_yard_split NUMERIC(4,2),
    vertical_jump_inches NUMERIC(5,2),
    broad_jump_inches NUMERIC(5,2),
    three_cone_time NUMERIC(4,2),
    short_shuttle_time NUMERIC(4,2),
    bench_reps SMALLINT,

    ras NUMERIC(4,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT combine_player_fk
        FOREIGN KEY (player_id)
        REFERENCES core.players(player_id)
        ON DELETE CASCADE,

    CONSTRAINT combine_ras_check
        CHECK (ras IS NULL OR (ras >= 0 AND ras <= 10))
);


-- ============================================================
-- 6. PLAYER COLLEGE ACCOLADES
-- TRUE  = researched and won
-- FALSE = researched and did not win
-- NULL  = unknown / not yet researched
-- ============================================================

CREATE TABLE core.player_college_accolades (
    player_id TEXT PRIMARY KEY,

    heisman_winner BOOLEAN,
    heisman_finalist BOOLEAN,

    all_american_first_team BOOLEAN,
    all_american_second_team BOOLEAN,
    all_american_third_team BOOLEAN,
    unanimous_all_american BOOLEAN,

    conference_player_of_year BOOLEAN,
    conference_offensive_player_of_year BOOLEAN,
    all_conference_first_team BOOLEAN,

    maxwell_award BOOLEAN,
    walter_camp_award BOOLEAN,
    davey_obrien_award BOOLEAN,
    manning_award BOOLEAN,
    unitas_golden_arm_award BOOLEAN,
    doak_walker_award BOOLEAN,
    biletnikoff_award BOOLEAN,
    mackey_award BOOLEAN,
    paul_hornung_award BOOLEAN,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT accolades_player_fk
        FOREIGN KEY (player_id)
        REFERENCES core.players(player_id)
        ON DELETE CASCADE
);


-- ============================================================
-- 7. NFL TEAM OFFENSIVE SEASONS
-- All yearly offensive-performance Sheets consolidate here.
-- One row per franchise per season.
-- ============================================================

CREATE TABLE core.nfl_team_offensive_seasons (
    nfl_team_id SMALLINT NOT NULL,
    season SMALLINT NOT NULL,

    -- Allows us to preserve the team's name during that season
    -- even if the franchise later relocates or changes names.
    season_team_name TEXT,

    games_played SMALLINT,

    points_scored INTEGER,
    total_yards INTEGER,
    total_plays INTEGER,
    first_downs INTEGER,
    turnovers INTEGER,

    pass_attempts INTEGER,
    pass_completions INTEGER,
    pass_yards INTEGER,
    pass_tds INTEGER,
    interceptions_thrown INTEGER,
    sacks_allowed INTEGER,
    sack_yards_lost INTEGER,

    rush_attempts INTEGER,
    rush_yards INTEGER,
    rush_tds INTEGER,
    fumbles_lost INTEGER,

    third_down_attempts INTEGER,
    third_down_conversions INTEGER,

    fourth_down_attempts INTEGER,
    fourth_down_conversions INTEGER,

    red_zone_attempts INTEGER,
    red_zone_tds INTEGER,

    strength_of_schedule NUMERIC(8,4),

    offensive_line_pff_rank SMALLINT,
    offensive_line_pff_grade NUMERIC(5,2),

    offensive_dvoa NUMERIC(8,4),
    offensive_dvoa_rank SMALLINT,

    pass_offense_rank SMALLINT,
    rush_offense_rank SMALLINT,
    points_per_game_rank SMALLINT,
    yards_per_game_rank SMALLINT,

    source_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (nfl_team_id, season),

    CONSTRAINT offensive_seasons_team_fk
        FOREIGN KEY (nfl_team_id)
        REFERENCES core.nfl_teams(nfl_team_id)
);
