import { useCallback, useEffect, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Modal } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getTeamJoinContext, countPendingClaimRequests, type TeamJoinContext } from "../../../lib/claimRepository";
import { listTeamCoaches, type TeamCoach } from "../../../lib/coachesRepository";
import { uploadTeamLogo, getTeamMembers } from "../../../lib/teamsRepository";
import {
  describeGameImported,
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
  const [pendingClaimCount, setPendingClaimCount] = useState(0);
  const [rosterCount, setRosterCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityFeedPost[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
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
        .from("coach_assignment")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setIsCoach(!!data);
          if (data) {
            return Promise.all([
              countPendingClaimRequests(supabase, teamId).then(setPendingClaimCount).catch(() => {}),
              getTeamMembers(supabase, teamId).then((m) => setMemberCount(m.length)).catch(() => {}),
            ]);
          }
        }),
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
    if (!teamId || !isCoach) return;
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
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handlePickLogo} disabled={!isCoach || uploadingLogo}>
            {context?.teamLogoUrl ? (
              <Image source={{ uri: context.teamLogoUrl }} style={styles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={styles.teamLogoPlaceholder}>
                <Text style={styles.teamLogoPlaceholderText}>
                  {isCoach ? "Upload Your Team Logo" : "No Team Logo"}
                </Text>
              </View>
            )}
            {uploadingLogo && (
              <View style={styles.teamLogoUploadOverlay}>
                <ActivityIndicator color="white" />
              </View>
            )}
          </Pressable>

          {isCoach && (
            <Pressable style={styles.statsChart} onPress={() => router.push(`/team/${teamId}/members`)}>
              <View style={styles.statBlock}>
                <Text style={styles.statNumber}>{rosterCount}</Text>
                <Text style={styles.statLabel}>Players</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statNumber}>{memberCount}</Text>
                <Text style={styles.statLabel}>Fans</Text>
              </View>
              {pendingClaimCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingClaimCount}</Text>
                </View>
              )}
            </Pressable>
          )}
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

        <View style={styles.tileGrid}>
          {isCoach && (
            <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/settings`)}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Team Settings</Text>
              </View>
            </Pressable>
          )}
          {isCoach && (
            <Pressable style={styles.tile} onPress={() => router.push({ pathname: "/import-game", params: { teamId } })}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Import Game</Text>
              </View>
            </Pressable>
          )}
          <Pressable style={styles.tile} onPress={() => router.push(`/team/${teamId}/games`)}>
            <View style={styles.tileInner}>
              <Text style={styles.tileText}>Game Log</Text>
            </View>
          </Pressable>
          {isCoach && (
            <Pressable style={styles.tile} onPress={() => setJoinLinkVisible(true)}>
              <View style={styles.tileInner}>
                <Text style={styles.tileText}>Team Join Link</Text>
              </View>
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>Activity Feed</Text>
        {activityLoaded && activity.length === 0 && (
          <Text style={styles.hint}>No milestones yet.</Text>
        )}
        {activity.map((post) =>
          post.category === "game_imported" ? (
            <View key={post.id} style={styles.postRow}>
              <Text style={styles.postText}>
                {describeGameImported(post, formatDateDisplay(post.gameDate))}
              </Text>
            </View>
          ) : (
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
          )
        )}
      </ScrollView>
      <TeamTabBar teamId={teamId} active="home" />

      <CircleCropModal
        visible={cropImageUri !== null}
        imageUri={cropImageUri}
        busy={uploadingLogo}
        onCancel={() => setCropImageUri(null)}
        onConfirm={handleConfirmCrop}
      />

      <Modal visible={joinLinkVisible} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.joinLinkCard}>
            <Text style={styles.hint}>Click the link below to share with fans.</Text>
            <CopyableLink value={Linking.createURL(`/join/${teamId}`)} />
            <Pressable style={styles.gotItButton} onPress={() => setJoinLinkVisible(false)}>
              <Text style={styles.gotItButtonText}>Got It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  joinLinkCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: "center", width: "100%", maxWidth: 380, gap: 16 },
  gotItButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 32, alignItems: "center" },
  gotItButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8, rowGap: 8 },
  tile: {
    width: "23%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 4,
    position: "relative",
  },
  // A plain Text centered directly by the Pressable's own alignItems/
  // justifyContent rendered bottom-heavy on Android for wrapped labels
  // (confirmed by temporarily highlighting the Text's own box -- it sat
  // flush against the tile's bottom edge instead of centered). An
  // explicit flex:1 wrapper that centers its own content is unambiguous
  // and fixes it.
  tileInner: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  tileText: {
    color: colors.textPrimary,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    includeFontPadding: false,
  },
  statLine: { fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  statsChart: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-evenly",
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
