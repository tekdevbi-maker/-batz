import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import {
  listPendingClaimRequestCountsForCoach,
  listNewlyAssignedPlayers,
  acknowledgeNewPlayers,
  listMyPendingTransferOffers,
  attestPlayerParent,
  type NewlyAssignedPlayer,
  type PendingTransferOffer,
} from "../lib/claimRepository";
import { listMyCoachedTeams, type CoachedTeam } from "../lib/teamsRepository";
import { colors } from "../lib/theme";
import VerificationNoticeModal from "../components/VerificationNoticeModal";

export default function NotificationsScreen() {
  const { session } = useRequireAuth();
  const router = useRouter();

  const [newlyAssigned, setNewlyAssigned] = useState<NewlyAssignedPlayer[]>([]);
  const [transferOffers, setTransferOffers] = useState<PendingTransferOffer[]>([]);
  const [coachedTeams, setCoachedTeams] = useState<CoachedTeam[]>([]);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [newlyAssignedOpen, setNewlyAssignedOpen] = useState(false);
  const [agreeing, setAgreeing] = useState(false);
  const [agreeError, setAgreeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      listNewlyAssignedPlayers(supabase).then(setNewlyAssigned).catch(() => {}),
      listMyPendingTransferOffers(supabase).then(setTransferOffers).catch(() => {}),
      listMyCoachedTeams(supabase, session.user.id).then(setCoachedTeams).catch(() => {}),
      listPendingClaimRequestCountsForCoach(supabase).then(setPendingCounts).catch(() => {}),
    ]);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Agree stamps parent_attested_at (the profile timestamp) on every newly
  // assigned player via attest_player_parent, which is also what makes
  // them eligible to show up in Home's "My Players" -- see the
  // parent_attested_at filter in listMyPlayers. Only after every player
  // successfully attests do we acknowledge the notification, close, and
  // hand off to the one-time onboarding wizard (player-onboarding.tsx).
  async function handleAgreeNewlyAssigned() {
    setAgreeing(true);
    setAgreeError(null);
    try {
      const playerIds = newlyAssigned.map((p) => p.playerId);
      for (const player of newlyAssigned) {
        await attestPlayerParent(supabase, player.playerId, player.displayName);
      }
      await acknowledgeNewPlayers(supabase);
      setNewlyAssignedOpen(false);
      setNewlyAssigned([]);
      router.push({ pathname: "/player-onboarding", params: { playerIds: playerIds.join(",") } });
    } catch (err) {
      setAgreeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgreeing(false);
    }
  }

  const teamsWithPendingClaims = coachedTeams.filter((t) => (pendingCounts[t.id] ?? 0) > 0);
  const hasNothing =
    newlyAssigned.length === 0 && transferOffers.length === 0 && teamsWithPendingClaims.length === 0;

  if (!session) return null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      {hasNothing && <Text style={styles.hint}>You're all caught up.</Text>}

      {newlyAssigned.map((player) => {
        const playerName = [player.playerFirstName, player.playerLastName].filter(Boolean).join(" ").trim() || player.displayName;
        return (
          <Pressable key={player.playerId} style={styles.card} onPress={() => setNewlyAssignedOpen(true)}>
            <Text style={styles.cardText}>
              {player.teamName
                ? `${player.teamName} coaching staff has approved your request to unlock ${playerName}.`
                : `Your request to unlock ${playerName} has been approved.`}
            </Text>
            <Text style={styles.cardAction}>Review</Text>
          </Pressable>
        );
      })}

      <VerificationNoticeModal
        visible={newlyAssignedOpen}
        playerNames={newlyAssigned
          .map((p) => [p.playerFirstName, p.playerLastName].filter(Boolean).join(" ").trim() || p.displayName)
          .join(", ")}
        busy={agreeing}
        error={agreeError}
        onBack={() => setNewlyAssignedOpen(false)}
        onAgree={handleAgreeNewlyAssigned}
      />

      {transferOffers.map((offer) => (
        <Pressable key={offer.requestId} style={styles.card} onPress={() => router.push(`/player/${offer.playerId}`)}>
          <Text style={styles.cardText}>
            {offer.teamName} coaching staff is offering you {offer.playerName} to unlock.
          </Text>
          <Text style={styles.cardAction}>Review</Text>
        </Pressable>
      ))}

      {teamsWithPendingClaims.map((team) => (
        <Pressable key={team.id} style={styles.card} onPress={() => router.push(`/team/${team.id}/members`)}>
          <Text style={styles.cardText}>
            {team.name} has {pendingCounts[team.id]} pending claim request{pendingCounts[team.id] === 1 ? "" : "s"}
            .
          </Text>
          <Text style={styles.cardAction}>Review</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12 },
  hint: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular" },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  cardText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular", fontSize: 14, lineHeight: 20 },
  cardAction: { color: colors.accent, fontFamily: "Montserrat_600SemiBold", fontSize: 13 },
});
