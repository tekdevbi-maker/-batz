import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";

// A hand-built bottom tab bar, not expo-router's <Tabs> primitive.
// <Tabs> nested under this app's dynamic team/[teamId] segment has a real
// bug on Expo Router web: pressing a tab updates the URL but the screen
// never re-renders to match (confirmed reproducible -- a full page reload
// at the same URL renders correctly, so the route/screen wiring itself is
// fine; it's specifically Tabs' web re-render path that's broken here).
// router.replace() over plain Stack screens sidesteps it entirely, using
// only navigation that's been reliable everywhere else in this app.
export type TeamTab = "home" | "roster" | "leaderboard" | "league-leaderboard";

const TABS: Array<{ key: TeamTab; label: string; path: (teamId: string) => string }> = [
  { key: "home", label: "Home", path: (teamId) => `/team/${teamId}` },
  { key: "roster", label: "Roster", path: (teamId) => `/team/${teamId}/roster` },
  { key: "leaderboard", label: "Team Leaders", path: (teamId) => `/team/${teamId}/leaderboard` },
  { key: "league-leaderboard", label: "League Leaders", path: (teamId) => `/team/${teamId}/league-leaderboard` },
];

export default function TeamTabBar({ teamId, active }: { teamId: string; active: TeamTab }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => (
        <Pressable key={tab.key} style={styles.tab} onPress={() => router.replace(tab.path(teamId))}>
          <Text style={[styles.label, tab.key === active && styles.labelActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 4,
    minHeight: 64,
  },
  label: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
  labelActive: { color: colors.accent, fontWeight: "600" },
});
