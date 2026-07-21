import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getPlayerProfile, currentSeasonLine, type PlayerProfile } from "../../../lib/playerRepository";
import { calculateStarTiers } from "../../../lib/starTiers";
import {
  describeMilestone,
  followPlayer,
  getFollowerCount,
  isFollowing,
  listPlayerActivity,
  unfollowPlayer,
  type ActivityFeedPost,
} from "../../../lib/socialRepository";
// Block/Report is disabled for now -- kept here, commented out, in case it's
// wanted again later.
// import BlockReportButtons from "../../../components/BlockReportButtons";
import StatColumns from "../../../components/StatColumns";
import { colors } from "../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

function stars(n: number): string {
  return n > 0 ? "⭐".repeat(n) : "";
}

// Voluntary fields (spec: parent fills these in via Player Settings) --
// only render the parts that have actually been set.
function formatDemographics(p: PlayerProfile): string | null {
  const parts: string[] = [];
  if (p.heightFeet != null) parts.push(`${p.heightFeet}'${p.heightInches ?? 0}"`);
  if (p.weightLbs != null) parts.push(`${p.weightLbs} lbs`);
  if (p.bats) parts.push(`Bats: ${p.bats}`);
  if (p.throws) parts.push(`Throws: ${p.throws}`);
  return parts.length > 0 ? parts.join("   ") : null;
}

export default function PlayerProfileScreen() {
  const { session } = useRequireAuth();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [recentActivity, setRecentActivity] = useState<ActivityFeedPost[]>([]);
  const [careerOpen, setCareerOpen] = useState(false);
  const [seasonsOpen, setSeasonsOpen] = useState(false);

  const load = useCallback(() => {
    if (!playerId || !session) return;
    getPlayerProfile(supabase, playerId, session.user.id)
      .then((p) => {
        setProfile(p);
        setLoaded(true);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoaded(true);
      });
    isFollowing(supabase, playerId, session.user.id).then(setFollowing).catch(() => {});
    getFollowerCount(supabase, playerId).then(setFollowerCount).catch(() => {});
    listPlayerActivity(supabase, playerId, session.user.id).then(setRecentActivity).catch(() => {});
  }, [playerId, session]);

  async function toggleFollow() {
    if (!playerId || !session) return;
    setFollowBusy(true);
    try {
      if (following) {
        await unfollowPlayer(supabase, playerId, session.user.id);
        setFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await followPlayer(supabase, playerId, session.user.id);
        setFollowing(true);
        setFollowerCount((c) => c + 1);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFollowBusy(false);
    }
  }

  // Re-fetch on focus so settings changes (tag/visibility/demographics)
  // show immediately when navigating back from the settings screen.
  useFocusEffect(load);

  if (!session || !playerId) return null;

  if (!loaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    // Nonexistent and not-visible-to-you are deliberately the same state.
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Player not available</Text>
        <Text style={styles.hint}>
          This player doesn't exist, or their profile is set to Private and isn't visible to you.
        </Text>
      </View>
    );
  }

  const current = currentSeasonLine(profile);
  // Star tiers reset each season (spec Section 9), so they're computed
  // from the player's current in-season line, not the career aggregate --
  // a player with no in-season team right now simply shows no stars.
  const tiers = current ? calculateStarTiers(current.counts) : null;
  const demographics = formatDemographics(profile);

  const categoryRows = current
    ? [
        { label: "Hits", value: String(current.counts.h), stars: stars(tiers!.hits) },
        { label: "2B", value: String(current.counts.doubles), stars: stars(tiers!.doubles) },
        { label: "3B", value: String(current.counts.triples), stars: stars(tiers!.triples) },
        { label: "HR", value: String(current.counts.hr), stars: stars(tiers!.homeRuns) },
        { label: "RBI", value: String(current.counts.rbi), stars: "" },
        { label: "AVG", value: fmt(current.stats.avg), stars: "" },
        { label: "OBP", value: fmt(current.stats.obp), stars: "" },
        { label: "SLG", value: fmt(current.stats.slg), stars: "" },
        { label: "OPS", value: fmt(current.stats.ops), stars: "" },
      ]
    : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {profile.isOwner && (
        <View style={styles.ownerRow}>
          <Text style={profile.visibilityScope === "private" ? styles.privateBadge : styles.publicBadge}>
            {profile.visibilityScope}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.push(`/player/${playerId}/settings`)}>
            <Text style={styles.secondaryButtonText}>Settings</Text>
          </Pressable>
        </View>
      )}

      {!profile.isOwner && (
        <View style={styles.ownerRow}>
          <Pressable style={styles.secondaryButton} disabled={followBusy} onPress={toggleFollow}>
            <Text style={styles.secondaryButtonText}>{following ? "Unfollow" : "Follow"}</Text>
          </Pressable>
          <Text style={styles.hint}>
            {followerCount} follower{followerCount === 1 ? "" : "s"}
          </Text>
        </View>
      )}

      <View style={styles.demographicsBlock}>
        <Text style={styles.title}>
          {current ? `#${current.uniformNumber} - ${profile.displayName}` : profile.displayName}
        </Text>
        {current && <Text style={styles.teamName}>{current.teamName}</Text>}
        {demographics && <Text style={styles.hint}>{demographics}</Text>}
      </View>

      {/* Block/Report disabled for now -- see the commented-out import above.
      {session && !profile.isOwner && (
        <BlockReportButtons myUserId={session.user.id} targetUserId={profile.parentUserId} />
      )}
      */}

      {categoryRows.length > 0 && (
        <>
          <Text style={styles.label}>Current Season</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.categoryCell]}>Category</Text>
              <Text style={[styles.tableHeaderCell, styles.valueCell]}>Season Stats</Text>
              <Text style={[styles.tableHeaderCell, styles.starsCell]}>Star Rating</Text>
            </View>
            {categoryRows.map((row) => (
              <View key={row.label} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.categoryCell]}>{row.label}</Text>
                <Text style={[styles.tableCell, styles.valueCell]}>{row.value}</Text>
                <Text style={[styles.tableCell, styles.starsCell]}>{row.stars}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Pressable style={styles.sectionHeader} onPress={() => setCareerOpen((v) => !v)}>
        <Text style={styles.label}>Career</Text>
        <Text style={styles.chevron}>{careerOpen ? "▾" : "▸"}</Text>
      </Pressable>
      {careerOpen && <StatColumns counts={profile.careerCounts} stats={profile.careerStats} hideZero />}

      {recentActivity.length > 0 && (
        <>
          <Text style={styles.label}>Recent Activity</Text>
          {recentActivity.map((post) => (
            <Text key={post.id} style={styles.statLine}>
              Reached {describeMilestone(post)} -- {post.gameDate}
            </Text>
          ))}
        </>
      )}

      <Pressable style={styles.sectionHeader} onPress={() => setSeasonsOpen((v) => !v)}>
        <Text style={styles.label}>Seasons</Text>
        <Text style={styles.chevron}>{seasonsOpen ? "▾" : "▸"}</Text>
      </Pressable>
      {seasonsOpen && profile.seasons.length === 0 && <Text style={styles.hint}>No seasons recorded yet.</Text>}
      {seasonsOpen &&
        profile.seasons.map((s) => (
          <Pressable key={s.rosterEntryId} style={styles.seasonRow} onPress={() => router.push(`/team/${s.teamId}`)}>
            <Text style={styles.seasonTitle}>
              {s.teamName} #{s.uniformNumber} -- {s.season} {s.year}
              {s.seasonStatus === "ended" ? " (ended)" : ""}
            </Text>
            <Text style={styles.hint}>
              {s.leagueName}, {s.divisionName}
            </Text>
            <StatColumns counts={s.counts} stats={s.stats} hideZero />
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 6, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  teamName: { fontSize: 17, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },
  hint: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  label: { fontSize: 15, fontWeight: "600", marginTop: 16, color: colors.textPrimary },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  chevron: { fontSize: 15, marginTop: 16, color: colors.textSecondary },
  statLine: { fontSize: 14, color: colors.textSecondary },
  demographicsBlock: { marginTop: 8, gap: 2 },
  ownerRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  publicBadge: { color: colors.success, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, borderRadius: 4 },
  privateBadge: { color: colors.warningText, backgroundColor: colors.warningBg, paddingHorizontal: 8, borderRadius: 4 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: colors.textPrimary },
  seasonRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  seasonTitle: { fontWeight: "600", fontSize: 15, color: colors.textPrimary },
  table: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderCell: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tableCell: { fontSize: 14, color: colors.textSecondary },
  categoryCell: { flex: 1, textAlign: "center" },
  valueCell: { flex: 1, textAlign: "center" },
  starsCell: { flex: 1, textAlign: "center" },
});
