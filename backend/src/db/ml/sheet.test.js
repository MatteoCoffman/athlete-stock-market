import assert from "node:assert/strict";
import test from "node:test";
import { mapHeaders } from "./importRaw.js";
import { parseCsv, normalizeHeader } from "./csv.js";
import { readFields } from "./promoteCore.js";
import { PLAYER_FIELDS } from "./tables.js";
import { parseTyped } from "./values.js";

test("parseCsv keeps quoted commas and quotes", () => {
  const parsed = parseCsv('name,note\n"Mahomes, Patrick","he said ""hi"""\n');
  assert.deepEqual(parsed.headers, ["name", "note"]);
  assert.deepEqual(parsed.rows, [['Mahomes, Patrick', 'he said "hi"']]);
});

test("normalizeHeader turns sheet titles into column names", () => {
  assert.equal(normalizeHeader("Player ID"), "player_id");
  assert.equal(normalizeHeader("Yds After Catch"), "yds_after_catch");
});

test("mapHeaders accepts spaced names and ignores unknown columns", () => {
  const mapped = mapHeaders(
    ["Player ID", "Full Name", "Favorite Color"],
    ["player_id", "full_name", "position"],
    ["player_id"]
  );
  assert.equal(mapped.indexByColumn.get("player_id"), 0);
  assert.equal(mapped.indexByColumn.get("full_name"), 1);
  assert.deepEqual(mapped.unmatched, ["Favorite Color"]);
  assert.deepEqual(mapped.missingKeys, []);
});

test("mapHeaders rejects a file that lacks its key column", () => {
  const mapped = mapHeaders(["Full Name"], ["player_id", "full_name"], ["player_id"]);
  assert.deepEqual(mapped.missingKeys, ["player_id"]);
});

test("blank and N/A become null, whole numbers accept thousands separators", () => {
  assert.equal(parseTyped("N/A", { kind: "int" }).value, null);
  assert.equal(parseTyped("1,234", { kind: "int" }).value, 1234);
  assert.equal(parseTyped("16.0", { kind: "smallint" }).value, 16);
  assert.equal(parseTyped("12.5", { kind: "int" }).ok, false);
});

test("dates and positions accept sheet spellings", () => {
  assert.equal(parseTyped("9/17/1995", { kind: "date" }).value, "1995-09-17");
  assert.equal(parseTyped("quarterback", { kind: "position" }).value, "QB");
  assert.equal(parseTyped("K", { kind: "position" }).ok, false);
});

test("RAS outside 0-10 is rejected and yes/no becomes boolean", () => {
  assert.equal(parseTyped("10.4", { kind: "numeric", precision: 4, scale: 2, min: 0, max: 10 }).ok, false);
  assert.equal(parseTyped("yes", { kind: "bool" }).value, true);
  assert.equal(parseTyped("", { kind: "bool" }).value, null);
});

test("optional garbage on a player becomes null without dropping the name", () => {
  const read = readFields(
    { full_name: "Test Player", position: "QB", retirement_year: "nope", dob: "" },
    PLAYER_FIELDS
  );
  assert.equal(read.values.full_name, "Test Player");
  assert.equal(read.values.position, "QB");
  assert.equal(read.values.retirement_year, null);
  assert.equal(read.values.dob, null);
  assert.equal(read.warnings.length, 1);
});
