import type { ReactNode } from "react";
import { Pressable, PressableProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { PRESS_IN, pressScaleIn, pressScaleOut } from "../constants/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  children: ReactNode;
};

export function PressScale({ children, style, disabled, ...rest }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.55 : 1,
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, anim]}
      onPressIn={(e) => {
        if (!disabled) scale.value = pressScaleIn(PRESS_IN);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = pressScaleOut();
        rest.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
