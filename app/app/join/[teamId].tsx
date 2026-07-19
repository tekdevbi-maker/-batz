import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  getTeamJoinContext,
  registerPlayer,
  RosterSpotAlreadyClaimedError,
  type TeamJoinContext,
} from "../../lib/claimRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function JoinTeamScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const { session, signUp } = useAuth();

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  // Phase 1: account creation (just email/password -- the parent's own
  // name isn't collected anywhere in spec Section 4, only the Player's).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Phase 2: Player registration.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [uniformNumber, setUniformNumber] = useState("");
  const [playerTag, setPlayerTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ claimedExisting: boolean } | null>(null);

  useEffect(() => {
    if (!teamId) return;
    getTeamJoinContext(supabase, teamId)
      .then(setContext)
      .catch((err) => setContextError(errorMessage(err)));
  }, [teamId]);

  async function handleCreateAccount() {
    setCreatingAccount(true);
    setAccountError(null);
    try {
      await signUp(email, password);
    } catch (err) {
      setAccountError(errorMessage(err));
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleRegisterPlayer() {
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
      setResult({ claimedExisting: res.claimedExisting });
    } catch (err) {
      setSubmitError(
        err instanceof RosterSpotAlreadyClaimedError ? err.message : errorMessage(err)
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!teamId) {
    return (
      <View style={styles.container}>
        <Text>No team specified.</Text>
      </View>
    );
  }

  if (contextError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Couldn't load this team's invite: {contextError}</Text>
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
      <View style={styles.container}>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.hint}>
          {result.claimedExisting
            ? "Linked to your player's existing game stats."
            : "Your player is registered -- their stats will show up as the coach imports games."}
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Go to @Batz</Text>
        </Pressable>
      </View>
    );
  }

  const coachName =
    context.coachFirstName || context.coachLastName
      ? `${context.coachFirstName ?? ""} ${context.coachLastName ?? ""}`.trim()
      : "your coach";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Join {context.teamName}</Text>
      <Text style={styles.hint}>
        Invited by {coachName} -- {context.leagueName}, {context.divisionName}, {context.season}{" "}
        {context.year}
      </Text>

      {!session ? (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
          {accountError && <Text style={styles.error}>{accountError}</Text>}
          <Pressable
            style={[styles.button, (!email || !password || creatingAccount) && styles.buttonDisabled]}
            disabled={!email || !password || creatingAccount}
            onPress={handleCreateAccount}
          >
            {creatingAccount ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>Player's First Name (optional)</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
          <Text style={styles.label}>Player's Last Name (optional)</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />
          <Text style={styles.label}>Uniform Number</Text>
          <TextInput
            style={styles.input}
            value={uniformNumber}
            onChangeText={setUniformNumber}
            keyboardType="number-pad"
          />
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
            onPress={handleRegisterPlayer}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Register Player</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  hint: { color: "#555", fontSize: 13, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  error: { color: "#b91c1c", fontSize: 13 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: "#93b4ec" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
});
