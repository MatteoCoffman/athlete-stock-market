import { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from "react-native-svg";
import { changeColor, colors, radii, spacing } from "../constants/theme";

type Point = { t?: string; price: number } | number;

type Props = {
  data: Point[];
  height?: number;
  /** @deprecated prefer changePct */
  positive?: boolean;
  changePct?: number;
  compact?: boolean;
  /** Fired while the user is scrubbing — parent should disable ScrollView. */
  onScrubChange?: (active: boolean) => void;
};

type ChartPt = { x: number; y: number; price: number; t?: string };

function normalize(data: Point[]): { price: number; t?: string }[] {
  return data.map((d) => (typeof d === "number" ? { price: d } : { price: d.price, t: d.t }));
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(280, Math.min(windowWidth - 64, 680)));
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const padX = 8;
  const padY = 16;
  const padRight = 52; // room for mid-line price label
  const pct = changePct ?? (positive ? 1 : -1);
  const stroke = changeColor(pct);
  const fillId = pct > 0 ? "chartUp" : pct < 0 ? "chartDown" : "chartFlat";

  const series = useMemo(() => normalize(data), [data]);

  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    const prices = series.map((s) => s.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const mid = (hi + lo) / 2;
    const range = hi - lo || 1;
    const innerW = chartWidth - padX - padRight;
    const innerH = height - padY * 2;
    const pts: ChartPt[] = series.map((s, i) => {
      const x = padX + (i / (series.length - 1)) * innerW;
      const y = padY + (1 - (s.price - lo) / range) * innerH;
      return { x, y, price: s.price, t: s.t };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${height - 2} L ${pts[0].x.toFixed(2)} ${height - 2} Z`;
    const last = pts[pts.length - 1];
    const midY = padY + (1 - (mid - lo) / range) * innerH;
    return { line, area, lo, hi, mid, midY, last, pts, innerW };
  }, [series, chartWidth, height]);

  function indexFromX(x: number) {
    if (!geometry) return 0;
    const clamped = Math.max(padX, Math.min(x, padX + geometry.innerW));
    const ratio = (clamped - padX) / geometry.innerW;
    return Math.round(ratio * (geometry.pts.length - 1));
  }

  function onScrub(locationX: number) {
    setActiveIdx(indexFromX(locationX));
  }

  function beginScrub(locationX: number, lockScroll = true) {
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
    <View onLayout={onLayout}>
      <View style={styles.hud}>
        <View>
          <Text style={styles.hudPrice}>{formatPrice(display.price)}</Text>
          <Text style={styles.hudWhen}>
            {active ? formatWhen(active.t) : "Latest"}
            {active ? "" : ` · ${formatWhen(geometry.last.t)}`}
          </Text>
        </View>
        <View style={styles.rangeCol}>
          <Text style={styles.rangeLabel}>H {formatPrice(geometry.hi)}</Text>
          <Text style={styles.rangeLabel}>L {formatPrice(geometry.lo)}</Text>
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
                // Hover inspect only — don't lock page scroll on web.
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

          {/* Mid-range guide (visual center of high/low) */}
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

          {/* Latest or scrubbed point */}
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
            <Text style={styles.tooltipWhen}>{formatWhen(active.t)}</Text>
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
  hud: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
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
