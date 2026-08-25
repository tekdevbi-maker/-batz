import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Image, RefreshControl, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { listMyCoachedTeams, listMyMemberTeams, type CoachedTeam } from "../lib/teamsRepository";
import { listMyPlayers, type MyPlayer } from "../lib/playerRepository";
import {
  listPendingClaimRequestCountsForCoach,
  listNewlyAssignedPlayers,
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
  const [userMenuVisible, setUserMenuVisible] = useState(false);

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
  const hasNotifications =
    newlyAssigned.length > 0 || transferOffers.length > 0 || Object.values(pendingCounts).some((c) => c > 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerSide} />
        <Image source={require("../assets/wordmark-transparent.png")} style={styles.logo} resizeMode="contain" />
        <Pressable hitSlop={12} style={[styles.menuButton, styles.headerSide]} onPress={() => setUserMenuVisible(true)}>
          <View>
            <Ionicons name="menu" size={24} color={colors.textPrimary} />
            {hasNotifications && <View style={styles.menuIconDot} />}
          </View>
        </Pressable>
      </View>
      {firstName && <Text style={styles.welcome}>Welcome {firstName}!</Text>}

      {isAdmin && (
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/admin")}>
          <Text style={styles.buttonText}>League/Division Admin</Text>
        </Pressable>
      )}

      {newlyAssigned.map((player) => {
        const playerName = [player.playerFirstName, player.playerLastName].filter(Boolean).join(" ").trim() || player.displayName;
        return (
          <Pressable
            key={player.playerId}
            style={styles.newPlayerBanner}
            onPress={() => router.push("/notifications")}
          >
            <Text style={styles.newPlayerBannerText}>
              {player.teamName
                ? `${player.teamName} coaching staff has approved your request to unlock ${playerName}.`
                : `Your request to unlock ${playerName} has been approved.`}
            </Text>
            <View style={styles.newPlayerBannerButton}>
              <Text style={styles.newPlayerBannerButtonText}>Review</Text>
            </View>
          </Pressable>
        );
      })}

      {transferOffers.map((offer) => (
        <Pressable
          key={offer.requestId}
          style={styles.newPlayerBanner}
          onPress={() => router.push(`/player/${offer.playerId}`)}
        >
          <Text style={styles.newPlayerBannerText}>
            {offer.teamName} coaching staff is offering you {offer.playerName} to unlock.
          </Text>
          <View style={styles.newPlayerBannerButton}>
            <Text style={styles.newPlayerBannerButtonText}>Review</Text>
          </View>
        </Pressable>
      ))}

      {coachedTeams.length > 0 && (
        <>
          <Text style={styles.label}>My Teams</Text>
          <TeamTileGrid teams={coachedTeams} pendingCounts={pendingCounts} />
        </>
      )}

      <Text style={styles.label}>Followed Teams</Text>
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
            {myPlayers.map((p) => (
              <Pressable key={p.playerId} style={styles.playerPhotoTile} onPress={() => router.push(`/player/${p.playerId}`)}>
                <PlayerCard
                  firstName={p.displayMode === "real_name" ? (p.firstName ?? "") : ""}
                  lastName={p.displayMode === "real_name" ? (p.lastName ?? "") : p.displayName}
                  photoUrl={p.photoUrl}
                  teamLogoUrl={p.teamLogoUrl}
                />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {myTeamPlayers.length > 0 && (
        <>
          <Text style={styles.label}>My Locked Players</Text>
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

      <Modal visible={userMenuVisible} transparent animationType="fade" onRequestClose={() => setUserMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setUserMenuVisible(false)}>
          <View style={styles.menuCard}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/register-team");
              }}
            >
              <Text style={styles.menuItemText}>Head Coach? Start New Team!</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/join-team");
              }}
            >
              <Text style={styles.menuItemText}>Follow Team</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/previous-teams");
              }}
            >
              <Text style={styles.menuItemText}>Team History</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/user-settings");
              }}
            >
              <Text style={styles.menuItemText}>User Settings</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/merge-players");
              }}
            >
              <Text style={styles.menuItemText}>Merge Players</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItemRow}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/notifications");
              }}
            >
              <Text style={styles.menuItemText}>Notifications</Text>
              {hasNotifications && <View style={styles.menuItemDot} />}
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/privacy-policy");
              }}
            >
              <Text style={styles.menuItemText}>Privacy Policy</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/terms-of-service");
              }}
            >
              <Text style={styles.menuItemText}>Terms of Service</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                router.push("/customer-care");
              }}
            >
              <Text style={styles.menuItemText}>Reach out to Customer Care</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setUserMenuVisible(false);
                signOut();
              }}
            >
              <Text style={styles.menuItemText}>Sign out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12, flexGrow: 1 },
  logo: { width: 240, height: 107, alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  headerSide: { width: 40, alignSelf: "flex-start" },
  menuButton: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingHorizontal: 8, paddingTop: 0, paddingBottom: 4 },
  menuIconDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  menuButtonText: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "flex-end" },
  menuCard: {
    marginTop: 44,
    marginRight: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 260,
    overflow: "hidden",
  },
  menuItem: { paddingVertical: 18, paddingHorizontal: 20 },
  menuItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  menuItemText: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
  menuItemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  menuDivider: { height: 1, backgroundColor: colors.border },
  welcome: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "left" },
  hint: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular", textAlign: "center" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 4, color: colors.textPrimary },
  addTeamLink: { color: colors.accent, fontFamily: "Montserrat_600SemiBold", fontSize: 14, marginTop: -6 },
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
});
