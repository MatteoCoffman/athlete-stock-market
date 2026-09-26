import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { pressScaleIn, pressScaleOut } from "../constants/motion";
import {
  changeBorder,
  changeColor,
  changeSoft,
  colors,
  list,
  money,
  radii,
} from "../constants/theme";
import { Player } from "../lib/api";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  player: Player;
  onPress: () => void;
  detail?: string;
  trailingValue?: string;
};

export function PlayerRow({ player, onPress, detail, trailingValue }: Props) {
  const pct = player.changePct;
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.row, animStyle]}
      onPress={onPress}
      onPressIn={() => {
        scale.value = pressScaleIn(0.985);
      }}
      onPressOut={() => {
        scale.value = pressScaleOut();
      }}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{player.position}</Text>
      </View>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {player.team}
          {detail ? ` · ${detail}` : ""}
        </Text>
      </View>
      <View style={styles.quote}>
        <Text style={styles.price}>{trailingValue ?? money(player.price)}</Text>
        <View
          style={[
            styles.chip,
            { backgroundColor: changeSoft(pct), borderColor: changeBorder(pct) },
          ]}
        >
          <Text style={[styles.chipText, { color: changeColor(pct) }]}>
            {pct > 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: list.rowPadV,
    paddingHorizontal: list.rowPadH,
    gap: 10,
  },
  badge: {
    backgroundColor: colors.orangeSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 5,
    minWidth: list.badgeMinW,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,122,26,0.22)",
  },
  badgeText: { color: colors.orange, fontWeight: "800", fontSize: 10 },
  main: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: list.nameSize, fontWeight: "700" },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: list.metaSize },
  quote: { alignItems: "flex-end" },
  price: {
    color: colors.text,
    fontWeight: "800",
    fontSize: list.priceSize,
    fontVariant: ["tabular-nums"],
  },
  chip: {
    marginTop: 3,
    borderRadius: radii.pill,
    paddingHorizontal: list.chipPadH,
    paddingVertical: list.chipPadV,
    borderWidth: 1,
  },
  chipText: { fontSize: list.chipFont, fontWeight: "800" },
});
