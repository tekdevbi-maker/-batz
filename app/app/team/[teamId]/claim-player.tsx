import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import {
  getTeamJoinContext,
  registerPlayer,
  RosterSpotAlreadyClaimedError,
  type TeamJoinContext,
} from "../../../lib/claimRepository";
import Dropdown from "../../../components/Dropdown";
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
  const [unclaimedNumbers, setUnclaimedNumbers] = useState<number[] | null>(null);
  const [uniformNumber, setUniformNumber] = useState<number | null>(null);
  const [playerTag, setPlayerTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rosterEntryId: string } | null>(null);

  useEffect(() => {
    if (!teamId) return;
    getTeamJoinContext(supabase, teamId)
      .then(setContext)
      .catch((err) => setContextError(errorMessage(err)));
  }, [teamId]);

  // Uniform Number is a closed selection of the team's actual unclaimed
  // roster spots -- a coach can no longer type an arbitrary number that
  // doesn't correspond to a real (imported) roster entry, which used to
  // silently create a brand-new one.
  useEffect(() => {
    if (!teamId) return;
    supabase
      .from("roster_entry")
      .select("uniform_number")
      .eq("team_id", teamId)
      .is("player_id", null)
      .order("uniform_number")
      .then(({ data, error }) => {
        if (error) {
          setContextError(errorMessage(error));
          return;
        }
        setUnclaimedNumbers((data ?? []).map((r: { uniform_number: number }) => r.uniform_number));
      });
  }, [teamId]);

  async function handleSubmit() {
    if (!session || !teamId || !context || uniformNumber == null) return;
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
          uniformNumber,
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
          account, use Team Members to transfer ownership -- from that player's Profile, tap "Transfer to
          Parent".
        </Text>

        <Pressable style={styles.button} onPress={() => router.replace(`/team/${teamId}`)}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Claim a Player</Text>
      <Text style={styles.hint}>
        Add a player to {context.teamName} under your own account. You can hand ownership off to their
        real parent afterward from the player's Profile.
      </Text>

      <Text style={styles.label}>Player's First Name (optional)</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
      <Text style={styles.label}>Player's Last Name (optional)</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />

      {unclaimedNumbers == null ? (
        <ActivityIndicator style={styles.label} />
      ) : unclaimedNumbers.length === 0 ? (
        <>
          <Text style={styles.label}>Uniform Number</Text>
          <Text style={styles.hint}>
            Every roster spot on this team is already claimed -- there's nothing left to claim here.
          </Text>
        </>
      ) : (
        <Dropdown
          label="Uniform Number"
          options={unclaimedNumbers}
          optionLabels={Object.fromEntries(unclaimedNumbers.map((n) => [n, `#${n}`]))}
          selected={uniformNumber}
          onSelect={setUniformNumber}
        />
      )}

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
        style={[styles.button, (uniformNumber == null || submitting) && styles.buttonDisabled]}
        disabled={uniformNumber == null || submitting}
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Claim Player</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 12 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
});
