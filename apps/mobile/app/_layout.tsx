import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { AuthProvider } from "../lib/auth-context";
import { colors } from "../constants/theme";
import { applyWebChrome } from "../lib/web-chrome";

export default function RootLayout() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
    applyWebChrome();
  }, []);

  return (
    <AuthProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "800", color: colors.text },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: Platform.OS === "web" ? "none" : "slide_from_right",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ title: "Sign in" }} />
          <Stack.Screen name="(auth)/signup" options={{ title: "Create account" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="player/[id]"
            options={{
              title: "Player",
              contentStyle: { backgroundColor: colors.bg },
            }}
          />
        </Stack>
      </View>
    </AuthProvider>
  );
}
