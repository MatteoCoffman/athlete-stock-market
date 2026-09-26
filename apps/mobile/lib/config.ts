import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Resolve the machine running Metro/Expo so devices on the same Wi‑Fi
 * can reach the local API (phones cannot use localhost).
 */
function apiHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as { experienceUrl?: string }).experienceUrl?.replace(/^[a-z]+:\/\//, "") ||
    "";
  // hostUri looks like "192.168.1.178:8081"
  const fromMetro = String(hostUri).split(":")[0];
  if (fromMetro && fromMetro !== "localhost" && fromMetro !== "127.0.0.1") {
    return fromMetro;
  }
  // Android emulator → host loopback
  if (Platform.OS === "android") return "10.0.2.2";
  // iOS Simulator / web on this machine
  return "localhost";
}

/** Prefer EXPO_PUBLIC_API_URL when set; otherwise same host as Metro on :4000. */
export const API_URL =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "")) ||
  `http://${apiHost()}:4000`;
