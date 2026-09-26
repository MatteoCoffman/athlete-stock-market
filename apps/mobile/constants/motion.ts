import { Platform } from "react-native";
import { Easing, FadeIn, withTiming } from "react-native-reanimated";

/**
 * Opacity-only entrance — no translateY, so layout never jumps (esp. on web).
 * Same curve on iOS / Android / web.
 */
const ENTER_MS = Platform.OS === "web" ? 180 : 240;
const enterEasing = Easing.out(Easing.cubic);

export function enterDown(delay = 0) {
  // Keep web staggers tiny so the page doesn’t cascade-blink.
  const d = Platform.OS === "web" ? Math.min(delay, 30) : delay;
  return FadeIn.duration(ENTER_MS).easing(enterEasing).delay(d);
}

/** Press feedback — quick timing, no overshoot. */
export const PRESS_IN = 0.97;
export const PRESS_OUT = 1;
export const PRESS_IN_MS = 90;
export const PRESS_OUT_MS = 140;

export function pressScaleIn(to = PRESS_IN) {
  "worklet";
  return withTiming(to, { duration: PRESS_IN_MS, easing: Easing.out(Easing.cubic) });
}

export function pressScaleOut(to = PRESS_OUT) {
  "worklet";
  return withTiming(to, { duration: PRESS_OUT_MS, easing: Easing.out(Easing.cubic) });
}
