import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image, RefreshControl } from "react-native";
import { Link, useRouter, useFocusEffect } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyCoachedTeams, listMyMemberTeams, type CoachedTeam } from "../lib/teamsRepository";
import { listMyPlayers, type MyPlayer } from "../lib/playerRepository";
import {
  listPendingClaimRequestCountsForCoach,
  listNewlyAssignedPlayers,
  acknowledgeNewPlayers,
  listMyPendingTransferOffers,
  type NewlyAssignedPlayer,
  type PendingTransferOffer,
} from "../lib/claimRepository";
import TeamTileGrid from "../components/TeamTileGrid";
import PlayerCard from "../components/PlayerCard";
import { colors } from "../lib/theme";

export default function Home() {
  const router = useRouter();
  const { session, isAdmin, signOut } = useRequireAuth();
  const [coachedTeams, setCoachedTeams] = useState<CoachedTeam[]>([]);
  const [memberTeams, setMemberTeams] = useState<CoachedTeam[]>([]);
  const [myPlayers, setMyPlayers] = useState<MyPlayer[]>([]);
  const [myTeamPlayers, setMyTeamPlayers] = useState<MyPlayer[]>([]);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [newlyAssigned, setNewlyAssigned] = useState<NewlyAssignedPlayer[]>([]);
  const [transferOffers, setTransferOffers] = useState<PendingTransferOffer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      listMyCoachedTeams(supabase, session.user.id).then(setCoachedTeams).catch(() => {}),
      listMyMemberTeams(supabase, session.user.id).then(setMemberTeams).catch(() => {}),
      listPendingClaimRequestCountsForCoach(supabase).then(setPendingCounts).catch(() => {}),
      listNewlyAssignedPlayers(supabase).then(setNewlyAssigned).catch(() => {}),
      listMyPendingTransferOffers(supabase).then(setTransferOffers).catch(() => {}),
      listMyPlayers(supabase, session.user.id)
        .then(({ myPlayers, myTeamPlayers }) => {
          setMyPlayers(myPlayers);
          setMyTeamPlayers(myTeamPlayers);
        })
        .catch(() => {}),
    ]);
  }, [session]);

  async function handleDismissNewlyAssigned() {
    setNewlyAssigned([]);
    try {
      await acknowledgeNewPlayers(supabase);
    } catch {
      // Non-critical -- worst case the banner reappears next load.
    }
  }

  // useFocusEffect, not a plain useEffect keyed on session -- session
  // doesn't change when navigating back to an already-mounted Home screen
  // (e.g. after a coach claims a player and returns here), so a plain
  // effect would leave these lists stale until a full app reload.
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

  if (!session) return null;

  const firstName: string | undefined = session.user.user_metadata?.first_name;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <Image source={require("../assets/wordmark-transparent.png")} style={styles.logo} resizeMode="contain" />
      {firstName && <Text style={styles.welcome}>Welcome {firstName}!</Text>}

      {isAdmin && (
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/admin")}>
          <Text style={styles.buttonText}>League/Division Admin</Text>
        </Pressable>
      )}

      {newlyAssigned.length > 0 && (
        <View style={styles.newPlayerBanner}>
          <Text style={styles.newPlayerBannerText}>
            {newlyAssigned.length === 1
              ? `🎉 ${newlyAssigned[0].displayName} has been added to your account!`
              : `🎉 ${newlyAssigned.length} players have been added to your account: ${newlyAssigned
                  .map((p) => p.displayName)
                  .join(", ")}`}
          </Text>
          <Pressable style={styles.newPlayerBannerButton} onPress={handleDismissNewlyAssigned}>
            <Text style={styles.newPlayerBannerButtonText}>Got it</Text>
          </Pressable>
        </View>
      )}

      {transferOffers.map((offer) => (
        <Pressable
          key={offer.requestId}
          style={styles.newPlayerBanner}
          onPress={() => router.push(`/player/${offer.playerId}`)}
        >
          <Text style={styles.newPlayerBannerText}>
            {offer.teamName}'s coach is offering you {offer.displayName} to claim as the Parent/Legal Guardian.
          </Text>
          <View style={styles.newPlayerBannerButton}>
            <Text style={styles.newPlayerBannerButtonText}>Review</Text>
          </View>
        </Pressable>
      ))}

      {coachedTeams.length > 0 && (
        <>
          <View style={styles.teamsHeaderRow}>
            <Text style={styles.label}>Teams I Coach</Text>
            <Pressable onPress={() => router.push("/register-team")}>
              <Text style={styles.addTeamLink}>Add a Team I Coach</Text>
            </Pressable>
          </View>
          <TeamTileGrid teams={coachedTeams} pendingCounts={pendingCounts} />
        </>
      )}
      {coachedTeams.length === 0 && (
        <View style={styles.teamsHeaderRow}>
          <View />
          <Pressable onPress={() => router.push("/register-team")}>
            <Text style={styles.addTeamLink}>Add a Team I Coach</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.teamsHeaderRow}>
        <Text style={styles.label}>Teams I Follow</Text>
        <Pressable onPress={() => router.push("/join-team")}>
          <Text style={styles.addTeamLink}>Follow Another Team</Text>
        </Pressable>
      </View>
      {memberTeams.length > 0 ? (
        <TeamTileGrid teams={memberTeams} />
      ) : (
        <Text style={styles.hint}>You're not following any teams yet.</Text>
      )}

      <View style={styles.previousTeamsRow}>
        <Pressable onPress={() => router.push("/previous-teams")}>
          <Text style={styles.addTeamLink}>Previous Teams ›</Text>
        </Pressable>
      </View>

      {myPlayers.length > 0 && (
        <>
          <Text style={styles.label}>My Players</Text>
          <View style={styles.tileGrid}>
            {myPlayers.map((p) =>
              p.photoUrl ? (
                <Pressable key={p.playerId} style={styles.playerPhotoTile} onPress={() => router.push(`/player/${p.playerId}`)}>
                  <PlayerCard
                    firstName={p.displayMode === "real_name" ? (p.firstName ?? "") : ""}
                    lastName={p.displayMode === "real_name" ? (p.lastName ?? "") : p.displayName}
                    photoUrl={p.photoUrl}
                  />
                </Pressable>
              ) : (
                <Pressable key={p.playerId} style={styles.playerTile} onPress={() => router.push(`/player/${p.playerId}`)}>
                  <Text style={styles.playerTileName} numberOfLines={2}>
                    {p.displayName}
                  </Text>
                  {p.visibilityScope === "private" && <Text style={styles.playerTilePrivate}>(private)</Text>}
                </Pressable>
              )
            )}
          </View>
        </>
      )}

      {myTeamPlayers.length > 0 && (
        <>
          <Text style={styles.label}>Players I Coach</Text>
          <Text style={styles.hint}>Unclaimed roster spots you're holding for a parent to claim.</Text>
          <View style={styles.tileGrid}>
            {myTeamPlayers.map((p) => (
              <Pressable key={p.playerId} style={styles.playerTile} onPress={() => router.push(`/player/${p.playerId}`)}>
                <Text style={styles.playerTileName} numberOfLines={2}>
                  {p.displayName}
                </Text>
                {p.visibilityScope === "private" && <Text style={styles.playerTilePrivate}>(private)</Text>}
              </Pressable>
            ))}
          </View>
        </>
      )}

      <View style={styles.spacer} />

      <Text style={styles.hint}>Signed in as {session?.user.email}</Text>
      <Pressable style={styles.secondaryButton} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.footerLinks}>
        <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link>
        {"  ·  "}
        <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>
        {"  ·  "}
        <Link href="/customer-care"><Text style={styles.legalLink}>Need Help?</Text></Link>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12, flexGrow: 1 },
  logo: { width: 220, height: 98, alignSelf: "center" },
  welcome: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "left" },
  hint: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", textAlign: "center" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  teamsHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addTeamLink: { color: colors.accent, fontFamily: "Montserrat_600SemiBold", fontSize: 14, marginTop: 12 },
  buttonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  newPlayerBanner: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  newPlayerBannerText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 14, lineHeight: 20 },
  newPlayerBannerButton: {
    backgroundColor: colors.success,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  newPlayerBannerButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 13 },
  previousTeamsRow: { flexDirection: "row", justifyContent: "flex-end" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  playerTile: {
    width: "31.5%",
    aspectRatio: 0.9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    marginBottom: 12,
  },
  playerPhotoTile: { width: "31.5%", borderRadius: 8, overflow: "hidden", marginBottom: 12 },
  playerTileName: { fontSize: 14, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "center" },
  playerTilePrivate: { fontSize: 10, fontFamily: "Montserrat_400Regular", color: colors.textMuted, textAlign: "center", marginTop: 4 },
  spacer: { flex: 1 },
  footerLinks: { textAlign: "center", fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  legalLink: { color: colors.accent, fontFamily: "Montserrat_400Regular" },
});
