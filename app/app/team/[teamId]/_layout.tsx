import { Stack } from "expo-router";
import { colors } from "../../../lib/theme";

// Home/Roster/Team Leaderboards/League Leaderboards are plain Stack
// screens, each rendering a shared TeamTabBar (components/TeamTabBar.tsx)
// at the bottom via router.replace() -- NOT expo-router's <Tabs>
// primitive, which has a real, reproducible bug when nested under this
// app's dynamic team/[teamId] segment on web (pressing a tab updates the
// URL but the screen never visually updates; a full reload at the same
// URL renders correctly, so the routes themselves are fine). All four
// share this same Stack, which is also what gives the whole team-scoped
// section its single back-to-app-Home arrow -- Game Log and a Box Score
// push on top of it and get their own header whose back arrow only goes
// back one level, never straight to the app Home.
//
// AdBanner itself now renders once at the root layout (app/_layout.tsx)
// so it covers every screen app-wide, not just this team-scoped section.
export default function TeamLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Team" }} />
      <Stack.Screen name="roster" options={{ title: "Roster" }} />
      <Stack.Screen name="leaderboard" options={{ title: "Team Leaderboard" }} />
      <Stack.Screen name="league-leaderboard" options={{ title: "League Leaderboard" }} />
      <Stack.Screen name="games/index" options={{ title: "Game Log" }} />
      <Stack.Screen name="games/[gameId]" options={{ title: "Box Score" }} />
      <Stack.Screen name="claim-player" options={{ title: "Claim a Player" }} />
      <Stack.Screen name="settings" options={{ title: "Team Settings" }} />
      <Stack.Screen name="members" options={{ title: "Team Members" }} />
    </Stack>
  );
}
