import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  getTeamMembers,
  promoteToAssistantCoach,
  AssistantCoachCapacityError,
  type TeamMember,
} from "../../../lib/teamsRepository";
import { transferPlayerToMember, NotACoachError } from "../../../lib/claimRepository";
import { colors } from "../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  head_coach: "Head Coach",
  assistant_coach: "Assistant Coach",
  parent: "Parent",
  follower: "Follower",
};

export default function TeamMembersScreen() {
  useRequireAuth();
  // transferRosterEntryId, when present, puts this screen in "pick a
  // transfer target" mode -- arrived at from a Player Profile's
  // "Transfer to Parent" action instead of the Team Settings tile.
  const { teamId, transferRosterEntryId } = useLocalSearchParams<{
    teamId: string;
    transferRosterEntryId?: string;
  }>();
  const router = useRouter();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!teamId) return;
    getTeamMembers(supabase, teamId)
      .then((rows) => {
        setMembers(rows);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoaded(true);
      });
  }, [teamId]);

  useFocusEffect(load);

  const assistantCount = members.filter((m) => m.role === "assistant_coach").length;

  async function handlePromote(member: TeamMember) {
    if (!teamId) return;
    setBusyUserId(member.userId);
    setError(null);
    try {
      const [firstName, ...rest] = member.displayName.includes("@") ? [""] : member.displayName.split(" ");
      await promoteToAssistantCoach(supabase, teamId, member.userId, firstName, rest.join(" "));
      load();
    } catch (err) {
      setError(err instanceof AssistantCoachCapacityError ? err.message : errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleTransfer(member: TeamMember) {
    if (!teamId || !transferRosterEntryId) return;
    setBusyUserId(member.userId);
    setError(null);
    try {
      await transferPlayerToMember(supabase, transferRosterEntryId, member.userId);
      router.back();
    } catch (err) {
      setError(err instanceof NotACoachError ? err.message : errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  if (!teamId) return null;

  if (!loaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{transferRosterEntryId ? "Transfer To..." : "Team Members"}</Text>
      <Text style={styles.hint}>
        {transferRosterEntryId
          ? "Pick a member of this team to hand off ownership of this player."
          : `Everyone who has joined via this team's link. Promote up to 3 to Assistant Coach -- ` +
            "encourage the same coaches who help with GameChanger, since they can also import games."}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {members.map((member) => (
        <View key={member.userId} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.email}>{member.displayName}</Text>
            <Text style={styles.emailSecondary}>{member.email}</Text>
            <Text style={styles.roleLabel}>
              {ROLE_LABELS[member.role]}
              {member.claimedPlayerNames ? ` · Parent of ${member.claimedPlayerNames}` : ""}
            </Text>
          </View>
          {transferRosterEntryId ? (
            <Pressable
              style={styles.actionButton}
              disabled={busyUserId === member.userId}
              onPress={() => handleTransfer(member)}
            >
              {busyUserId === member.userId ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.actionButtonText}>Transfer Here</Text>
              )}
            </Pressable>
          ) : (
            (member.role === "parent" || member.role === "follower") &&
            assistantCount < 3 && (
              <Pressable
                style={styles.actionButton}
                disabled={busyUserId === member.userId}
                onPress={() => handlePromote(member)}
              >
                {busyUserId === member.userId ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.actionButtonText}>Promote</Text>
                )}
              </Pressable>
            )
          )}
        </View>
      ))}
      {members.length === 0 && <Text style={styles.hint}>No one has joined this team yet.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
  error: { color: colors.error, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  rowInfo: { flex: 1, gap: 2 },
  email: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  emailSecondary: { color: colors.textSecondary, fontSize: 13 },
  roleLabel: { color: colors.textSecondary, fontSize: 13 },
  actionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonText: { color: colors.textPrimary, fontWeight: "600" },
});
