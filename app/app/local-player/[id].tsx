import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal } from "react-native";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import {
  getLocalPlayer,
  deleteLocalPlayer,
  computeLocalPlayerCardData,
  type LocalPlayer,
} from "../../lib/localPlayerRepository";
import { useAuth } from "../../lib/AuthContext";
import FlipStatsCard from "../../components/FlipStatsCard";
import PlayerCard from "../../components/PlayerCard";
import PlayerCardStatsBack from "../../components/PlayerCardStatsBack";
import CardDownloadButton from "../../components/CardDownloadButton";
import { colors } from "../../lib/theme";

export default function LocalPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Not useRequireAuth — this screen is reachable signed out (guests use
  // it too), so just read whether there's a session, don't redirect on it.
  const { session } = useAuth();
  const hubRoute = session ? "/" : "/guest-players";
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getLocalPlayer(id).then((p) => {
        setPlayer(p);
        setLoaded(true);
      });
    }, [id])
  );

  async function handleDelete() {
    if (!id) return;
    setDeleteBusy(true);
    await deleteLocalPlayer(id);
    setDeleteBusy(false);
    setDeleteModalOpen(false);
    router.replace(hubRoute);
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Player not found</Text>
      </View>
    );
  }

  const cardData = computeLocalPlayerCardData(player);

  // Built once and reused by both FlipStatsCard (on-screen flip) and
  // CardDownloadButton (its own off-screen capture copies).
  const frontFace = (
    <PlayerCard key="photo" firstName={player.firstName} lastName={player.lastName} photoUrl={player.photoUrl} teamLogoUrl={player.teamLogoUrl} cardSet="freecard" />
  );
  const backFace = (
    <PlayerCardStatsBack
      key="statsback"
      firstName={player.firstName}
      lastName={player.lastName}
      leagueName={player.leagueName}
      divisionName={player.divisionName}
      teamName={player.currentTeamName}
      season={player.currentSeason}
      year={Number(player.currentSeasonYear) || 0}
      heightFeet={player.heightFeet}
      heightInches={player.heightInches}
      weightLbs={player.weightLbs}
      bats={player.bats}
      throws={player.throws}
      seasons={cardData.seasons.map((s, i) => ({
        rosterEntryId: `local-season-${i}`,
        teamId: "",
        teamName: s.teamName,
        divisionName: "",
        leagueName: "",
        season: s.season,
        year: s.year,
        seasonStatus: "",
        uniformNumber: player.uniformNumber ?? 0,
        teamLogoUrl: null,
        counts: s.counts,
        stats: s.stats,
      }))}
      careerCounts={cardData.careerCounts}
      careerStats={cardData.careerStats}
      teamLogoUrl={player.teamLogoUrl}
      uniformNumber={player.uniformNumber}
      locked={false}
      activity={[]}
      cardSet="freecard"
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: `${player.firstName} ${player.lastName}` }} />

      <View style={styles.buttonRow}>
        <Pressable style={styles.tileButton} onPress={() => router.push(`/create-player?editId=${player.id}`)}>
          <Text style={styles.tileButtonText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.tileButton} onPress={() => setDeleteModalOpen(true)}>
          <Text style={styles.tileButtonText}>Delete</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>Tap the card to flip it over</Text>
      <FlipStatsCard flippable faces={[frontFace, backFace]} />

      <CardDownloadButton frontFace={frontFace} backFace={backFace} fileNamePrefix={`${player.firstName} ${player.lastName}`} />

      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={() => setDeleteModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              Delete {player.firstName} {player.lastName}? This only removes it from this device and can't be undone.
            </Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancel} disabled={deleteBusy} onPress={() => setDeleteModalOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalDelete} disabled={deleteBusy} onPress={handleDelete}>
                {deleteBusy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalDeleteText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 6, backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  buttonRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tileButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  tileButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 12, width: "100%", maxWidth: 400 },
  modalText: { color: colors.textPrimary, fontSize: 16, fontFamily: "Montserrat_400Regular" },
  modalButtonRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  modalDelete: { backgroundColor: colors.error, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  modalDeleteText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
});
