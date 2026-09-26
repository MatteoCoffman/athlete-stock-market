import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { ElevatedCard } from "../../components/ElevatedCard";
import { PressScale } from "../../components/PressScale";
import { enterDown } from "../../constants/motion";
import { colors, money, radii, spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";

export default function AccountScreen() {
  const { user, signOut } = useAuth();

  async function onLogout() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <View style={styles.container}>
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

      <PressScale style={styles.logout} onPress={onLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  kicker: { color: colors.orange, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  email: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8 },
  cashCard: { marginTop: spacing.lg },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  cash: { color: colors.orange, fontSize: 32, fontWeight: "800", marginTop: 6 },
  hint: { color: colors.textMuted, marginTop: 8, fontSize: 13 },
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
