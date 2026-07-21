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
import { getTeamJoinContext, type TeamJoinContext } from "../../lib/claimRepository";
import { AlreadyCoachError, CoachCapacityError, joinAsAssistantCoach } from "../../lib/coachesRepository";
import { colors } from "../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function CoachJoinScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const { session, signUp } = useAuth();

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [joinFirstName, setJoinFirstName] = useState("");
  const [joinLastName, setJoinLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

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
      await signUp(email, password, { firstName, lastName });
      setJoinFirstName(firstName);
      setJoinLastName(lastName);
    } catch (err) {
      setAccountError(errorMessage(err));
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleJoin() {
    if (!teamId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await joinAsAssistantCoach(supabase, teamId, joinFirstName, joinLastName);
      setJoined(true);
    } catch (err) {
      setSubmitError(
        err instanceof CoachCapacityError || err instanceof AlreadyCoachError ? err.message : errorMessage(err)
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!teamId) {
    return (
      <View style={styles.container}>
        <Text style={styles.plainText}>No team specified.</Text>
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

  if (joined) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're a coach on {context.teamName}</Text>
        <Pressable style={styles.button} onPress={() => router.replace(`/team/${teamId}`)}>
          <Text style={styles.buttonText}>Go to Team</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Coach {context.teamName}</Text>
      <Text style={styles.hint}>
        {context.leagueName}, {context.divisionName} -- {context.season} {context.year}
      </Text>

      {!session ? (
        <>
          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />
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
            style={[styles.button, (!firstName || !lastName || !email || !password || creatingAccount) && styles.buttonDisabled]}
            disabled={!firstName || !lastName || !email || !password || creatingAccount}
            onPress={handleCreateAccount}
          >
            {creatingAccount ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={joinFirstName} onChangeText={setJoinFirstName} />
          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={joinLastName} onChangeText={setJoinLastName} />
          {submitError && <Text style={styles.error}>{submitError}</Text>}
          <Pressable style={[styles.button, submitting && styles.buttonDisabled]} disabled={submitting} onPress={handleJoin}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Join as Assistant Coach</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 13 },
  plainText: { color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
});
