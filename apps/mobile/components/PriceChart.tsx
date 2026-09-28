import { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from "react-native-svg";
import { changeColor, colors, radii, spacing } from "../constants/theme";

type Point = { t?: string; price: number } | number;

export type ChartRangeKey = "24h" | "1w" | "1m" | "6m" | "1y";

type RangeOption = {
  key: ChartRangeKey;
  label: string;
  short: string;
  ms: number;
};

const RANGE_OPTIONS: RangeOption[] = [
  { key: "24h", label: "Last 24 hours", short: "24H", ms: 24 * 60 * 60 * 1000 },
  { key: "1w", label: "Last week", short: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "Last month", short: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "6m", label: "Last 6 months", short: "6M", ms: 182 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "Last year", short: "1Y", ms: 365 * 24 * 60 * 60 * 1000 },
];

type Props = {
  data: Point[];
  height?: number;
  /** @deprecated prefer changePct */
  positive?: boolean;
  changePct?: number;
  compact?: boolean;
  /** Fired while the user is scrubbing — parent should disable ScrollView. */
  onScrubChange?: (active: boolean) => void;
  defaultRange?: ChartRangeKey;
};

type ChartPt = { x: number; y: number; price: number; t?: string; ms: number };
type SeriesPt = { price: number; t?: string };

/** Nearest point by horizontal position (needed once x is time-scaled). */
function nearestIndexByX(pts: ChartPt[], x: number) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const d = Math.abs(pts[i].x - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function normalize(data: Point[]): SeriesPt[] {
  return data.map((d) => (typeof d === "number" ? { price: d } : { price: d.price, t: d.t }));
}

function filterByRange(series: SeriesPt[], rangeMs: number): SeriesPt[] {
  if (series.length < 2) return series;
  const now = Date.now();
  const cutoff = now - rangeMs;

  const dated = series
    .map((s) => ({ ...s, ms: s.t ? new Date(s.t).getTime() : NaN }))
    .filter((s) => !Number.isNaN(s.ms))
    .sort((a, b) => a.ms - b.ms);

  if (dated.length < 2) return series;

  const inRange = dated.filter((s) => s.ms >= cutoff);
  const before = [...dated].reverse().find((s) => s.ms < cutoff);

  let out: SeriesPt[];
  if (inRange.length === 0) {
    // Entire series is older than the window — show the tail so the chart isn't empty.
    out = dated.slice(-Math.min(dated.length, 24)).map(({ price, t }) => ({ price, t }));
  } else if (before) {
    out = [
      { price: before.price, t: new Date(cutoff).toISOString() },
      ...inRange.map(({ price, t }) => ({ price, t })),
    ];
  } else {
    out = inRange.map(({ price, t }) => ({ price, t }));
  }

  return out.length >= 2 ? out : series;
}

function formatWhen(iso: string | undefined, rangeKey: ChartRangeKey) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (rangeKey === "24h" || rangeKey === "1w") {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: rangeKey === "1y" || rangeKey === "6m" ? "numeric" : undefined,
  });
}

function formatPrice(n: number) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PriceChart({
  data,
  height = 200,
  positive = true,
  changePct,
  compact = false,
  onScrubChange,
  defaultRange = "24h",
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(280, Math.min(windowWidth - 64, 680)));
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState<ChartRangeKey>(defaultRange);
  const [menuOpen, setMenuOpen] = useState(false);

  const padX = 8;
  const padY = 16;
  const padRight = 52;
  const rangeOpt = RANGE_OPTIONS.find((r) => r.key === rangeKey) ?? RANGE_OPTIONS[0];

  const series = useMemo(() => filterByRange(normalize(data), rangeOpt.ms), [data, rangeOpt.ms]);

  const rangePct = useMemo(() => {
    if (series.length >= 2) {
      const a = series[0].price;
      const b = series[series.length - 1].price;
      if (a > 0) return Number((((b - a) / a) * 100).toFixed(2));
    }
    return changePct ?? (positive ? 1 : -1);
  }, [series, changePct, positive]);

  const stroke = changeColor(rangePct);
  const fillId = rangePct > 0 ? "chartUp" : rangePct < 0 ? "chartDown" : "chartFlat";

  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    const prices = series.map((s) => s.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const mid = (hi + lo) / 2;
    const priceRange = hi - lo || 1;
    const innerW = chartWidth - padX - padRight;
    const innerH = height - padY * 2;

    const timed = series.map((s, i) => {
      const parsed = s.t ? new Date(s.t).getTime() : NaN;
      return {
        price: s.price,
        t: s.t,
        ms: Number.isNaN(parsed) ? i : parsed,
      };
    });
    const t0 = timed[0].ms;
    const t1 = timed[timed.length - 1].ms;
    const timeSpan = t1 - t0;
    const useTimeAxis = timeSpan > 0;

    const pts: ChartPt[] = timed.map((s, i) => {
      const xRatio = useTimeAxis ? (s.ms - t0) / timeSpan : i / (timed.length - 1);
      const x = padX + xRatio * innerW;
      const y = padY + (1 - (s.price - lo) / priceRange) * innerH;
      return { x, y, price: s.price, t: s.t, ms: s.ms };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${height - 2} L ${pts[0].x.toFixed(2)} ${height - 2} Z`;
    const last = pts[pts.length - 1];
    const midY = padY + (1 - (mid - lo) / priceRange) * innerH;
    return { line, area, lo, hi, mid, midY, last, pts, innerW };
  }, [series, chartWidth, height]);

  function indexFromX(x: number) {
    if (!geometry) return 0;
    const clamped = Math.max(padX, Math.min(x, padX + geometry.innerW));
    return nearestIndexByX(geometry.pts, clamped);
  }

  function onScrub(locationX: number) {
    setActiveIdx(indexFromX(locationX));
  }

  function beginScrub(locationX: number, lockScroll = true) {
    if (menuOpen) setMenuOpen(false);
    if (lockScroll) onScrubChange?.(true);
    onScrub(locationX);
  }

  function endScrub() {
    onScrubChange?.(false);
    setActiveIdx(null);
  }

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartWidth(w);
  }

  function selectRange(key: ChartRangeKey) {
    setRangeKey(key);
    setMenuOpen(false);
    setActiveIdx(null);
  }

  if (!geometry) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Chart unlocks after price moves</Text>
      </View>
    );
  }

  const active = activeIdx != null ? geometry.pts[activeIdx] : null;
  const display = active ?? geometry.last;

  return (
    <View onLayout={onLayout} style={styles.root}>
      <View style={styles.hud}>
        <View style={styles.hudLeft}>
          <Text style={styles.hudPrice}>{formatPrice(display.price)}</Text>
          <Text style={styles.hudWhen}>
            {active ? formatWhen(active.t, rangeKey) : "Latest"}
            {active ? "" : ` · ${formatWhen(geometry.last.t, rangeKey)}`}
          </Text>
          <Text style={[styles.hudRangePct, { color: stroke }]}>
            {rangePct > 0 ? "+" : ""}
            {rangePct.toFixed(2)}% · {rangeOpt.short}
          </Text>
        </View>
        <View style={styles.hudRight}>
          <View style={styles.dropdownWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chart time range"
              onPress={() => setMenuOpen((o) => !o)}
              style={[styles.dropdownBtn, menuOpen && styles.dropdownBtnOpen]}
            >
              <Text style={styles.dropdownBtnText}>{rangeOpt.short}</Text>
              <Text style={styles.dropdownCaret}>{menuOpen ? "▴" : "▾"}</Text>
            </Pressable>
            {menuOpen ? (
              <View style={styles.dropdownMenu}>
                {RANGE_OPTIONS.map((opt) => {
                  const selected = opt.key === rangeKey;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => selectRange(opt.key)}
                      style={[styles.dropdownItem, selected && styles.dropdownItemSelected]}
                    >
                      <Text
                        style={[
                          styles.dropdownItemShort,
                          selected && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {opt.short}
                      </Text>
                      <Text
                        style={[
                          styles.dropdownItemLabel,
                          selected && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
          <View style={styles.rangeCol}>
            <Text style={styles.rangeLabel}>H {formatPrice(geometry.hi)}</Text>
            <Text style={styles.rangeLabel}>L {formatPrice(geometry.lo)}</Text>
          </View>
        </View>
      </View>

      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => beginScrub(e.nativeEvent.locationX)}
        onResponderMove={(e) => onScrub(e.nativeEvent.locationX)}
        onResponderRelease={endScrub}
        onResponderTerminate={endScrub}
        style={
          Platform.OS === "web"
            ? [{ height, width: chartWidth }, { cursor: "crosshair" } as object]
            : { height, width: chartWidth }
        }
        {...(Platform.OS === "web"
          ? ({
              onMouseMove: (e: { nativeEvent: { offsetX?: number; locationX?: number } }) => {
                const x = e.nativeEvent.offsetX ?? e.nativeEvent.locationX ?? 0;
                beginScrub(x, false);
              },
              onMouseLeave: () => setActiveIdx(null),
            } as object)
          : null)}
      >
        <Svg width={chartWidth} height={height} pointerEvents="none">
          <Defs>
            <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <Line
            x1={padX}
            y1={geometry.midY}
            x2={padX + geometry.innerW}
            y2={geometry.midY}
            stroke={colors.borderStrong}
            strokeDasharray="4 6"
            strokeWidth={1}
          />
          <SvgText
            x={chartWidth - 4}
            y={geometry.midY + 4}
            fill={colors.textMuted}
            fontSize="11"
            fontWeight="700"
            textAnchor="end"
          >
            {formatPrice(geometry.mid)}
          </SvgText>

          <Path d={geometry.area} fill={`url(#${fillId})`} />
          <Path
            d={geometry.line}
            stroke={stroke}
            strokeWidth={compact ? 2 : 2.75}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <Circle cx={display.x} cy={display.y} r={active ? 6 : 5} fill={stroke} />
          <Circle cx={display.x} cy={display.y} r={active ? 12 : 9} fill={stroke} opacity={0.2} />

          {active ? (
            <>
              <Line
                x1={active.x}
                y1={padY}
                x2={active.x}
                y2={height - 4}
                stroke={colors.textMuted}
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.7}
              />
              <Line
                x1={padX}
                y1={active.y}
                x2={padX + geometry.innerW}
                y2={active.y}
                stroke={colors.textMuted}
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.35}
              />
            </>
          ) : null}
        </Svg>

        {active ? (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                left: Math.min(Math.max(active.x - 70, 0), chartWidth - 140),
                top: Math.max(active.y - 58, 4),
              },
            ]}
          >
            <Text style={styles.tooltipPrice}>{formatPrice(active.price)}</Text>
            <Text style={styles.tooltipWhen}>{formatWhen(active.t, rangeKey)}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.hint}>
        {Platform.OS === "web" ? "Hover" : "Drag"} the chart to inspect a point
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 2 },
  hud: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
    zIndex: 5,
  },
  hudLeft: { flex: 1, paddingRight: spacing.sm },
  hudRight: { alignItems: "flex-end", gap: 8 },
  hudPrice: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  hudWhen: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  hudRangePct: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  dropdownWrap: {
    position: "relative",
    zIndex: 20,
    alignItems: "flex-end",
  },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElevated,
  },
  dropdownBtnOpen: {
    borderColor: colors.orange,
  },
  dropdownBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  dropdownCaret: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  dropdownMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 6,
    minWidth: 188,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElevated,
    overflow: "hidden",
    zIndex: 30,
    ...Platform.select({
      web: { boxShadow: "0 12px 28px rgba(0,0,0,0.45)" } as object,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
      },
    }),
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownItemSelected: {
    backgroundColor: colors.orangeSoft,
  },
  dropdownItemShort: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    width: 28,
  },
  dropdownItemLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  dropdownItemTextSelected: {
    color: colors.orange,
  },
  rangeCol: { alignItems: "flex-end", gap: 2 },
  rangeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  tooltip: {
    position: "absolute",
    width: 140,
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  tooltipPrice: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  tooltipWhen: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  hint: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: spacing.sm,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
  },
  emptyText: { color: colors.textMuted, fontSize: 13 },
});
