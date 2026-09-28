import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rosterPath = join(__dirname, "roster.json");

/**
 * Seed list for reset/seed. Generated from nflverse roster_2026.csv
 * via `npm run roster` → roster.json (active QB/RB/WR/TE).
 */
export const SEED_PLAYERS = JSON.parse(readFileSync(rosterPath, "utf8"));
