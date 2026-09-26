export const colors = {
  bg: "#07111F",
  bgElevated: "#0B182C",
  surface: "#122038",
  surfaceElevated: "#1A2C4A",
  surfaceAlt: "#1A2C4A",
  border: "#2A4060",
  borderStrong: "#3A5578",
  text: "#F2F6FB",
  textMuted: "#A9BBD0",
  muted: "#A9BBD0",
  textDim: "#6E849E",
  /** Brand accent */
  orange: "#FF7A1A",
  orangeDim: "#E0630C",
  orangeSoft: "rgba(255, 122, 26, 0.14)",
  /** Aliases for brand call sites that still say `green` historically — prefer `orange` */
  accent: "#FF7A1A",
  accentSoft: "rgba(255, 122, 26, 0.14)",
  /** Market: up / down */
  green: "#3DFF8A",
  greenDim: "#1DBF5A",
  greenSoft: "rgba(61, 255, 138, 0.14)",
  navy: "#0B182C",
  navyDeep: "#07111F",
  red: "#FF5C6A",
  redSoft: "rgba(255, 92, 106, 0.12)",
  yellow: "#F5C842",
  white: "#FFFFFF",
  black: "#000000",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

/** Soft 3D elevation (works on iOS/Android/web) */
export const elevation = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  cardSoft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 8,
  },
  float: {
    shadowColor: "#040B16",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 20,
  },
} as const;

/** Dense list row metrics (Fidelity-style) */
export const list = {
  rowPadV: 10,
  rowPadH: 12,
  badgeMinW: 36,
  nameSize: 14,
  metaSize: 12,
  priceSize: 14,
  chipPadH: 7,
  chipPadV: 2,
  chipFont: 11,
};

export function money(n: number) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** +green / −red / 0 white */
export function changeColor(pct: number) {
  if (pct > 0) return colors.green;
  if (pct < 0) return colors.red;
  return colors.white;
}

export function changeSoft(pct: number) {
  if (pct > 0) return colors.greenSoft;
  if (pct < 0) return colors.redSoft;
  return "rgba(255,255,255,0.08)";
}

export function changeBorder(pct: number) {
  if (pct > 0) return "rgba(61,255,138,0.32)";
  if (pct < 0) return "rgba(255,92,106,0.32)";
  return "rgba(255,255,255,0.2)";
}

export function sortMovers<T extends { changePct: number; price: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const d = Math.abs(b.changePct) - Math.abs(a.changePct);
    if (d !== 0) return d;
    return b.price - a.price;
  });
}
