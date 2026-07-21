import { Stack } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../../lib/theme";

// Home/Roster/Team Leaderboards/League Leaderboards are plain Stack
// screens, each rendering a shared TeamTabBar (components/TeamTabBar.tsx)
// at the bottom via router.replace() -- NOT expo-router's <Tabs>
// primitive, which has a real, reproducible bug when nested under this
// app's dynamic team/[teamId] segment on web (pressing a tab updates the
// URL but the screen never visually updates; a full reload at the same
// URL renders correctly, so the routes themselves are fine). All four
// share this same Stack, which is also what gives the whole team-scoped
// section its single back-to-app-Home arrow -- Game Log, a Box Score, and
// Customer Care push on top of it and get their own header whose back
// arrow only goes back one level, never straight to the app Home.
//
// AdBanner is a non-functional placeholder reserving the top of every
// team-scoped screen for a future real ad SDK -- no ad network account
// exists yet, so this is deliberately just reserved space, not a real
// integration.
function AdBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.adBanner, { paddingTop: insets.top }]}>
      <Text style={styles.adBannerText}>Ad space reserved</Text>
    </View>
  );
}

export default function TeamLayout() {
  return (
    <View style={styles.root}>
      <AdBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { color: colors.textPrimary },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Team" }} />
        <Stack.Screen name="roster" options={{ title: "Roster" }} />
        <Stack.Screen name="leaderboard" options={{ title: "Team Leaderboard" }} />
        <Stack.Screen name="league-leaderboard" options={{ title: "League Leaderboard" }} />
        <Stack.Screen name="games/index" options={{ title: "Game Log" }} />
        <Stack.Screen name="games/[gameId]" options={{ title: "Box Score" }} />
        <Stack.Screen name="customer-care" options={{ title: "Customer Care" }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  adBanner: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
  adBannerText: { color: colors.textMuted, fontSize: 11 },
});
