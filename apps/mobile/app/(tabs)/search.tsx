import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
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

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Position = (typeof POSITIONS)[number];

export default function SearchScreen() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);

  const fetchPlayers = useCallback(
    async (q: string, selected: Position[]) => {
      const id = ++requestId.current;
      const trimmed = q.trim();
      const pos = selected.length ? selected : undefined;

      setSearching(true);
      try {
        setError(null);
        if (!trimmed) {
          const data = await api.players({ position: pos, limit: 500 });
          if (id !== requestId.current) return;
          setPlayers(sortMovers(data.players));
          setTotal(data.total ?? data.players.length);
        } else {
          const data = await api.players({ q: trimmed, position: pos, limit: 100 });
          if (id !== requestId.current) return;
          setPlayers(data.players);
          setTotal(data.total ?? data.players.length);
        }
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (id === requestId.current) {
          setSearching(false);
          setLoading(false);
        }
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      if (!query.trim()) {
        fetchPlayers("", positions);
        const id = setInterval(() => fetchPlayers("", positions), 5000);
        return () => clearInterval(id);
      }
      return undefined;
    }, [fetchPlayers, query, positions])
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchPlayers(query, positions);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, positions, fetchPlayers]);

  function togglePosition(pos: Position) {
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  function clearPositions() {
    setPositions([]);
    setFilterOpen(false);
  }

  const filterLabel =
    positions.length === 0
      ? "All positions"
      : positions.length === POSITIONS.length
        ? "All positions"
        : positions.join(", ");

  const statusText = searching
    ? "Searching…"
    : query.trim()
      ? `${total} result${total === 1 ? "" : "s"}`
      : positions.length
        ? `Sorted by movers · ${filterLabel}`
        : "Sorted by movers";

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

      <ElevatedCard
        delay={70}
        padded={false}
        style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}
      >
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Name or team"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          selectionColor={colors.orange}
          onFocus={() => {
            setSearchFocused(true);
            setFilterOpen(false);
          }}
          onBlur={() => setSearchFocused(false)}
        />
      </ElevatedCard>

      <View style={styles.filterBlock}>
        <Pressable
          style={[styles.filterTrigger, filterOpen && styles.filterTriggerOpen]}
          onPress={() => setFilterOpen((o) => !o)}
        >
          <Text style={styles.filterTriggerLabel}>Position</Text>
          <Text style={styles.filterTriggerValue} numberOfLines={1}>
            {filterLabel}
          </Text>
          <Text style={styles.filterChevron}>{filterOpen ? "▴" : "▾"}</Text>
        </Pressable>

        {filterOpen ? (
          <View style={styles.filterMenu}>
            {POSITIONS.map((pos) => {
              const checked = positions.includes(pos);
              return (
                <Pressable
                  key={pos}
                  style={styles.filterOption}
                  onPress={() => togglePosition(pos)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={styles.filterOptionText}>{pos}</Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.clearBtn} onPress={clearPositions}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.count}>{statusText}</Text>

      <View style={styles.listCard}>
        <FlatList
          style={styles.list}
          data={players}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => setFilterOpen(false)}
          renderItem={({ item }) => (
            <PlayerRow player={item} onPress={() => router.push(`/player/${item.id}`)} />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim() || positions.length
                ? "No players match your filters."
                : "No players loaded."}
            </Text>
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
  searchWrapFocused: { borderColor: colors.orange },
  input: {
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    ...(Platform.OS === "web"
      ? ({ outlineWidth: 0, outlineStyle: "none" } as object)
      : null),
  },
  filterBlock: {
    zIndex: 20,
    marginBottom: spacing.sm,
    ...(Platform.OS === "web" ? ({ position: "relative" } as object) : null),
  },
  filterTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  filterTriggerOpen: {
    borderColor: colors.orange,
  },
  filterTriggerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  filterTriggerValue: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  filterChevron: {
    color: colors.orange,
    fontSize: 14,
    fontWeight: "800",
  },
  filterMenu: {
    marginTop: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 6,
    ...elevation.cardSoft,
    ...(Platform.OS === "web"
      ? ({
          position: "absolute",
          left: 0,
          right: 0,
          top: "100%",
          zIndex: 30,
        } as object)
      : null),
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: colors.orange,
    backgroundColor: colors.orangeSoft,
  },
  checkmark: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 14,
  },
  filterOptionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  clearBtn: {
    marginTop: 4,
    marginHorizontal: spacing.md,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.bgElevated,
  },
  clearBtnText: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 13,
  },
  count: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, fontWeight: "600" },
  listCard: {
    flex: 1,
    minHeight: 0,
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
