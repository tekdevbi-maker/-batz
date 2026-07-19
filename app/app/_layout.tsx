import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "@Batz" }} />
      <Stack.Screen name="import-game" options={{ title: "Import a Game" }} />
    </Stack>
  );
}
