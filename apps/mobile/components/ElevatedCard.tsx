import type { ReactNode } from "react";
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";
import { enterDown } from "../constants/motion";
import { colors, elevation, radii } from "../constants/theme";

type Props = ViewProps & {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  delay?: number;
  /** Stronger shadow + orange-tinted border (auth / trade / summary) */
  float?: boolean;
  padded?: boolean;
};

/** Soft top light → surface → slightly deeper base (clipped by overflow:hidden). */
const FILL = ["#1A2C4A", colors.surface, "#0E1A2E"] as const;
const FILL_FLOAT = ["#1E334F", colors.surface, "#0E1A2E"] as const;

/**
 * Clean elevated panel — one face, border, shadow, soft vertical fill for depth.
 */
export function ElevatedCard({
  children,
  style,
  delay = 0,
  float = false,
  padded = true,
  ...rest
}: Props) {
  return (
    <Animated.View
      entering={enterDown(delay)}
      style={[
        styles.card,
        float ? styles.cardFloat : null,
        float ? elevation.float : elevation.card,
        style,
      ]}
      {...rest}
    >
      <LinearGradient
        colors={float ? [...FILL_FLOAT] : [...FILL]}
        locations={[0, 0.42, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={padded ? styles.padded : undefined}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        } as object)
      : null),
  },
  cardFloat: {
    borderColor: "rgba(255,122,26,0.28)",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 18px 44px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,122,26,0.1)",
        } as object)
      : null),
  },
  padded: {
    padding: 16,
  },
});
