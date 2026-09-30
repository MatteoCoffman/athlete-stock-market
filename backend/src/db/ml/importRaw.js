/**
 * Load Google Sheet CSV exports into athlete_market_ml raw.* tables.
 * Each run appends a new import_batch_id. Cells stay text.
 */
import fs from "fs";
import path from "path";
import { assertMlDatabaseName, getClient } from "./client.js";
import { normalizeHeader, parseCsv } from "./csv.js";
import { HEADER_ALIASES, RAW_KEY_COLUMNS, RAW_TABLES } from "./tables.js";

const LINEAGE = new Set([
  "raw_row_id",
  "import_batch_id",
  "source_sheet",
  "source_row",
  "imported_at",
]);

/**
 * @param {string[]} headers
 * @param {string[]} columns
 * @param {string[]} keyColumns
 */
export function mapHeaders(headers, columns, keyColumns) {
  const columnSet = new Set(columns);
  /** @type {Map<string, number>} */
  const indexByColumn = new Map();
  /** @type {string[]} */
  const unmatched = [];
  /** @type {string[]} */
  const duplicates = [];

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    let column = columnSet.has(normalized) ? normalized : null;
    if (!column) {
      const alias = HEADER_ALIASES[normalized];
      if (alias && columnSet.has(alias)) column = alias;
    }
    if (!column && normalized === "college" && columnSet.has("school") && !columnSet.has("college_final")) {
      column = "school";
    }
    if (LINEAGE.has(normalized)) return;
    if (!column || LINEAGE.has(column)) {
      unmatched.push(header.trim() || header);
      return;
    }
    if (indexByColumn.has(column)) {
      duplicates.push(column);
      return;
    }
    indexByColumn.set(column, index);
  });

  const missingKeys = keyColumns.filter((key) => !indexByColumn.has(key));
  return { indexByColumn, unmatched, duplicates, missingKeys };
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return name;
}

/**
 * @param {string} dir
 * @returns {{ table: string, filePath: string }[]}
 */
export function matchCsvFiles(dir) {
  const allowed = new Set(RAW_TABLES);
  /** @type {Map<string, string>} */
  const found = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const stem = normalizeHeader(name.slice(0, -4));
    if (!allowed.has(stem)) continue;
    if (found.has(stem)) {
      throw new Error(`Two CSV files map to raw.${stem}: ${found.get(stem)} and ${name}`);
    }
    found.set(stem, path.join(dir, name));
  }
  return [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, filePath]) => ({ table, filePath }));
}

async function rawColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'raw' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((row) => row.column_name).filter((name) => !LINEAGE.has(name));
}

async function nextBatchId(client) {
  const unions = RAW_TABLES.map((table) => `SELECT import_batch_id FROM raw.${quoteIdent(table)}`).join(
    " UNION ALL "
  );
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(import_batch_id), 0) + 1 AS id FROM (${unions}) batches`
  );
  return Number(rows[0].id);
}

/**
 * @param {string} dir
 */
export async function importRawDirectory(dir) {
  assertMlDatabaseName();
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`CSV directory not found: ${resolved}`);
  }
  const files = matchCsvFiles(resolved);
  if (files.length === 0) {
    throw new Error(
      `No matching CSV files in ${resolved}.\nExpected names:\n  ${RAW_TABLES.map((t) => `${t}.csv`).join("\n  ")}`
    );
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const batchId = await nextBatchId(client);
    /** @type {{ table: string, file: string, inserted: number, blank: number, unmatched: string[] }[]} */
    const tables = [];

    for (const file of files) {
      const text = fs.readFileSync(file.filePath, "utf8");
      const parsed = parseCsv(text);
      const columns = await rawColumns(client, file.table);
      if (columns.length === 0) {
        throw new Error(`raw.${file.table} has no columns. Run npm run db:ml:migrate first.`);
      }
      const mapped = mapHeaders(parsed.headers, columns, RAW_KEY_COLUMNS[file.table] || []);
      if (mapped.duplicates.length) {
        throw new Error(
          `${path.basename(file.filePath)} has duplicate columns: ${mapped.duplicates.join(", ")}`
        );
      }
      if (mapped.missingKeys.length) {
        throw new Error(
          `${path.basename(file.filePath)} is missing required columns: ${mapped.missingKeys.join(", ")}. Headers seen: ${parsed.headers.join(", ")}`
        );
      }
      if (mapped.indexByColumn.size === 0) {
        throw new Error(
          `${path.basename(file.filePath)} headers did not match raw.${file.table}. Headers seen: ${parsed.headers.join(", ")}`
        );
      }

      const dataColumns = [...mapped.indexByColumn.keys()];
      const insertColumns = ["import_batch_id", "source_sheet", "source_row", ...dataColumns];
      /** @type {unknown[][]} */
      const records = [];
      let blank = 0;
      parsed.rows.forEach((cells, index) => {
        const values = dataColumns.map((column) => {
          const cell = cells[mapped.indexByColumn.get(column)] ?? "";
          const trimmed = String(cell).trim();
          return trimmed === "" ? null : trimmed;
        });
        if (values.every((value) => value == null)) {
          blank += 1;
          return;
        }
        records.push([batchId, file.table, index + 2, ...values]);
      });

      await insertChunks(client, file.table, insertColumns, records);
      tables.push({
        table: file.table,
        file: path.basename(file.filePath),
        inserted: records.length,
        blank,
        unmatched: mapped.unmatched,
      });
    }

    await client.query("COMMIT");
    return { batchId, tables };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertChunks(client, table, columns, records) {
  const size = 200;
  for (let start = 0; start < records.length; start += size) {
    const chunk = records.slice(start, start + size);
    const values = [];
    const tuples = chunk.map((record) => {
      const placeholders = record.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const sql = `INSERT INTO raw.${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES ${tuples.join(", ")}`;
    await client.query(sql, values);
  }
}
