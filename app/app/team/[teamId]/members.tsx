import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  getTeamMembers,
  promoteToAssistantCoach,
  demoteAssistantCoach,
  AssistantCoachCapacityError,
  NotHeadCoachError,
  type TeamMember,
} from "../../../lib/teamsRepository";
import {
  offerPlayerTransfer,
  verifyNewPlayer,
  NotACoachError,
  UniformNumberTakenError,
  listPendingClaimRequests,
  approveClaimRequest,
  denyClaimRequest,
  TeamAtCapacityError,
  getTeamJoinContext,
  listPendingSentOffers,
  cancelTransferOffer,
  type PendingClaimRequest,
  type PendingSentOffer,
} from "../../../lib/claimRepository";
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
  const { session } = useRequireAuth();
  // transferRosterEntryId, when present, puts this screen in "pick a
  // transfer target" mode -- arrived at from a Player Profile's
  // "Transfer to Parent" action instead of the Team Settings tile.
  const { teamId, transferRosterEntryId } = useLocalSearchParams<{
    teamId: string;
    transferRosterEntryId?: string;
  }>();
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingClaimRequest[]>([]);
  const [sentOffers, setSentOffers] = useState<PendingSentOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // "Verify" popup (Gap #1) -- coach recognizes which fan is a specific
  // player's parent and creates + offers the player in one action.
  const [verifyTarget, setVerifyTarget] = useState<TeamMember | null>(null);
  const [verifyFirstName, setVerifyFirstName] = useState("");
  const [verifyLastName, setVerifyLastName] = useState("");
  const [verifyUniformNumber, setVerifyUniformNumber] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    getTeamJoinContext(supabase, teamId)
      .then((context) => setTeamName(context.teamName))
      .catch(() => {});
    const membersPromise = getTeamMembers(supabase, teamId)
      .then((rows) => {
        setMembers(rows);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    const requestsPromise = transferRosterEntryId
      ? Promise.resolve()
      : listPendingClaimRequests(supabase, teamId)
          .then(setPendingRequests)
          .catch((err) => setError(errorMessage(err)));
    const sentOffersPromise = transferRosterEntryId
      ? Promise.resolve()
      : listPendingSentOffers(supabase, teamId)
          .then(setSentOffers)
          .catch(() => {});
    await Promise.all([membersPromise, requestsPromise, sentOffersPromise]);
    setLoaded(true);
  }, [teamId, transferRosterEntryId]);

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

  const assistantCount = members.filter((m) => m.role === "assistant_coach").length;
  const isHeadCoach = members.some((m) => m.userId === session?.user.id && m.role === "head_coach");

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

  async function handleDemote(member: TeamMember) {
    if (!teamId) return;
    setBusyUserId(member.userId);
    setError(null);
    try {
      await demoteAssistantCoach(supabase, teamId, member.userId);
      load();
    } catch (err) {
      setError(err instanceof NotHeadCoachError ? err.message : errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  function openVerify(member: TeamMember) {
    setVerifyTarget(member);
    setVerifyFirstName("");
    setVerifyLastName("");
    setVerifyUniformNumber("");
    setVerifyError(null);
  }

  async function handleSendVerification() {
    if (!teamId || !verifyTarget) return;
    const uniformNumber = Number.parseInt(verifyUniformNumber, 10);
    if (!verifyFirstName.trim() || !verifyLastName.trim() || !uniformNumber) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      await verifyNewPlayer(
        supabase,
        teamId,
        verifyTarget.userId,
        verifyFirstName.trim(),
        verifyLastName.trim(),
        uniformNumber
      );
      setVerifyTarget(null);
      load();
    } catch (err) {
      setVerifyError(
        err instanceof NotACoachError || err instanceof UniformNumberTakenError ? err.message : errorMessage(err)
      );
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleTransfer(member: TeamMember) {
    if (!teamId || !transferRosterEntryId) return;
    setBusyUserId(member.userId);
    setError(null);
    try {
      // Offering, not transferring outright -- ownership only changes once
      // the target agrees via the consent popup on their end (Player
      // Profile / a Home notification), same as a self-service claim.
      await offerPlayerTransfer(supabase, transferRosterEntryId, member.userId);
      router.back();
    } catch (err) {
      setError(err instanceof NotACoachError ? err.message : errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleApproveRequest(requestId: string) {
    setBusyRequestId(requestId);
    setError(null);
    try {
      await approveClaimRequest(supabase, requestId);
      load();
    } catch (err) {
      setError(err instanceof TeamAtCapacityError ? err.message : errorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleDenyRequest(requestId: string) {
    setBusyRequestId(requestId);
    setError(null);
    try {
      await denyClaimRequest(supabase, requestId);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleCancelOffer(requestId: string) {
    setBusyRequestId(requestId);
    setError(null);
    try {
      await cancelTransferOffer(supabase, requestId);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRequestId(null);
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
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>{transferRosterEntryId ? "Transfer To..." : `${teamName} Fans`}</Text>
      <Text style={styles.hint}>
        {transferRosterEntryId
          ? "Pick a member of this team to offer this player to. They'll need to agree before ownership changes."
          : "These are the list of followers who joined with your team's link. You may promote up to 3 assistant coaches."}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {!transferRosterEntryId && pendingRequests.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Pending Claim Requests</Text>
          {pendingRequests.map((req) => (
            <View key={req.requestId} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.email}>{req.requesterName}</Text>
                <Text style={styles.emailSecondary}>{req.requesterEmail}</Text>
                <Text style={styles.roleLabel}>
                  Requesting to claim {req.playerName} (#{req.uniformNumber})
                </Text>
              </View>
              <View style={styles.requestButtonRow}>
                <Pressable
                  style={styles.actionButton}
                  disabled={busyRequestId === req.requestId}
                  onPress={() => handleDenyRequest(req.requestId)}
                >
                  <Text style={styles.actionButtonText}>Deny</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.approveButton]}
                  disabled={busyRequestId === req.requestId}
                  onPress={() => handleApproveRequest(req.requestId)}
                >
                  {busyRequestId === req.requestId ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.approveButtonText}>Approve</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      {members.map((member) => (
        <View key={member.userId} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.email}>{member.displayName}</Text>
            <Text style={styles.emailSecondary}>{member.email}</Text>
            <Text style={styles.roleLabel}>{ROLE_LABELS[member.role]}</Text>
            {member.coachFallbackPlayerNames && (
              <Text style={styles.roleLabel}>Coach of {member.coachFallbackPlayerNames}</Text>
            )}
            {member.claimedPlayerNames && (
              <Text style={styles.roleLabel}>Parent of {member.claimedPlayerNames}</Text>
            )}
            {sentOffers
              .filter((offer) => offer.targetUserId === member.userId)
              .map((offer) => (
                <View key={offer.requestId} style={styles.pendingOfferRow}>
                  <Text style={styles.pendingOfferText}>Pending to claim {offer.playerName}</Text>
                  <Pressable
                    disabled={busyRequestId === offer.requestId}
                    onPress={() => handleCancelOffer(offer.requestId)}
                  >
                    {busyRequestId === offer.requestId ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Text style={styles.pendingOfferCancel}>Cancel</Text>
                    )}
                  </Pressable>
                </View>
              ))}
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
                <Text style={styles.actionButtonText}>Offer to This Member</Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.memberButtonRow}>
              {(member.role === "follower" || member.role === "parent") && (
                <Pressable style={styles.actionButton} onPress={() => openVerify(member)}>
                  <Text style={styles.actionButtonText}>Verify</Text>
                </Pressable>
              )}
              {(member.role === "parent" || member.role === "follower") && assistantCount < 3 && (
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
              )}
              {member.role === "assistant_coach" && isHeadCoach && (
                <Pressable
                  style={styles.actionButton}
                  disabled={busyUserId === member.userId}
                  onPress={() => handleDemote(member)}
                >
                  {busyUserId === member.userId ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={styles.actionButtonText}>Demote</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </View>
      ))}
      {members.length === 0 && <Text style={styles.hint}>No one has joined this team yet.</Text>}

      <Modal visible={!!verifyTarget} transparent animationType="fade" onRequestClose={() => setVerifyTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify Player</Text>
            <Text style={styles.hint}>
              Enter the player's name and uniform number. {verifyTarget?.displayName} will be asked to confirm
              they're the Parent/Legal Guardian before anything changes.
            </Text>

            <Text style={styles.label}>Player First Name</Text>
            <TextInput style={styles.input} value={verifyFirstName} onChangeText={setVerifyFirstName} autoCapitalize="words" />

            <Text style={styles.label}>Player Last Name</Text>
            <TextInput style={styles.input} value={verifyLastName} onChangeText={setVerifyLastName} autoCapitalize="words" />

            <Text style={styles.label}>Uniform Number</Text>
            <TextInput
              style={styles.input}
              value={verifyUniformNumber}
              onChangeText={setVerifyUniformNumber}
              keyboardType="number-pad"
            />

            {verifyError && <Text style={styles.error}>{verifyError}</Text>}

            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancel} disabled={verifyBusy} onPress={() => setVerifyTarget(null)}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSend,
                  (verifyBusy || !verifyFirstName.trim() || !verifyLastName.trim() || !verifyUniformNumber) &&
                    styles.modalSendDisabled,
                ]}
                disabled={verifyBusy || !verifyFirstName.trim() || !verifyLastName.trim() || !verifyUniformNumber}
                onPress={handleSendVerification}
              >
                {verifyBusy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalSendText}>Send Verification</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 8 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
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
  email: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_600SemiBold" },
  emailSecondary: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  roleLabel: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  pendingOfferRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  pendingOfferText: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular", fontStyle: "italic" },
  pendingOfferCancel: { color: colors.danger, fontSize: 13, fontFamily: "Montserrat_600SemiBold" },
  actionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold" },
  sectionLabel: { fontSize: 15, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginTop: 16 },
  requestButtonRow: { flexDirection: "row", gap: 8 },
  approveButton: { backgroundColor: colors.accent, borderColor: colors.accent },
  approveButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
  memberButtonRow: { flexDirection: "row", gap: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 4, width: "100%", maxWidth: 400 },
  modalTitle: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 4 },
  label: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.background,
    color: colors.textPrimary,
  },
  modalButtonRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end", marginTop: 16 },
  modalCancel: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  modalSend: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  modalSendDisabled: { backgroundColor: colors.accentDisabled },
  modalSendText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
});
