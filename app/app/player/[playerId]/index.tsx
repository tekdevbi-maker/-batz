import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { getPlayerProfile, currentSeasonLine, type PlayerProfile } from "../../../lib/playerRepository";
import {
  attestPlayerParent,
  requestPlayerClaim,
  getMyClaimRequestStatus,
  listMyPendingTransferOffers,
  respondToTransferOffer,
  unlinkPlayer,
  getTeamJoinContext,
  AlreadyClaimedByParentError,
  TeamAtCapacityError,
  type PendingTransferOffer,
} from "../../../lib/claimRepository";
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
import FlipStatsCard from "../../../components/FlipStatsCard";
import PlayerCard from "../../../components/PlayerCard";
import PlayerCardStatsBack from "../../../components/PlayerCardStatsBack";
import { formatDateDisplay } from "../../../lib/dateFormat";
import { colors } from "../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Appended to every consent popup that unlocks a player (attest, claim
// request, transfer offer) -- the standing, self-service reversal a parent
// always has, not just a one-time accept.
const UNLINK_DISCLOSURE =
  " You may unlink this player at any time, which will return them to a locked state under the Head Coach's account.";

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
  // The card's stats-back face shows every activity entry.
  const [cardActivity, setCardActivity] = useState<ActivityFeedPost[]>([]);
  const [isCoachOnTeam, setIsCoachOnTeam] = useState(false);
  const [attestModalOpen, setAttestModalOpen] = useState(false);
  const [attestBusy, setAttestBusy] = useState(false);
  const [attestError, setAttestError] = useState<string | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimSuccessOpen, setClaimSuccessOpen] = useState(false);
  const [claimSentCoachName, setClaimSentCoachName] = useState<string | null>(null);
  const [myClaimStatus, setMyClaimStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isHeadCoachOnTeam, setIsHeadCoachOnTeam] = useState(false);
  const [transferOffer, setTransferOffer] = useState<PendingTransferOffer | null>(null);
  const [transferOfferBusy, setTransferOfferBusy] = useState(false);
  const [transferOfferError, setTransferOfferError] = useState<string | null>(null);
  const [unlinkModalOpen, setUnlinkModalOpen] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!playerId || !session) return;
    await Promise.all([
      getPlayerProfile(supabase, playerId, session.user.id)
        .then((p) => setProfile(p))
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoaded(true)),
      isFollowing(supabase, playerId, session.user.id).then(setFollowing).catch(() => {}),
      getFollowerCount(supabase, playerId).then(setFollowerCount).catch(() => {}),
      listPlayerActivity(supabase, playerId, session.user.id, 500).then(setCardActivity).catch(() => {}),
      listMyPendingTransferOffers(supabase)
        .then((offers) => setTransferOffer(offers.find((o) => o.playerId === playerId) ?? null))
        .catch(() => {}),
    ]);
  }, [playerId, session]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

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

  async function handleClaim() {
    if (!profile) return;
    const current = currentSeasonLine(profile);
    if (!current) return;
    setClaimBusy(true);
    setClaimError(null);
    try {
      await requestPlayerClaim(supabase, current.rosterEntryId);
      setClaimModalOpen(false);
      setMyClaimStatus("pending");
      const coachName = await getTeamJoinContext(supabase, current.teamId)
        .then((ctx) => [ctx.coachFirstName, ctx.coachLastName].filter(Boolean).join(" ").trim() || null)
        .catch(() => null);
      setClaimSentCoachName(coachName);
      setClaimSuccessOpen(true);
    } catch (err) {
      setClaimError(
        err instanceof AlreadyClaimedByParentError || err instanceof TeamAtCapacityError
          ? err.message
          : errorMessage(err)
      );
    } finally {
      setClaimBusy(false);
    }
  }

  // Re-fetch on focus so settings changes (tag/visibility/demographics)
  // show immediately when navigating back from the settings screen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // "Transfer to Parent" is only offered to a coach viewing a player on
  // their own team -- e.g. one they claimed themselves to get the player
  // on the roster before the real parent had an account.
  useEffect(() => {
    if (!profile || !session) {
      setIsCoachOnTeam(false);
      return;
    }
    const current = currentSeasonLine(profile);
    if (!current) {
      setIsCoachOnTeam(false);
      return;
    }
    supabase
      .from("coach_assignment")
      .select("id, role")
      .eq("team_id", current.teamId)
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsCoachOnTeam(!!data);
        setIsHeadCoachOnTeam(data?.role === "primary");
      });
  }, [profile, session]);

  // Whether I (the viewer) already have a pending/decided claim request on
  // this player's current roster spot -- drives the "I'm the Parent"
  // button showing "Request pending" instead of being tappable again.
  useEffect(() => {
    if (!profile || !session || profile.isOwner || !profile.isCoachFallback) {
      setMyClaimStatus(null);
      return;
    }
    const current = currentSeasonLine(profile);
    if (!current) {
      setMyClaimStatus(null);
      return;
    }
    getMyClaimRequestStatus(supabase, current.rosterEntryId)
      .then(setMyClaimStatus)
      .catch(() => setMyClaimStatus(null));
  }, [profile, session]);

  function handleGoToTransfer() {
    if (!profile) return;
    const current = currentSeasonLine(profile);
    if (!current) return;
    router.push(`/team/${current.teamId}/members?transferRosterEntryId=${current.rosterEntryId}`);
  }

  async function handleTransferOfferResponse(agree: boolean) {
    if (!transferOffer) return;
    setTransferOfferBusy(true);
    setTransferOfferError(null);
    try {
      await respondToTransferOffer(supabase, transferOffer.requestId, agree);
      const claimedPlayerId = transferOffer.playerId;
      setTransferOffer(null);
      if (agree) {
        router.push(`/player/${claimedPlayerId}/settings`);
      } else {
        load();
      }
    } catch (err) {
      setTransferOfferError(
        err instanceof TeamAtCapacityError ? err.message : errorMessage(err)
      );
    } finally {
      setTransferOfferBusy(false);
    }
  }

  async function handleUnlink() {
    if (!profile) return;
    setUnlinkBusy(true);
    setUnlinkError(null);
    try {
      await unlinkPlayer(supabase, profile.playerId);
      setUnlinkModalOpen(false);
      load();
    } catch (err) {
      setUnlinkError(errorMessage(err));
    } finally {
      setUnlinkBusy(false);
    }
  }

  async function handleAttest() {
    if (!profile) return;
    setAttestBusy(true);
    setAttestError(null);
    try {
      await attestPlayerParent(supabase, profile.playerId);
      setAttestModalOpen(false);
      load();
    } catch (err) {
      setAttestError(errorMessage(err));
    } finally {
      setAttestBusy(false);
    }
  }

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

  const isCoachOwner = profile.isOwner && isCoachOnTeam;
  const isAttested = !!profile.parentAttestedAt;
  const current = currentSeasonLine(profile);

  // Real name only when the parent opted into "Real Name" display -- otherwise
  // both card faces fall back to displayName (the same alias/uniform tag
  // shown everywhere else), never the real name. A locked player's
  // displayMode is already forced to "uniform" upstream, so this naturally
  // resolves to just the default tag with no first name for them too.
  const cardFirstName = profile.displayMode === "real_name" ? (profile.realName?.split(" ")[0] ?? "") : "";
  const cardLastName =
    profile.displayMode === "real_name" ? profile.realName?.split(" ").slice(1).join(" ") || "" : profile.displayName;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      {profile.isOwner && (
        <View style={styles.ownerRow}>
          <Text style={profile.visibilityScope === "private" ? styles.privateBadge : styles.publicBadge}>
            {profile.visibilityScope}
          </Text>
          {(!isCoachOwner || isAttested) && (
            <Pressable style={styles.secondaryButton} onPress={() => router.push(`/player/${playerId}/settings`)}>
              <Text style={styles.secondaryButtonText}>Settings</Text>
            </Pressable>
          )}
          {isCoachOwner && profile.isCoachFallback && (
            <Pressable style={styles.secondaryButton} onPress={handleGoToTransfer}>
              <Text style={styles.secondaryButtonText}>Transfer to Follower</Text>
            </Pressable>
          )}
          {isCoachOwner && profile.isCoachFallback && !isAttested && (
            <Pressable style={styles.secondaryButton} onPress={() => setAttestModalOpen(true)}>
              <Text style={styles.secondaryButtonText}>Unlock this Player</Text>
            </Pressable>
          )}
        </View>
      )}

      <Modal visible={attestModalOpen} transparent animationType="fade" onRequestClose={() => setAttestModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              You are claiming to be the Parent/Legal Guardian of {profile.displayName}. Is this correct?
              {UNLINK_DISCLOSURE}
            </Text>
            {attestError && <Text style={styles.error}>{attestError}</Text>}
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.secondaryButton, styles.modalCancel]}
                disabled={attestBusy}
                onPress={() => setAttestModalOpen(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalAgree} disabled={attestBusy} onPress={handleAttest}>
                {attestBusy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalAgreeText}>Agree</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {!profile.isOwner && (
        <View style={styles.ownerRow}>
          <Pressable style={styles.secondaryButton} disabled={followBusy} onPress={toggleFollow}>
            <Text style={styles.secondaryButtonText}>{following ? "Unfollow" : "Follow"}</Text>
          </Pressable>
          <Text style={styles.hint}>
            {followerCount} follower{followerCount === 1 ? "" : "s"}
          </Text>
          {profile.isCoachFallback && myClaimStatus === "pending" && (
            <Text style={styles.hint}>Claim requested -- waiting for the coach to approve.</Text>
          )}
          {profile.isCoachFallback && myClaimStatus === "coach_approved" && (
            <Text style={styles.hint}>Coach approved -- check your notification to finish.</Text>
          )}
          {profile.isCoachFallback && myClaimStatus !== "pending" && myClaimStatus !== "coach_approved" && (
            <Pressable style={styles.secondaryButton} disabled={claimBusy} onPress={() => setClaimModalOpen(true)}>
              <Text style={styles.secondaryButtonText}>Unlock this Player</Text>
            </Pressable>
          )}
        </View>
      )}
      {claimError && <Text style={styles.error}>{claimError}</Text>}

      <Modal visible={claimModalOpen} transparent animationType="fade" onRequestClose={() => setClaimModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              Upon coach's review, this player will be added to your profile. Are you sure you want to
              proceed?
            </Text>
            {claimError && <Text style={styles.error}>{claimError}</Text>}
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.secondaryButton, styles.modalCancel]}
                disabled={claimBusy}
                onPress={() => setClaimModalOpen(false)}
              >
                <Text style={styles.secondaryButtonText}>No</Text>
              </Pressable>
              <Pressable style={styles.modalAgree} disabled={claimBusy} onPress={handleClaim}>
                {claimBusy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalAgreeText}>Yes</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={claimSuccessOpen} transparent animationType="fade" onRequestClose={() => setClaimSuccessOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              Your request has been sent to {claimSentCoachName ? `Coach ${claimSentCoachName}` : "the coach"}.
            </Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalAgree} onPress={() => setClaimSuccessOpen(false)}>
                <Text style={styles.modalAgreeText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!transferOffer} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              Coach {transferOffer?.coachName ?? "on this team"} has approved your request to unlock{" "}
              {transferOffer?.displayName}.
            </Text>
            {transferOfferError && <Text style={styles.error}>{transferOfferError}</Text>}
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.secondaryButton, styles.modalCancel]}
                disabled={transferOfferBusy}
                onPress={() => handleTransferOfferResponse(false)}
              >
                <Text style={styles.secondaryButtonText}>Decline</Text>
              </Pressable>
              <Pressable style={styles.modalAgree} disabled={transferOfferBusy} onPress={() => handleTransferOfferResponse(true)}>
                {transferOfferBusy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalAgreeText}>Agree</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {!profile.isCoachFallback && (profile.isOwner || isHeadCoachOnTeam) && (
        <Pressable style={[styles.secondaryButton, styles.unlinkButton]} onPress={() => setUnlinkModalOpen(true)}>
          <Text style={styles.secondaryButtonText}>Unlink Player</Text>
        </Pressable>
      )}

      <Modal visible={unlinkModalOpen} transparent animationType="fade" onRequestClose={() => setUnlinkModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalText}>
              Unlink {profile.displayName} from its current parent? This returns the player to a locked state
              under the Head Coach's account -- the parent can re-claim it later.
            </Text>
            {unlinkError && <Text style={styles.error}>{unlinkError}</Text>}
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.secondaryButton, styles.modalCancel]}
                disabled={unlinkBusy}
                onPress={() => setUnlinkModalOpen(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalAgree} disabled={unlinkBusy} onPress={handleUnlink}>
                {unlinkBusy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalAgreeText}>Unlink</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Block/Report disabled for now -- see the commented-out import above.
      {session && !profile.isOwner && (
        <BlockReportButtons myUserId={session.user.id} targetUserId={profile.parentUserId} />
      )}
      */}

      <Text style={styles.hint}>Tap the card to flip it over</Text>
      <FlipStatsCard
        flippable
        faces={[
          <PlayerCard
            key="photo"
            firstName={cardFirstName}
            lastName={cardLastName}
            photoUrl={profile.photoUrl}
            teamLogoUrl={current?.teamLogoUrl}
          />,
          <PlayerCardStatsBack
            key="statsback"
            firstName={cardFirstName}
            lastName={cardLastName}
            leagueName={current?.leagueName ?? ""}
            divisionName={current?.divisionName ?? ""}
            teamName={current?.teamName ?? ""}
            season={current?.season ?? ""}
            year={current?.year ?? 0}
            heightFeet={profile.heightFeet}
            heightInches={profile.heightInches}
            weightLbs={profile.weightLbs}
            bats={profile.bats}
            throws={profile.throws}
            seasons={profile.seasons}
            careerCounts={profile.careerCounts}
            careerStats={profile.careerStats}
            teamLogoUrl={current?.teamLogoUrl}
            uniformNumber={current?.uniformNumber}
            locked={profile.isCoachFallback}
            activity={cardActivity.map((post) => ({
              id: post.id,
              text: `Reached ${describeMilestone(post)} on ${formatDateDisplay(post.gameDate)}`,
            }))}
          />,
        ]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 6, backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  ownerRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  unlinkButton: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 8, marginTop: 8 },
  publicBadge: { color: colors.success, fontFamily: "Montserrat_400Regular", backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, borderRadius: 4 },
  privateBadge: { color: colors.warningText, fontFamily: "Montserrat_400Regular", backgroundColor: colors.warningBg, paddingHorizontal: 8, borderRadius: 4 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 12, width: "100%", maxWidth: 400 },
  modalText: { color: colors.textPrimary, fontSize: 16, fontFamily: "Montserrat_400Regular" },
  modalButtonRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  modalCancel: { paddingVertical: 10 },
  modalAgree: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  modalAgreeText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
});
