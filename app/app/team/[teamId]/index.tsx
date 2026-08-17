import { useCallback, useEffect, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Modal, Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamJoinContext, countPendingClaimRequests, type TeamJoinContext } from "../../../lib/claimRepository";
import { listTeamCoaches, type TeamCoach } from "../../../lib/coachesRepository";
import { uploadTeamLogo, leaveTeam } from "../../../lib/teamsRepository";
import {
  describeGameImportedParts,
  describeMilestone,
  likePost,
  listTeamActivityFeed,
  unlikePost,
  type ActivityFeedPost,
} from "../../../lib/socialRepository";
import { formatDateDisplay } from "../../../lib/dateFormat";
import { colors } from "../../../lib/theme";
import TeamTabBar from "../../../components/TeamTabBar";
import CopyableLink from "../../../components/CopyableLink";
import CircleCropModal from "../../../components/CircleCropModal";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function TeamHomeScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [coaches, setCoaches] = useState<TeamCoach[]>([]);
  const [isCoach, setIsCoach] = useState(false);
  const [isHeadCoach, setIsHeadCoach] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [leavingTeam, setLeavingTeam] = useState(false);
  const [unfollowResult, setUnfollowResult] = useState<{ unlinkedCount: number } | null>(null);
  const [pendingClaimCount, setPendingClaimCount] = useState(0);
  const [rosterCount, setRosterCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [gamesPlayedCount, setGamesPlayedCount] = useState(0);
  const [teamAB, setTeamAB] = useState(0);
  const [teamHits, setTeamHits] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityFeedPost[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [joinLinkVisible, setJoinLinkVisible] = useState(false);

  const load = useCallback(async () => {
    if (!teamId || !session) return;
    await Promise.all([
      getTeamJoinContext(supabase, teamId).then(setContext).catch((err) => setError(errorMessage(err))),
      listTeamCoaches(supabase, teamId).then(setCoaches).catch(() => {}),
      listTeamActivityFeed(supabase, teamId, session.user.id)
        .then((posts) => {
          setActivity(posts);
          setActivityLoaded(true);
        })
        .catch(() => setActivityLoaded(true)),
      supabase
        .from("roster_entry")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .then(
          ({ count }) => setRosterCount(count ?? 0),
          () => {}
        ),
      supabase
        .from("game")
        .select("id")
        .eq("team_id", teamId)
        .then(async ({ data: gameRows }) => {
          const gameIds = (gameRows ?? []).map((g: { id: string }) => g.id);
          setGamesPlayedCount(gameIds.length);
          if (gameIds.length === 0) {
            setTeamAB(0);
            setTeamHits(0);
            return;
          }
          const { data: statRows } = await supabase
            .from("game_batting_stat")
            .select("ab, h")
            .in("game_id", gameIds);
          const totals = (statRows ?? []).reduce(
            (acc, r) => ({ ab: acc.ab + r.ab, h: acc.h + r.h }),
            { ab: 0, h: 0 }
          );
          setTeamAB(totals.ab);
          setTeamHits(totals.h);
        }),
      supabase
        .rpc("count_team_members", { p_team_id: teamId })
        .then(
          ({ data }) => setMemberCount(data ?? 0),
          () => {}
        ),
      supabase
        .from("coach_assignment")
        .select("id, role")
        .eq("team_id", teamId)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setIsCoach(!!data);
          setIsHeadCoach(data?.role === "primary");
          if (data) {
            return countPendingClaimRequests(supabase, teamId).then(setPendingClaimCount).catch(() => {});
          }
        }),
      supabase
        .from("team_membership")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(
          ({ data }) => setIsMember(!!data),
          () => {}
        ),
    ]);
  }, [teamId, session]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handlePickLogo() {
    if (!teamId || !isHeadCoach) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is needed to choose a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setError(null);
    setCropImageUri(result.assets[0].uri);
  }

  async function handleConfirmCrop(circleUri: string) {
    if (!teamId) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const newUrl = await uploadTeamLogo(supabase, teamId, circleUri, "image/png");
      setContext((c) => (c ? { ...c, teamLogoUrl: newUrl } : c));
      setCropImageUri(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  function confirmUnfollowTeam() {
    Alert.alert(
      "Unfollow this team?",
      "You'll stop seeing it on your Home screen, and any player you have linked on this team will be unlinked. You can rejoin later with the team's join link.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unfollow",
          style: "destructive",
          onPress: async () => {
            if (!teamId || !session) return;
            setLeavingTeam(true);
            setError(null);
            try {
              const unlinkedCount = await leaveTeam(supabase, teamId);
              setUnfollowResult({ unlinkedCount });
            } catch (err) {
              setError(errorMessage(err));
              setLeavingTeam(false);
            }
          },
        },
      ]
    );
  }

  async function toggleLike(post: ActivityFeedPost) {
    if (!session) return;
    try {
      if (post.likedByMe) {
        await unlikePost(supabase, post.id, session.user.id);
      } else {
        await likePost(supabase, post.id, session.user.id);
      }
      setActivity((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
            : p
        )
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!session || !teamId) return null;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerRight: () =>
            isCoach ? (
              <Pressable hitSlop={12} style={styles.menuButton} onPress={() => setMenuVisible(true)}>
                <Text style={styles.menuButtonText}>Coach Menu</Text>
                <View>
                  <Ionicons name="menu" size={24} color={colors.textPrimary} />
                  {pendingClaimCount > 0 && <View style={styles.menuIconDot} />}
                </View>
              </Pressable>
            ) : isMember ? (
              <Pressable hitSlop={12} style={styles.menuButton} onPress={() => setMenuVisible(true)}>
                <Text style={styles.menuButtonText}>Menu</Text>
                <Ionicons name="menu" size={24} color={colors.textPrimary} />
              </Pressable>
            ) : null,
        }}
      />
      <View style={styles.frozenSection}>
        <View style={styles.headerRow}>
          <View style={styles.teamLogoContainer}>
            <Pressable onPress={handlePickLogo} disabled={!isHeadCoach || uploadingLogo}>
              {context?.teamLogoUrl ? (
                <Image source={{ uri: context.teamLogoUrl }} style={styles.teamLogo} resizeMode="contain" />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Text style={styles.teamLogoPlaceholderText}>
                    {isHeadCoach ? "Upload Your Team Logo" : "No Team Logo"}
                  </Text>
                </View>
              )}
              {uploadingLogo && (
                <View style={styles.teamLogoUploadOverlay}>
                  <ActivityIndicator color="white" />
                </View>
              )}
            </Pressable>
            {isCoach && pendingClaimCount > 0 && (
              // Separate from the logo's own Pressable (which opens the
              // logo-upload flow, or is disabled entirely for assistant
              // coaches) -- this badge needs its own tap target that
              // actually leads to what it's counting: the pending claim
              // requests on the Members screen.
              <Pressable style={styles.badge} onPress={() => router.push(`/team/${teamId}/members`)}>
                <Text style={styles.badgeText}>{pendingClaimCount}</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={styles.statsChart}
            disabled={!isCoach}
            onPress={() => router.push(`/team/${teamId}/members`)}
          >
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{rosterCount}</Text>
              <Text style={styles.statLabel}>Players</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{memberCount}</Text>
              <Text style={styles.statLabel}>Fans</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{gamesPlayedCount}</Text>
              <Text style={styles.statLabel}>Games</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{String(teamAB)}</Text>
              <Text style={styles.statLabel}>AB</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{String(teamHits)}</Text>
              <Text style={styles.statLabel}>Hits</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>
                {(teamAB === 0 ? 0 : teamHits / teamAB).toFixed(3).replace(/^0\./, ".")}
              </Text>
              <Text style={styles.statLabel}>Avg</Text>
            </View>
          </Pressable>
        </View>

        {context && (
          <>
            <Text style={styles.title}>{context.teamName}</Text>
            <Text style={styles.hint}>
              {context.leagueName} | {context.divisionName} | {context.season} {context.year}
            </Text>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {(() => {
          const headCoach = coaches.find((c) => c.role === "primary");
          const assistants = coaches.filter((c) => c.role === "assistant");
          return (
            <>
              <Text style={styles.statLine}>
                Head Coach: {headCoach ? `${headCoach.firstName} ${headCoach.lastName}` : ""}
              </Text>
              <Text style={styles.statLine}>
                Assistant Coaches: {assistants.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}
              </Text>
            </>
          );
        })()}

        {isCoach && (
          <Pressable onPress={() => setJoinLinkVisible(true)}>
            <Text style={styles.joinLinkText}>Team Join Link</Text>
          </Pressable>
        )}

        <View style={styles.sectionDivider} />
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        <Text style={styles.label}>Activity Feed</Text>
        {activityLoaded && activity.length === 0 && (
          <Text style={styles.hint}>No milestones yet.</Text>
        )}
        {activity.map((post) => {
          if (post.category === "game_imported") {
            const parts = describeGameImportedParts(post, formatDateDisplay(post.gameDate));
            return (
              <View key={post.id} style={styles.postRow}>
                <Text style={styles.postText}>
                  {parts.before}
                  <Text style={styles.link} onPress={() => router.push(`/team/${teamId}/games/${post.gameId}`)}>
                    {parts.gameLabel}
                  </Text>
                  {parts.after}
                </Text>
              </View>
            );
          }
          return (
            <View key={post.id} style={styles.postRow}>
              <Pressable onPress={() => router.push(`/player/${post.playerId}`)}>
                <Text style={styles.playerName}>{post.playerDisplayName}</Text>
              </Pressable>
              <Text style={styles.postText}>
                reached {describeMilestone(post)} ({formatDateDisplay(post.gameDate)})
              </Text>
              <Pressable onPress={() => toggleLike(post)}>
                <Text style={post.likedByMe ? styles.likedLink : styles.link}>
                  {post.likedByMe ? "♥" : "♡"} {post.likeCount}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <TeamTabBar teamId={teamId} active="home" />

      <CircleCropModal
        visible={cropImageUri !== null}
        imageUri={cropImageUri}
        busy={uploadingLogo}
        onCancel={() => setCropImageUri(null)}
        onConfirm={handleConfirmCrop}
      />

      <Modal visible={joinLinkVisible} transparent animationType="fade" onRequestClose={() => setJoinLinkVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.joinLinkCard}>
            <Text style={styles.hint}>Share the link below to your fans!</Text>
            <CopyableLink value={Linking.createURL(`/join/${teamId}`)} />
            <Pressable style={styles.gotItButton} onPress={() => setJoinLinkVisible(false)}>
              <Text style={styles.gotItButtonText}>Got It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={unfollowResult !== null} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.joinLinkCard}>
            <Text style={styles.hint}>
              You've unfollowed {context?.teamName ?? "this team"}.
              {unfollowResult && unfollowResult.unlinkedCount > 0
                ? ` ${unfollowResult.unlinkedCount} linked player${unfollowResult.unlinkedCount === 1 ? "" : "s"} on this team ${unfollowResult.unlinkedCount === 1 ? "was" : "were"} also unlinked.`
                : ""}
            </Text>
            <Pressable
              style={styles.gotItButton}
              onPress={() => {
                setUnfollowResult(null);
                router.replace("/");
              }}
            >
              <Text style={styles.gotItButtonText}>Got It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            {isCoach ? (
              <>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push(`/team/${teamId}/settings`);
                  }}
                >
                  <Text style={styles.menuItemText}>Team Settings</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  style={styles.menuItemRow}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push(`/team/${teamId}/members`);
                  }}
                >
                  <Text style={styles.menuItemText}>Notifications</Text>
                  {pendingClaimCount > 0 && (
                    <View style={styles.menuItemBadge}>
                      <Text style={styles.menuItemBadgeText}>{pendingClaimCount}</Text>
                    </View>
                  )}
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push({ pathname: "/import-game", params: { teamId } });
                  }}
                >
                  <Text style={styles.menuItemText}>Import Game</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push({ pathname: "/live-score-setup", params: { teamId } });
                  }}
                >
                  <Text style={styles.menuItemText}>Live Scoring</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    router.push(`/team/${teamId}/members`);
                  }}
                >
                  <Text style={styles.menuItemText}>{context?.teamName ?? "Team"} Fans</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    setJoinLinkVisible(true);
                  }}
                >
                  <Text style={styles.menuItemText}>Team Join Link</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.menuItem}
                disabled={leavingTeam}
                onPress={() => {
                  setMenuVisible(false);
                  confirmUnfollowTeam();
                }}
              >
                <Text style={styles.menuItemText}>Unfollow Team</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  frozenSection: { padding: 20, paddingBottom: 0, gap: 4, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 8 },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teamLogoContainer: { position: "relative" },
  teamLogo: { width: 96, height: 96 },
  teamLogoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  teamLogoPlaceholderText: { color: colors.textMuted, fontSize: 11, fontFamily: "Montserrat_400Regular", textAlign: "center" },
  teamLogoUploadOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 48,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 16, color: colors.textPrimary },
  sectionDivider: { height: 1, backgroundColor: colors.border, marginTop: 10 },
  joinLinkText: {
    fontSize: 14,
    fontFamily: "Montserrat_600SemiBold",
    color: colors.accent,
    textDecorationLine: "underline",
    marginTop: 4,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  joinLinkCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: "center", width: "100%", maxWidth: 380, gap: 16 },
  gotItButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 32, alignItems: "center" },
  gotItButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  menuButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 4 },
  menuButtonText: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
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
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  menuItemText: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
  menuItemBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemBadgeText: { color: "white", fontSize: 12, fontFamily: "Montserrat_700Bold" },
  menuDivider: { height: 1, backgroundColor: colors.border },
  statLine: { fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  statsChart: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    rowGap: 10,
    alignItems: "flex-start",
    position: "relative",
  },
  statBlock: { alignItems: "center", width: 70 },
  statNumber: { fontSize: 20, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  statLabel: {
    fontSize: 11,
    fontFamily: "Montserrat_400Regular",
    color: colors.textSecondary,
    marginTop: 2,
    width: 70,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "white", fontSize: 11, fontFamily: "Montserrat_700Bold" },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
  postRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  playerName: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: colors.textPrimary },
  postText: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  link: { color: colors.accent, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  likedLink: { color: colors.danger, fontSize: 14, fontFamily: "Montserrat_400Regular" },
});
