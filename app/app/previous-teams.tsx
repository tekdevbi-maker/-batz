import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyPreviousCoachedTeams, listMyPreviousMemberTeams, type CoachedTeam } from "../lib/teamsRepository";
import TeamTileGrid from "../components/TeamTileGrid";
import { colors } from "../lib/theme";

// Same split as Home's Teams sections, just filtered to season_status =
// 'ended' -- its own page since Home only shows the current-season subset.
export default function PreviousTeamsScreen() {
  const { session } = useRequireAuth();
  const [coachedTeams, setCoachedTeams] = useState<CoachedTeam[]>([]);
  const [memberTeams, setMemberTeams] = useState<CoachedTeam[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      listMyPreviousCoachedTeams(supabase, session.user.id).then(setCoachedTeams).catch(() => {});
      listMyPreviousMemberTeams(supabase, session.user.id).then(setMemberTeams).catch(() => {});
    }, [session])
  );

  if (!session) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Previous Teams</Text>

      <Text style={styles.label}>Coached Teams</Text>
      {coachedTeams.length > 0 ? (
        <TeamTileGrid teams={coachedTeams} />
      ) : (
        <Text style={styles.hint}>No previous coached teams.</Text>
      )}

      <Text style={styles.label}>Followed Teams</Text>
      {memberTeams.length > 0 ? (
        <TeamTileGrid teams={memberTeams} />
      ) : (
        <Text style={styles.hint}>No previous followed teams.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 8 },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 4 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular" },
});
