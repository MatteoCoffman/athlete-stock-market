const EMPTY = new Set([
  "",
  "n/a",
  "na",
  "null",
  "none",
  "-",
  "—",
  "–",
  ".",
  "#n/a",
  "undefined",
]);

const POSITIONS = {
  qb: "QB",
  quarterback: "QB",
  rb: "RB",
  "running back": "RB",
  wr: "WR",
  "wide receiver": "WR",
  te: "TE",
  "tight end": "TE",
};

/** Blank sheet cells and explicit placeholders become SQL null. */
export function cleanToken(raw) {
  if (raw == null) return "";
  const text = String(raw).trim().replace(/^'+/, "");
  if (EMPTY.has(text.toLowerCase())) return "";
  return text;
}

/**
 * @param {string | null | undefined} raw
 * @param {{ kind: string, precision?: number, scale?: number, min?: number, max?: number, maxLength?: number, positive?: boolean }} spec
 * @returns {{ ok: true, value: string | number | boolean | null } | { ok: false, reason: string }}
 */
export function parseTyped(raw, spec) {
  const text = cleanToken(raw);
  if (text === "") return { ok: true, value: null };

  if (spec.kind === "text") {
    if (spec.maxLength && text.length > spec.maxLength) {
      return { ok: false, reason: `"${text}" is longer than ${spec.maxLength} characters` };
    }
    return { ok: true, value: text };
  }

  if (spec.kind === "position") {
    const key = text.toLowerCase();
    const position = POSITIONS[key] || (POSITIONS[key.replace(/_/g, " ")] ?? null);
    if (!position) {
      return { ok: false, reason: `"${text}" is not QB, RB, WR, or TE` };
    }
    return { ok: true, value: position };
  }

  if (spec.kind === "bool") {
    const key = text.toLowerCase();
    if (["true", "t", "yes", "y", "1"].includes(key)) return { ok: true, value: true };
    if (["false", "f", "no", "n", "0"].includes(key)) return { ok: true, value: false };
    return { ok: false, reason: `"${text}" is not a yes/no value` };
  }

  if (spec.kind === "date") {
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    let year;
    let month;
    let day;
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else if (us) {
      month = Number(us[1]);
      day = Number(us[2]);
      year = Number(us[3]);
      if (us[3].length === 2) year += year >= 50 ? 1900 : 2000;
    } else {
      return { ok: false, reason: `"${text}" is not a date` };
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      return { ok: false, reason: `"${text}" is not a real date` };
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return { ok: true, value: `${year}-${mm}-${dd}` };
  }

  if (spec.kind === "int" || spec.kind === "smallint") {
    const stripped = text.replace(/,/g, "").replace(/%$/, "");
    if (!/^-?\d+(\.0+)?$/.test(stripped)) {
      return { ok: false, reason: `"${text}" is not a whole number` };
    }
    const value = Number(stripped);
    const min = spec.min ?? (spec.kind === "smallint" ? -32768 : -2147483648);
    const max = spec.max ?? (spec.kind === "smallint" ? 32767 : 2147483647);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      return { ok: false, reason: `"${text}" is outside the allowed range` };
    }
    if (spec.positive && value <= 0) {
      return { ok: false, reason: `"${text}" must be greater than 0` };
    }
    return { ok: true, value };
  }

  if (spec.kind === "numeric") {
    const stripped = text.replace(/,/g, "").replace(/%$/, "");
    if (!/^-?\d+(\.\d+)?$/.test(stripped)) {
      return { ok: false, reason: `"${text}" is not a number` };
    }
    const scale = spec.scale ?? 4;
    const factor = 10 ** scale;
    const value = Math.round(Number(stripped) * factor) / factor;
    const limit = spec.precision ? 10 ** (spec.precision - scale) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(value) || Math.abs(value) >= limit) {
      return { ok: false, reason: `"${text}" does not fit NUMERIC(${spec.precision},${scale})` };
    }
    if (spec.min != null && value < spec.min) {
      return { ok: false, reason: `"${text}" is below ${spec.min}` };
    }
    if (spec.max != null && value > spec.max) {
      return { ok: false, reason: `"${text}" is above ${spec.max}` };
    }
    return { ok: true, value };
  }

  return { ok: false, reason: `unknown type ${spec.kind}` };
}
