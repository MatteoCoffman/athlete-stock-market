/** Sheet file name (without .csv) → raw table. Headers may use spaces; these are the column names. */

const smallint = { kind: "smallint" };
const positiveSmallint = { kind: "smallint", positive: true };
const integer = { kind: "int" };
const text = { kind: "text" };
const bool = { kind: "bool" };
const date = { kind: "date" };
const position = { kind: "position" };
const num = (precision, scale, extra = {}) => ({ kind: "numeric", precision, scale, ...extra });

export const RAW_TABLES = [
  "player_input_table",
  "qb_college_seasons",
  "rb_college_seasons",
  "wr_college_seasons",
  "te_college_seasons",
  "player_combine_measurables",
  "player_college_accolades",
  "nfl_team_reference_table",
  "nfl_team_offensive_performance",
];

export const COLLEGE_RAW_TABLES = [
  "qb_college_seasons",
  "rb_college_seasons",
  "wr_college_seasons",
  "te_college_seasons",
];

/** Columns that must appear in the CSV header or the file is rejected. */
export const RAW_KEY_COLUMNS = {
  player_input_table: ["player_id"],
  qb_college_seasons: ["player_id", "season"],
  rb_college_seasons: ["player_id", "season"],
  wr_college_seasons: ["player_id", "season"],
  te_college_seasons: ["player_id", "season"],
  player_combine_measurables: ["player_id"],
  player_college_accolades: ["player_id"],
  nfl_team_reference_table: ["nfl_team_id"],
  nfl_team_offensive_performance: ["nfl_team_id", "season"],
};

/** Applied only when the alias target is a real column on that table. */
export const HEADER_ALIASES = {
  date_of_birth: "dob",
  birth_date: "dob",
  birthdate: "dob",
  player_name: "full_name",
  name: "full_name",
  player: "full_name",
  pos: "position",
  abbr: "nfl_abbreviation",
  abbreviation: "nfl_abbreviation",
  team_name: "nfl_team",
  team: "nfl_team",
  gsis_id: "player_id",
  id: "player_id",
};

export const PLAYER_FIELDS = {
  full_name: text,
  position,
  dob: date,
  college_final: text,
  retirement_year: smallint,
  retirement_age: smallint,
  nfl_career_length: smallint,
  college_career_length: smallint,
};

export const DRAFT_FIELDS = {
  draft_year: smallint,
  draft_age: num(4, 2),
  draft_round: positiveSmallint,
  draft_pick: positiveSmallint,
  position_draft_rank: positiveSmallint,
  draft_team_id: smallint,
};

export const COLLEGE_FIELDS = {
  games_played: smallint,
  games_started: smallint,
  pass_ints: smallint,
  pass_attempts: integer,
  pass_completions: integer,
  pass_tds: smallint,
  pass_yds: integer,
  rush_attempts: integer,
  rush_yds: integer,
  rush_tds: smallint,
  receptions: integer,
  rec_yds: integer,
  rec_tds: smallint,
  routes_run: integer,
  yds_after_catch: integer,
  drops: integer,
  targets: integer,
  fumbles: integer,
  yds_after_contact: integer,
  college_sos: num(8, 4),
};

export const COMBINE_FIELDS = {
  combine_invited: bool,
  combine_participated: bool,
  height_inches: num(5, 2),
  weight_lbs: smallint,
  arm_length_inches: num(5, 2),
  hand_size_inches: num(5, 2),
  wingspan_inches: num(5, 2),
  forty_time: num(4, 2),
  ten_yard_split: num(4, 2),
  vertical_jump_inches: num(5, 2),
  broad_jump_inches: num(5, 2),
  three_cone_time: num(4, 2),
  short_shuttle_time: num(4, 2),
  bench_reps: smallint,
  ras: num(4, 2, { min: 0, max: 10 }),
};

export const ACCOLADE_FIELDS = {
  heisman_winner: bool,
  heisman_finalist: bool,
  all_american_first_team: bool,
  all_american_second_team: bool,
  all_american_third_team: bool,
  unanimous_all_american: bool,
  conference_player_of_year: bool,
  conference_offensive_player_of_year: bool,
  all_conference_first_team: bool,
  maxwell_award: bool,
  walter_camp_award: bool,
  davey_obrien_award: bool,
  manning_award: bool,
  unitas_golden_arm_award: bool,
  doak_walker_award: bool,
  biletnikoff_award: bool,
  mackey_award: bool,
  paul_hornung_award: bool,
};

export const OFFENSE_FIELDS = {
  season_team_name: text,
  games_played: smallint,
  points_scored: integer,
  total_yards: integer,
  total_plays: integer,
  first_downs: integer,
  turnovers: integer,
  pass_attempts: integer,
  pass_completions: integer,
  pass_yards: integer,
  pass_tds: integer,
  interceptions_thrown: integer,
  sacks_allowed: integer,
  sack_yards_lost: integer,
  rush_attempts: integer,
  rush_yards: integer,
  rush_tds: integer,
  fumbles_lost: integer,
  third_down_attempts: integer,
  third_down_conversions: integer,
  fourth_down_attempts: integer,
  fourth_down_conversions: integer,
  red_zone_attempts: integer,
  red_zone_tds: integer,
  strength_of_schedule: num(8, 4),
  offensive_line_pff_rank: smallint,
  offensive_line_pff_grade: num(5, 2),
  offensive_dvoa: num(8, 4),
  offensive_dvoa_rank: smallint,
  pass_offense_rank: smallint,
  rush_offense_rank: smallint,
  points_per_game_rank: smallint,
  yards_per_game_rank: smallint,
  source_url: text,
};

/** Raw offense uses nfl_team; core stores that string as season_team_name. */
export const OFFENSE_RAW_SOURCE = {
  season_team_name: "nfl_team",
};
