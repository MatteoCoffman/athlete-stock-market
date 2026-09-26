import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { ElevatedCard } from "../../components/ElevatedCard";
import { PlayerRow } from "../../components/PlayerRow";
import { PressScale } from "../../components/PressScale";
import { enterDown } from "../../constants/motion";
import { colors, money, radii, sortMovers, spacing } from "../../constants/theme";
import { api, Player } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

type Holding = {
  playerId: string;
  shares: number;
  avgCost: number;
  marketValue: number;
  player: Player | null;
};

export default function PortfolioScreen() {
  const { refresh } = useAuth();
  const [cash, setCash] = useState(0);
  const [positionsValue, setPositionsValue] = useState(0);
  const [total, setTotal] = useState(0);
  const [positions, setPositions] = useState<Holding[]>([]);
  const [popular, setPopular] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [folio, market] = await Promise.all([api.portfolio(), api.players()]);
      setCash(folio.cashBalance);
      setPositionsValue(folio.positionsValue);
      setTotal(folio.totalValue);
      setPositions(folio.positions);
      const heldIds = new Set(folio.positions.map((p) => p.playerId));
      setPopular(sortMovers(market.players.filter((p) => !heldIds.has(p.id))).slice(0, 8));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 5000);
      return () => clearInterval(id);
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.orange} />}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    >
      <ElevatedCard float delay={40} style={styles.summaryCard}>
        <Text style={styles.kicker}>PORTFOLIO</Text>
        <Text style={styles.total}>{money(total)}</Text>
        <Text style={styles.totalLabel}>Total value</Text>
        <View style={styles.rowStats}>
          <View style={styles.statBox}>
            <Text style={styles.label}>Cash</Text>
            <Text style={styles.stat}>{money(cash)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.label}>Positions</Text>
            <Text style={styles.stat}>{money(positionsValue)}</Text>
          </View>
        </View>
      </ElevatedCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Animated.Text entering={enterDown(80)} style={styles.section}>
        Holdings
      </Animated.Text>
      <ElevatedCard delay={100} padded={false} style={styles.listCard}>
        {positions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No holdings yet</Text>
            <Text style={styles.emptyBody}>Search players and buy shares to build your book.</Text>
            <PressScale style={styles.cta} onPress={() => router.push("/(tabs)/search")}>
              <Text style={styles.ctaText}>Search players</Text>
            </PressScale>
          </View>
        ) : (
          positions.map((item) =>
            item.player ? (
              <PlayerRow
                key={item.playerId}
                player={item.player}
                detail={`${item.shares} sh · avg ${money(item.avgCost)}`}
                trailingValue={money(item.marketValue)}
                onPress={() => router.push(`/player/${item.playerId}`)}
              />
            ) : null
          )
        )}
      </ElevatedCard>

      <Animated.Text entering={enterDown(140)} style={[styles.section, { marginTop: spacing.lg }]}>
        Popular
      </Animated.Text>
      <Animated.Text entering={enterDown(160)} style={styles.sectionHint}>
        Top movers you don’t hold yet
      </Animated.Text>
      <ElevatedCard delay={160} padded={false} style={styles.listCard}>
        {popular.map((p) => (
          <PlayerRow key={p.id} player={p} onPress={() => router.push(`/player/${p.id}`)} />
        ))}
      </ElevatedCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  summaryCard: { marginTop: spacing.md, marginBottom: spacing.md },
  kicker: { color: colors.orange, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  total: { color: colors.text, fontSize: 34, fontWeight: "800", marginTop: 6 },
  totalLabel: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  rowStats: { flexDirection: "row", gap: 10, marginTop: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  stat: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 4 },
  section: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 4,
  },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  listCard: { marginBottom: 4 },
  empty: { padding: spacing.lg, alignItems: "flex-start" },
  emptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  emptyBody: { color: colors.textMuted, marginTop: 6, lineHeight: 20 },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.orange,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ctaText: { color: colors.bg, fontWeight: "800" },
  error: { color: colors.red, marginBottom: spacing.sm },
});
