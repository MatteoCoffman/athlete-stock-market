import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { ElevatedCard } from "../../components/ElevatedCard";
import { PlayerRow } from "../../components/PlayerRow";
import { enterDown } from "../../constants/motion";
import { colors, elevation, radii, sortMovers, spacing } from "../../constants/theme";
import { api, Player } from "../../lib/api";

export default function SearchScreen() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.players();
      setPlayers(sortMovers(data.players));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 5000);
      return () => clearInterval(id);
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
    );
  }, [players, query]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.Text entering={enterDown(20)} style={styles.kicker}>
        SEARCH
      </Animated.Text>
      <Animated.Text entering={enterDown(50)} style={styles.title}>
        Find players
      </Animated.Text>
      <ElevatedCard delay={70} padded={false} style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Name, team, or position"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          selectionColor={colors.orange}
        />
      </ElevatedCard>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.count}>
        {query.trim() ? `${filtered.length} results` : "Sorted by movers"}
      </Text>

      {/* Plain flex shell (not ElevatedCard) so FlatList gets a real height on web */}
      <View style={styles.listCard}>
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <PlayerRow player={item} onPress={() => router.push(`/player/${item.id}`)} />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No players match “{query.trim()}”.</Text>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  kicker: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginTop: 4, marginBottom: spacing.md },
  searchWrap: { marginBottom: spacing.sm },
  input: {
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
  },
  count: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, fontWeight: "600" },
  listCard: {
    flex: 1,
    minHeight: 0, // critical for web flex scroll
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
    ...elevation.card,
  },
  list: {
    flex: 1,
  },
  empty: { color: colors.textMuted, padding: spacing.lg },
  error: { color: colors.red, marginBottom: spacing.sm },
});
