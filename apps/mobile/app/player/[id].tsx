import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { ElevatedCard } from "../../components/ElevatedCard";
import { PressScale } from "../../components/PressScale";
import { PriceChart } from "../../components/PriceChart";
import { enterDown } from "../../constants/motion";
import { colors, money, radii, spacing, changeColor, changeSoft, changeBorder } from "../../constants/theme";
import { api, Player } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh, user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [trades, setTrades] = useState<{ side: string; qty: number; price: number; ts: string }[]>([]);
  const [holding, setHolding] = useState<{ shares: number; avgCost: number; marketValue: number } | null>(
    null
  );
  const [qty, setQty] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartScrubbing, setChartScrubbing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [data, folio] = await Promise.all([api.player(id), api.portfolio()]);
      setPlayer(data.player);
      setTrades(data.recentTrades);
      const pos = folio.positions.find((p) => p.playerId === id);
      setHolding(
        pos
          ? { shares: pos.shares, avgCost: pos.avgCost, marketValue: pos.marketValue }
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load player");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll so bot trades show up on the chart without leaving the screen.
  useEffect(() => {
    const intervalId = setInterval(() => {
      load();
    }, 4000);
    return () => clearInterval(intervalId);
  }, [load]);

  async function trade(side: "buy" | "sell") {
    if (!id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.trade(id, side, Number(qty));
      setPlayer(result.player);
      setMessage(`${side === "buy" ? "Bought" : "Sold"} ${qty} shares · cash ${money(result.cashBalance)}`);
      await refresh();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setBusy(false);
    }
  }

  const chartData = useMemo(() => {
    if (player?.priceHistory && player.priceHistory.length > 1) return player.priceHistory;
    if (trades.length > 1) return [...trades].reverse().map((t) => ({ t: t.ts, price: t.price }));
    return [];
  }, [player, trades]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || "Player not found"}</Text>
      </View>
    );
  }

  const pct = player.changePct;
  const estCost = Number(qty) > 0 ? Number(qty) * player.price : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={!chartScrubbing}
      // Keep momentum from fighting the chart scrub gesture.
      nestedScrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    >
      <Animated.View entering={enterDown(0)} style={styles.header}>
        <View style={styles.posTeam}>
          <Text style={styles.pos}>{player.position}</Text>
          <Text style={styles.team}>{player.team}</Text>
        </View>
        <Text style={styles.name}>{player.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{money(player.price)}</Text>
          <View
            style={[
              styles.chip,
              { backgroundColor: changeSoft(pct), borderColor: changeBorder(pct) },
            ]}
          >
            <Text style={{ color: changeColor(pct), fontWeight: "800" }}>
              {pct > 0 ? "+" : ""}
              {pct.toFixed(2)}%
            </Text>
          </View>
        </View>
        {holding ? (
          <Text style={styles.youHold}>
            You hold {holding.shares} sh · avg {money(holding.avgCost)} ·{" "}
            {money(holding.marketValue)}
          </Text>
        ) : (
          <Text style={styles.cashHint}>Cash · {money(user?.cashBalance ?? 0)}</Text>
        )}
      </Animated.View>

      <ElevatedCard float delay={40} style={styles.chartCard}>
        <Text style={styles.chartTitle}>PRICE HISTORY</Text>
        <PriceChart
          data={chartData}
          changePct={pct}
          height={240}
          onScrubChange={setChartScrubbing}
        />
      </ElevatedCard>

      <View style={styles.stats}>
        {[
          { label: "Open", value: money(player.openPrice) },
          { label: "Float left", value: player.freeFloat.toLocaleString() },
          { label: "Your shares", value: String(holding?.shares ?? 0) },
        ].map((s, i) => (
          <ElevatedCard key={s.label} delay={70 + i * 30} style={styles.stat} padded={false}>
            <View style={styles.statInner}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          </ElevatedCard>
        ))}
      </View>

      <ElevatedCard float delay={140} style={styles.tradeCard}>
        <View style={styles.tradeHeader}>
          <Text style={styles.tradeTitle}>Trade</Text>
          <View style={styles.tradeBadge}>
            <Text style={styles.tradeBadgeText}>MARKET</Text>
          </View>
        </View>
        <Text style={styles.label}>Shares</Text>
        <View style={styles.inputShell}>
          <TextInput
            style={styles.input}
            value={qty}
            onChangeText={setQty}
            keyboardType="number-pad"
            placeholderTextColor={colors.textDim}
            selectionColor={colors.orange}
          />
        </View>
        <Text style={styles.est}>Est. notional · {money(estCost)}</Text>
        <View style={styles.actions}>
          <PressScale
            style={[styles.btn, styles.buy]}
            disabled={busy}
            onPress={() => trade("buy")}
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buyText}>Buy</Text>}
          </PressScale>
          <PressScale
            style={[styles.btn, styles.sell]}
            disabled={busy}
            onPress={() => trade("sell")}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.sellText}>Sell</Text>
            )}
          </PressScale>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ElevatedCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: spacing.md },
  posTeam: { flexDirection: "row", alignItems: "center", gap: 8 },
  pos: {
    color: colors.orange,
    backgroundColor: colors.orangeSoft,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    fontWeight: "800",
    fontSize: 12,
    borderWidth: 1,
    borderColor: "rgba(255,122,26,0.28)",
  },
  team: { color: colors.textMuted, fontWeight: "700", letterSpacing: 0.5 },
  name: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  price: { color: colors.text, fontSize: 40, fontWeight: "800", fontVariant: ["tabular-nums"] },
  chip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  youHold: { color: colors.textMuted, marginTop: 10, fontSize: 13, lineHeight: 18 },
  cashHint: { color: colors.textMuted, marginTop: 10 },
  chartCard: { marginBottom: spacing.md, overflow: "visible", zIndex: 4 },
  chartTitle: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  stats: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  stat: { flex: 1 },
  statInner: { padding: spacing.md },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  statValue: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 4 },
  tradeCard: {},
  tradeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  tradeTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  tradeBadge: {
    backgroundColor: colors.orangeSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,122,26,0.32)",
  },
  tradeBadgeText: { color: colors.orange, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  label: { color: colors.textMuted, fontWeight: "700", marginBottom: spacing.sm },
  inputShell: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElevated,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    color: colors.text,
    padding: spacing.md,
    fontSize: 18,
    fontWeight: "700",
  },
  est: { color: colors.textMuted, marginTop: 8, marginBottom: spacing.md },
  actions: { flexDirection: "row", gap: spacing.md },
  btn: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  buy: { backgroundColor: colors.orange },
  sell: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  buyText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  sellText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  error: { color: colors.red, marginTop: spacing.md, fontWeight: "600" },
  message: { color: colors.orange, marginTop: spacing.md, fontWeight: "600" },
});
