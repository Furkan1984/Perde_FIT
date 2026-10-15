import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#09090b" },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="camera" options={{ presentation: "modal" }} />
        <Stack.Screen name="measure" />
        <Stack.Screen name="curtain-select" />
        <Stack.Screen name="preview" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="order/[id]" />
      </Stack>
    </GestureHandlerRootView>
  );
}
