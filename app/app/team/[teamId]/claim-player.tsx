import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  getTeamJoinContext,
  registerPlayer,
  createPlayerTransfer,
  RosterSpotAlreadyClaimedError,
  type TeamJoinContext,
} from "../../../lib/claimRepository";
import { colors } from "../../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function ClaimPlayerScreen() {
  const { session } = useRequireAuth();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [uniformNumber, setUniformNumber] = useState("");
  const [playerTag, setPlayerTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rosterEntryId: string } | null>(null);

  const [transferLink, setTransferLink] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    getTeamJoinContext(supabase, teamId)
      .then(setContext)
      .catch((err) => setContextError(errorMessage(err)));
  }, [teamId]);

  async function handleSubmit() {
    if (!session || !teamId || !context) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await registerPlayer(
        supabase,
        {
          teamId,
          parentUserId: session.user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          uniformNumber: Number.parseInt(uniformNumber, 10),
          playerTag: playerTag.trim() || undefined,
        },
        context
      );
      setResult({ rosterEntryId: res.rosterEntryId });
    } catch (err) {
      setSubmitError(err instanceof RosterSpotAlreadyClaimedError ? err.message : errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateTransferLink() {
    if (!result) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const token = await createPlayerTransfer(supabase, result.rosterEntryId);
      setTransferLink(Linking.createURL(`/transfer-player/${token}`));
    } catch (err) {
      setTransferError(errorMessage(err));
    } finally {
      setTransferBusy(false);
    }
  }

  if (!session || !teamId) return null;

  if (contextError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Couldn't load this team: {contextError}</Text>
      </View>
    );
  }

  if (!context) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (result) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Player added</Text>
        <Text style={styles.hint}>
          The player is now on the roster and linked to your account. Once their actual parent has an
          account (or is ready to sign up), send them a transfer link to take over.
        </Text>

        {!transferLink ? (
          <Pressable
            style={[styles.button, transferBusy && styles.buttonDisabled]}
            disabled={transferBusy}
            onPress={handleGenerateTransferLink}
          >
            {transferBusy ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Generate Transfer Link</Text>
            )}
          </Pressable>
        ) : (
          <>
            <Text style={styles.label}>Share this with the player's parent:</Text>
            <Text selectable style={styles.code}>
              {transferLink}
            </Text>
          </>
        )}
        {transferError && <Text style={styles.error}>{transferError}</Text>}

        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.replace(`/team/${teamId}`)}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Claim a Player</Text>
      <Text style={styles.hint}>
        Add a player to {context.teamName} under your own account. You can hand ownership off to their
        real parent afterward with a transfer link.
      </Text>

      <Text style={styles.label}>Player's First Name (optional)</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
      <Text style={styles.label}>Player's Last Name (optional)</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />
      <Text style={styles.label}>Uniform Number</Text>
      <TextInput style={styles.input} value={uniformNumber} onChangeText={setUniformNumber} keyboardType="number-pad" />
      <Text style={styles.label}>PlayerTag (optional)</Text>
      <TextInput
        style={styles.input}
        value={playerTag}
        onChangeText={setPlayerTag}
        placeholder="Defaults to an auto-generated tag"
        autoCapitalize="none"
      />
      {submitError && <Text style={styles.error}>{submitError}</Text>}
      <Pressable
        style={[styles.button, (!uniformNumber || submitting) && styles.buttonDisabled]}
        disabled={!uniformNumber || submitting}
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Claim Player</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 18 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
});
