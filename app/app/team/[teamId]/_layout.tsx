import { Stack } from "expo-router";
import { colors } from "../../../lib/theme";
import SlimHeader from "../../../components/SlimHeader";

// Home/Games/Roster/Team Leaderboards/League Leaderboards are plain Stack
// screens, each rendering a shared TeamTabBar (components/TeamTabBar.tsx)
// at the bottom via router.replace() -- NOT expo-router's <Tabs>
// primitive, which has a real, reproducible bug when nested under this
// app's dynamic team/[teamId] segment on web (pressing a tab updates the
// URL but the screen never visually updates; a full reload at the same
// URL renders correctly, so the routes themselves are fine). All five
// share this same Stack, which is also what gives the whole team-scoped
// section its single back-to-app-Home arrow -- a Box Score pushes on top
// of it and gets its own header whose back arrow only goes back one
// level, never straight to the app Home.
//
// AdBanner itself now renders once at the root layout (app/_layout.tsx)
// so it covers every screen app-wide, not just this team-scoped section.
export default function TeamLayout() {
  return (
    <Stack
      screenOptions={{
        header: (props) => <SlimHeader {...props} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "" }} />
      <Stack.Screen name="roster" options={{ title: "" }} />
      <Stack.Screen name="leaderboard" options={{ title: "Team Leaderboard" }} />
      <Stack.Screen name="league-leaderboard" options={{ title: "League Leaderboard" }} />
      <Stack.Screen name="games/index" options={{ title: "" }} />
      <Stack.Screen name="games/[gameId]" options={{ title: "Box Score" }} />
      <Stack.Screen name="claim-player" options={{ title: "Claim a Player" }} />
      <Stack.Screen name="settings" options={{ title: "Team Settings" }} />
      <Stack.Screen name="members" options={{ title: "" }} />
    </Stack>
  );
}
