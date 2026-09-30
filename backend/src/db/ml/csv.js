/**
 * Small CSV reader for Google Sheet exports (quoted fields, commas, newlines).
 */

export function normalizeHeader(header) {
  return String(header)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text) {
  let src = String(text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || (c === "\r" && src[i + 1] !== "\n")) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quote");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((cell) => cell === "")) {
    rows.pop();
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1) };
}
