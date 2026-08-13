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
import VerificationNoticeModal from "../../../components/VerificationNoticeModal";
import PlayerCard from "../../../components/PlayerCard";
import PlayerCardStatsBack from "../../../components/PlayerCardStatsBack";
import { formatDateDisplay } from "../../../lib/dateFormat";
import { colors } from "../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
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
  const [claimSentTeamName, setClaimSentTeamName] = useState<string | null>(null);
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
      setClaimSentTeamName(current.teamName);
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

  // Agreeing to a coach's transfer offer is the same "becoming this
  // player's verified Parent/Legal Guardian" consent as claiming or
  // getting approved from Home -- same notice, same onboarding wizard
  // hand-off afterward, instead of dropping straight onto Settings.
  async function handleTransferOfferResponse(agree: boolean) {
    if (!transferOffer) return;
    setTransferOfferBusy(true);
    setTransferOfferError(null);
    try {
      await respondToTransferOffer(supabase, transferOffer.requestId, agree);
      const claimedPlayerId = transferOffer.playerId;
      setTransferOffer(null);
      if (agree) {
        router.push({ pathname: "/player-onboarding", params: { playerIds: claimedPlayerId } });
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

  // Same "Important Profile Verification Notice" consent flow as the
  // parent-side Home banner (notifications.tsx) -- a Head Coach unlocking
  // their own kid's fallback profile still has to read and agree to the
  // notice, and Agree hands off to the same onboarding wizard afterward.
  async function handleAttest() {
    if (!profile) return;
    setAttestBusy(true);
    setAttestError(null);
    try {
      await attestPlayerParent(supabase, profile.playerId);
      setAttestModalOpen(false);
      router.push({ pathname: "/player-onboarding", params: { playerIds: profile.playerId } });
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

  // Real name when the parent opted into "Real Name" display, OR when the
  // viewer is coaching staff on this locked player's team -- same
  // exception the Roster screen already makes (statsRepository's
  // displayNameFor), so a coach isn't shown a name on the roster list but
  // then just a uniform number once they tap into the card. Otherwise
  // both card faces fall back to displayName (the alias/uniform tag shown
  // everywhere else).
  const showRealNameOnCard = profile.displayMode === "real_name" || (profile.isCoachFallback && isCoachOnTeam);
  const cardFirstName = showRealNameOnCard ? (profile.realName?.split(" ")[0] ?? "") : "";
  const cardLastName = showRealNameOnCard ? profile.realName?.split(" ").slice(1).join(" ") || "" : profile.displayName;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      {profile.isOwner && (
        <View style={styles.ownerSection}>
          <Text style={profile.visibilityScope === "private" ? styles.privateBadge : styles.publicBadge}>
            {profile.visibilityScope}
          </Text>
          <View style={styles.ownerButtonRow}>
            {(!isCoachOwner || isAttested) && (
              <Pressable style={styles.tileButton} onPress={() => router.push(`/player/${playerId}/settings`)}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={1}>
                  Settings
                </Text>
              </Pressable>
            )}
            {isCoachOwner && profile.isCoachFallback && (
              <Pressable style={styles.tileButton} onPress={handleGoToTransfer}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={1}>
                  {"Transfer\nPlayer"}
                </Text>
              </Pressable>
            )}
            {isCoachOwner && profile.isCoachFallback && !isAttested && (
              <Pressable style={styles.tileButton} onPress={() => setAttestModalOpen(true)}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={1}>
                  {"Unlock\nPlayer"}
                </Text>
              </Pressable>
            )}
            {!profile.isCoachFallback && (
              <Pressable style={styles.tileButton} onPress={() => setUnlinkModalOpen(true)}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={1}>
                  {"Unlink\nPlayer"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <VerificationNoticeModal
        visible={attestModalOpen}
        playerNames={profile.realName ?? profile.displayName}
        busy={attestBusy}
        error={attestError}
        onBack={() => setAttestModalOpen(false)}
        onAgree={handleAttest}
      />

      {!profile.isOwner && (
        <View style={styles.ownerSection}>
          <View style={styles.ownerRow}>
            {profile.visibilityScope !== "only_me" && (
              <Text style={styles.hint}>
                {followerCount} follower{followerCount === 1 ? "" : "s"}
              </Text>
            )}
            {profile.isCoachFallback && myClaimStatus === "pending" && (
              <Text style={styles.hint}>Pending Approval</Text>
            )}
            {profile.isCoachFallback && myClaimStatus === "coach_approved" && (
              <Text style={styles.hint}>Approved</Text>
            )}
          </View>
          <View style={styles.ownerButtonRow}>
            {profile.visibilityScope !== "only_me" && (
              <Pressable style={styles.tileButton} disabled={followBusy} onPress={toggleFollow}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={1}>
                  {following ? "Unfollow" : "Follow"}
                </Text>
              </Pressable>
            )}
            {profile.isCoachFallback && myClaimStatus !== "pending" && myClaimStatus !== "coach_approved" && (
              <Pressable style={styles.tileButton} disabled={claimBusy} onPress={() => setClaimModalOpen(true)}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={1}>
                  {"Unlock\nPlayer"}
                </Text>
              </Pressable>
            )}
            {!profile.isCoachFallback && isHeadCoachOnTeam && (
              <Pressable style={styles.tileButton} onPress={() => setUnlinkModalOpen(true)}>
                <Text style={[styles.tileButtonText, { fontSize: 12 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={1}>
                  {"Unlink\nPlayer"}
                </Text>
              </Pressable>
            )}
          </View>
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
              Your request has been sent to {claimSentTeamName ? `the ${claimSentTeamName} coaching staff` : "the coaching staff"}.
            </Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalAgree} onPress={() => setClaimSuccessOpen(false)}>
                <Text style={styles.modalAgreeText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <VerificationNoticeModal
        visible={!!transferOffer}
        playerNames={transferOffer?.playerName ?? ""}
        busy={transferOfferBusy}
        error={transferOfferError}
        backLabel="Decline"
        onBack={() => handleTransferOfferResponse(false)}
        onAgree={() => handleTransferOfferResponse(true)}
      />

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
            locked={profile.isCoachFallback || (profile.visibilityScope === "only_me" && !profile.isOwner)}
            activity={cardActivity.slice(0, 3).map((post) => ({
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
  ownerSection: { gap: 8, marginTop: 8, alignItems: "flex-start" },
  // alignSelf: "stretch" is required here -- ownerSection uses alignItems:
  // "flex-start" (so the privacy badge above doesn't stretch full-width),
  // which otherwise leaves this row's own width undetermined and the
  // tiles' percentage widths resolving against nothing, throwing off both
  // their sizing and the text centering inside them.
  ownerButtonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignSelf: "stretch" },
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
  // Sized so exactly 4 fit per row inside the 20px screen padding with an
  // 8px gap between each: (100% - 3 gaps) / 4 tiles.
  tileButton: {
    width: "23%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  tileButtonText: {
    flex: 1,
    width: "100%",
    color: colors.textPrimary,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    textAlign: "center",
    verticalAlign: "middle",
  },
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
