-- 002_raw_tables.sql
-- Nine raw import tables for athlete_market_ml (columns as specified for sheet ingest).

CREATE TABLE raw.player_input_table (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    position TEXT,
    player_id TEXT,
    full_name TEXT,
    dob TEXT,
    draft_year TEXT,
    draft_age TEXT,
    college_final TEXT,
    draft_round TEXT,
    draft_pick TEXT,
    position_draft_rank TEXT,
    draft_team TEXT,
    draft_team_id TEXT,
    retirement_year TEXT,
    retirement_age TEXT,
    nfl_career_length TEXT,
    college_career_length TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'player_input_table',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.qb_college_seasons (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    player_id TEXT,
    full_name TEXT,
    season TEXT,
    school TEXT,

    games_played TEXT,
    games_started TEXT,

    pass_ints TEXT,
    pass_attempts TEXT,
    pass_completions TEXT,
    pass_tds TEXT,
    pass_yds TEXT,

    rush_attempts TEXT,
    rush_yds TEXT,
    rush_tds TEXT,

    receptions TEXT,
    rec_yds TEXT,
    rec_tds TEXT,

    routes_run TEXT,
    yds_after_catch TEXT,
    drops TEXT,
    targets TEXT,

    fumbles TEXT,
    yds_after_contact TEXT,

    college_sos TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'qb_college_seasons',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.rb_college_seasons (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    player_id TEXT,
    full_name TEXT,
    season TEXT,
    school TEXT,

    games_played TEXT,
    games_started TEXT,

    pass_ints TEXT,
    pass_attempts TEXT,
    pass_completions TEXT,
    pass_tds TEXT,
    pass_yds TEXT,

    rush_attempts TEXT,
    rush_yds TEXT,
    rush_tds TEXT,

    receptions TEXT,
    rec_yds TEXT,
    rec_tds TEXT,

    routes_run TEXT,
    yds_after_catch TEXT,
    drops TEXT,
    targets TEXT,

    fumbles TEXT,
    yds_after_contact TEXT,

    college_sos TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'rb_college_seasons',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.wr_college_seasons (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    player_id TEXT,
    full_name TEXT,
    season TEXT,
    school TEXT,

    games_played TEXT,
    games_started TEXT,

    pass_ints TEXT,
    pass_attempts TEXT,
    pass_completions TEXT,
    pass_tds TEXT,
    pass_yds TEXT,

    rush_attempts TEXT,
    rush_yds TEXT,
    rush_tds TEXT,

    receptions TEXT,
    rec_yds TEXT,
    rec_tds TEXT,

    routes_run TEXT,
    yds_after_catch TEXT,
    drops TEXT,
    targets TEXT,

    fumbles TEXT,
    yds_after_contact TEXT,

    college_sos TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'wr_college_seasons',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.te_college_seasons (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    player_id TEXT,
    full_name TEXT,
    season TEXT,
    school TEXT,

    games_played TEXT,
    games_started TEXT,

    pass_ints TEXT,
    pass_attempts TEXT,
    pass_completions TEXT,
    pass_tds TEXT,
    pass_yds TEXT,

    rush_attempts TEXT,
    rush_yds TEXT,
    rush_tds TEXT,

    receptions TEXT,
    rec_yds TEXT,
    rec_tds TEXT,

    routes_run TEXT,
    yds_after_catch TEXT,
    drops TEXT,
    targets TEXT,

    fumbles TEXT,
    yds_after_contact TEXT,

    college_sos TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'te_college_seasons',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.player_combine_measurables (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    player_id TEXT,
    full_name TEXT,
    position TEXT,
    draft_year TEXT,

    combine_invited TEXT,
    combine_participated TEXT,

    height_inches TEXT,
    weight_lbs TEXT,
    arm_length_inches TEXT,
    hand_size_inches TEXT,
    wingspan_inches TEXT,

    forty_time TEXT,
    ten_yard_split TEXT,
    vertical_jump_inches TEXT,
    broad_jump_inches TEXT,
    three_cone_time TEXT,
    short_shuttle_time TEXT,
    bench_reps TEXT,

    ras TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'player_combine_measurables',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.player_college_accolades (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    player_id TEXT,
    full_name TEXT,
    position TEXT,

    heisman_winner TEXT,
    heisman_finalist TEXT,

    all_american_first_team TEXT,
    all_american_second_team TEXT,
    all_american_third_team TEXT,
    unanimous_all_american TEXT,

    conference_player_of_year TEXT,
    conference_offensive_player_of_year TEXT,
    all_conference_first_team TEXT,

    maxwell_award TEXT,
    walter_camp_award TEXT,
    davey_obrien_award TEXT,
    manning_award TEXT,
    unitas_golden_arm_award TEXT,
    doak_walker_award TEXT,
    biletnikoff_award TEXT,
    mackey_award TEXT,
    paul_hornung_award TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'player_college_accolades',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.nfl_team_reference_table (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    nfl_team TEXT,
    nfl_team_id TEXT,
    nfl_abbreviation TEXT,

    source_sheet TEXT NOT NULL DEFAULT 'nfl_team_reference_table',
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw.nfl_team_offensive_performance (
    raw_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id BIGINT,

    nfl_team TEXT,
    nfl_team_id TEXT,
    season TEXT,

    games_played TEXT,
    points_scored TEXT,
    total_yards TEXT,
    total_plays TEXT,
    first_downs TEXT,
    turnovers TEXT,

    pass_attempts TEXT,
    pass_completions TEXT,
    pass_yards TEXT,
    pass_tds TEXT,
    interceptions_thrown TEXT,
    sacks_allowed TEXT,
    sack_yards_lost TEXT,

    rush_attempts TEXT,
    rush_yards TEXT,
    rush_tds TEXT,
    fumbles_lost TEXT,

    third_down_attempts TEXT,
    third_down_conversions TEXT,
    fourth_down_attempts TEXT,
    fourth_down_conversions TEXT,

    red_zone_attempts TEXT,
    red_zone_tds TEXT,

    strength_of_schedule TEXT,

    offensive_line_pff_rank TEXT,
    offensive_line_pff_grade TEXT,

    offensive_dvoa TEXT,
    offensive_dvoa_rank TEXT,

    pass_offense_rank TEXT,
    rush_offense_rank TEXT,
    points_per_game_rank TEXT,
    yards_per_game_rank TEXT,

    source_url TEXT,

    source_sheet TEXT NOT NULL,
    source_row INTEGER,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
