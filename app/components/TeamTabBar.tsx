import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
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

const TABS: Array<{
  key: TeamTab;
  label: string;
  path: (teamId: string) => string;
  iconOutline: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
}> = [
  { key: "home", label: "Home", path: (teamId) => `/team/${teamId}`, iconOutline: "home-outline", iconFilled: "home" },
  { key: "roster", label: "Roster", path: (teamId) => `/team/${teamId}/roster`, iconOutline: "people-outline", iconFilled: "people" },
  { key: "leaderboard", label: "Team Leaders", path: (teamId) => `/team/${teamId}/leaderboard`, iconOutline: "trophy-outline", iconFilled: "trophy" },
  { key: "league-leaderboard", label: "League Leaders", path: (teamId) => `/team/${teamId}/league-leaderboard`, iconOutline: "globe-outline", iconFilled: "globe" },
];

export default function TeamTabBar({ teamId, active }: { teamId: string; active: TeamTab }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => router.replace(tab.path(teamId))}>
            <Ionicons
              name={isActive ? tab.iconFilled : tab.iconOutline}
              size={22}
              color={isActive ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
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
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 64,
  },
  label: { fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  labelActive: { color: colors.accent, fontWeight: "600" },
});
