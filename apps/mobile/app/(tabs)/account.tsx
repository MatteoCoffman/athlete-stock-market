import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { ElevatedCard } from "../../components/ElevatedCard";
import { PERFORMANCE_RANGES, PriceChart } from "../../components/PriceChart";
import { PressScale } from "../../components/PressScale";
import { enterDown } from "../../constants/motion";
import {
  changeBorder,
  changeColor,
  changeSoft,
  colors,
  money,
  radii,
  spacing,
} from "../../constants/theme";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function AccountScreen() {
  const { user, signOut, refresh } = useAuth();
  const [totalValue, setTotalValue] = useState(0);
  const [dayChangePct, setDayChangePct] = useState(0);
  const [equityHistory, setEquityHistory] = useState<{ t: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartScrubbing, setChartScrubbing] = useState(false);

  const load = useCallback(async () => {
    try {
      const folio = await api.portfolio();
      setTotalValue(folio.totalValue);
      setDayChangePct(folio.dayChangePct ?? 0);
      setEquityHistory(folio.equityHistory ?? []);
      await refresh();
    } catch {
      /* keep last good values */
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

  async function onLogout() {
    await signOut();
    router.replace("/(auth)/login");
  }

  const pct = dayChangePct;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={!chartScrubbing}
      showsVerticalScrollIndicator={false}
    >
      <Animated.Text entering={enterDown(20)} style={styles.kicker}>
        ACCOUNT
      </Animated.Text>
      <Animated.Text entering={enterDown(50)} style={styles.email}>
        {user?.email}
      </Animated.Text>

      <ElevatedCard float delay={80} style={styles.cashCard}>
        <Text style={styles.label}>Available cash</Text>
        <Text style={styles.cash}>{money(user?.cashBalance ?? 0)}</Text>
        <Text style={styles.hint}>Play-money credits for this beta.</Text>
      </ElevatedCard>

      <ElevatedCard float delay={110} style={styles.perfCard}>
        <View style={styles.perfHeader}>
          <View>
            <Text style={styles.label}>Portfolio performance</Text>
            <Text style={styles.perfValue}>{money(totalValue)}</Text>
          </View>
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
            <Text style={[styles.chipSub, { color: changeColor(pct) }]}>day</Text>
          </View>
        </View>
        {loading && equityHistory.length < 2 ? (
          <ActivityIndicator color={colors.orange} style={{ marginTop: spacing.md }} />
        ) : (
          <View style={styles.chartWrap}>
            <PriceChart
              data={equityHistory}
              height={220}
              changePct={dayChangePct}
              ranges={PERFORMANCE_RANGES}
              defaultRange="24h"
              emptyLabel="Performance builds as your portfolio value changes"
              onScrubChange={setChartScrubbing}
            />
          </View>
        )}
      </ElevatedCard>

      <PressScale style={styles.logout} onPress={onLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </PressScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  kicker: { color: colors.orange, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  email: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8 },
  cashCard: { marginTop: spacing.lg },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  cash: { color: colors.orange, fontSize: 32, fontWeight: "800", marginTop: 6 },
  hint: { color: colors.textMuted, marginTop: 8, fontSize: 13 },
  perfCard: { marginTop: spacing.md },
  perfHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: spacing.sm,
  },
  perfValue: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 4 },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  chipSub: { fontSize: 10, fontWeight: "700", marginTop: 1, opacity: 0.85 },
  chartWrap: { marginTop: spacing.sm },
  logout: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  logoutText: { color: colors.red, fontWeight: "700" },
});
