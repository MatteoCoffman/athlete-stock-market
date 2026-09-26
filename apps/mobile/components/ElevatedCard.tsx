import type { ReactNode } from "react";
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from "react-native";
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

/**
 * Clean elevated panel — one face, border, shadow. No inset rim (avoids edge overlap).
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
        padded && styles.padded,
        style,
      ]}
      {...rest}
    >
      <View style={styles.highlightTop} pointerEvents="none" />
      {children}
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
    backgroundColor: colors.surface,
    borderColor: "rgba(255,122,26,0.28)",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 18px 44px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,122,26,0.1)",
        } as object)
      : null),
  },
  highlightTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    zIndex: 2,
  },
  padded: {
    padding: 16,
  },
});
