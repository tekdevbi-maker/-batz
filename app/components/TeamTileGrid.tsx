import { Pressable, Text, View, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { CoachedTeam } from "../lib/teamsRepository";
import { colors } from "../lib/theme";

// Shared by Home's Teams sections and the Previous Teams page so both stay
// visually identical without duplicating the tile markup. pendingCounts is
// only passed for "Teams I Coach" -- a badge showing how many pending
// player-claim requests are waiting on that team's Team Members screen.
export default function TeamTileGrid({
  teams,
  pendingCounts,
}: {
  teams: CoachedTeam[];
  pendingCounts?: Record<string, number>;
}) {
  const router = useRouter();
  return (
    <View style={styles.tileGrid}>
      {teams.map((team) => {
        const pending = pendingCounts?.[team.id] ?? 0;
        return (
          <Pressable key={team.id} style={styles.teamTile} onPress={() => router.push(`/team/${team.id}`)}>
            {team.logoUrl && <Image source={{ uri: team.logoUrl }} style={styles.teamLogo} resizeMode="contain" />}
            <Text style={styles.teamName} numberOfLines={2}>
              {team.name}
            </Text>
            {team.divisionName ? <Text style={styles.teamMeta}>{team.divisionName}</Text> : null}
            <Text style={styles.teamMeta}>
              {team.season} {team.year}
            </Text>
            {pending > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pending}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  teamTile: {
    width: "48%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    marginBottom: 12,
    position: "relative",
  },
  teamLogo: { width: "55%", aspectRatio: 1, marginBottom: 6 },
  teamName: { fontSize: 16, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "center" },
  teamMeta: { fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, textAlign: "center", marginTop: 0 },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "white", fontSize: 12, fontFamily: "Montserrat_700Bold" },
});
