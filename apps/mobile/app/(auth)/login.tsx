import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { ElevatedCard } from "../../components/ElevatedCard";
import { PressScale } from "../../components/PressScale";
import { enterDown } from "../../constants/motion";
import { colors, radii, spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)/portfolio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <Animated.Text entering={enterDown(40)} style={styles.brand}>
        JOCK EXCHANGE
      </Animated.Text>
      <Animated.Text entering={enterDown(70)} style={styles.sub}>
        Trade NFL stars with virtual credits
      </Animated.Text>

      <ElevatedCard float delay={110}>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.textDim}
          value={email}
          onChangeText={setEmail}
          selectionColor={colors.orange}
        />
        <View style={styles.divider} />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.textDim}
          value={password}
          onChangeText={setPassword}
          selectionColor={colors.orange}
        />
      </ElevatedCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PressScale style={styles.button} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buttonText}>Sign in</Text>}
      </PressScale>

      <Animated.View entering={enterDown(160)}>
        <Link href="/(auth)/signup" style={styles.link}>
          New here? Create an account
        </Link>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.orangeSoft,
  },
  brand: { color: colors.orange, fontSize: 30, fontWeight: "800", letterSpacing: 1.2 },
  sub: { color: colors.textMuted, marginBottom: spacing.lg, marginTop: spacing.sm, fontSize: 16 },
  input: {
    color: colors.text,
    padding: spacing.md,
    fontSize: 16,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  button: {
    backgroundColor: colors.orange,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
    shadowColor: "#4A2208",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  buttonText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  link: { color: colors.orange, marginTop: spacing.lg, textAlign: "center", fontWeight: "600" },
  error: { color: colors.red, marginTop: spacing.md, fontWeight: "600" },
});
