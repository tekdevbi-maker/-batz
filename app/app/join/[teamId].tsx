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
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  getTeamJoinContext,
  registerPlayer,
  joinTeamAsFollower,
  RosterSpotAlreadyClaimedError,
  TeamAtCapacityError,
  type TeamJoinContext,
} from "../../lib/claimRepository";
import Dropdown from "../../components/Dropdown";
import { colors } from "../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function JoinTeamScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const { session: contextSession, signUp } = useAuth();
  // Confirmed via real device testing: this screen doesn't reliably see
  // AuthContext's session update on this same mount right after a fresh
  // signUp() (some context-propagation lag specific to that event,
  // separate from the analogous sign-IN case already fixed on the login
  // screen) -- so handleCreateAccount fetches the session directly and
  // keeps it here, instead of trusting context to flip in time.
  const [localSession, setLocalSession] = useState<Session | null>(null);
  const session = contextSession ?? localSession;

  const [context, setContext] = useState<TeamJoinContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  // Phase 1: account creation (just email/password -- the parent's own
  // name isn't collected anywhere in spec Section 4, only the Player's).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Phase 2: pick a path -- claim a player (Parent) or just follow
  // (Follower, view-only, no player claim).
  const [mode, setMode] = useState<"choose" | "claim" | "follow">("choose");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [unclaimedNumbers, setUnclaimedNumbers] = useState<number[] | null>(null);
  const [uniformNumber, setUniformNumber] = useState<number | null>(null);
  const [playerTag, setPlayerTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ claimedExisting: boolean } | { followed: true } | null>(null);

  useEffect(() => {
    if (!teamId) return;
    getTeamJoinContext(supabase, teamId)
      .then(setContext)
      .catch((err) => setContextError(errorMessage(err)));
  }, [teamId]);

  useEffect(() => {
    if (!teamId || mode !== "claim") return;
    supabase
      .from("roster_entry")
      .select("uniform_number")
      .eq("team_id", teamId)
      .is("player_id", null)
      .order("uniform_number")
      .then(({ data, error }) => {
        if (error) {
          setSubmitError(errorMessage(error));
          return;
        }
        setUnclaimedNumbers((data ?? []).map((r: { uniform_number: number }) => r.uniform_number));
      });
  }, [teamId, mode]);

  async function handleCreateAccount() {
    setCreatingAccount(true);
    setAccountError(null);
    try {
      await signUp(email, password);
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Account created, but no session came back -- try signing in instead.");
      setLocalSession(data.session);
    } catch (err) {
      setAccountError(errorMessage(err));
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleRegisterPlayer() {
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
      setResult({ claimedExisting: res.claimedExisting });
    } catch (err) {
      setSubmitError(
        err instanceof RosterSpotAlreadyClaimedError || err instanceof TeamAtCapacityError
          ? err.message
          : errorMessage(err)
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFollow() {
    if (!session || !teamId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await joinTeamAsFollower(supabase, teamId);
      setResult({ followed: true });
    } catch (err) {
      setSubmitError(err instanceof TeamAtCapacityError ? err.message : errorMessage(err));
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

  if (result) {
    const followedOnly = "followed" in result;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.hint}>
          {followedOnly
            ? "You're following this team -- you can see the Roster, Player Profiles, Team Leaders, and League Leaders any time."
            : result.claimedExisting
              ? "Linked to your player's existing game stats."
              : "Your player is registered -- their stats will show up as the coach imports games."}
        </Text>
        {!followedOnly && (
          <Text style={styles.hint}>
            Make sure to check out Player Settings to fill out the rest of your Player's Info.
          </Text>
        )}
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
      <Text style={styles.hint}>
        Family and friends can follow a player's hitting performance all season, completely free -- it only
        takes a quick GameChanger export from the coach.
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
          <Text style={styles.legalText}>
            By continuing, you agree to our{" "}
            <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
            <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
          </Text>
        </>
      ) : mode === "choose" ? (
        <>
          <Pressable style={styles.button} onPress={() => setMode("claim")}>
            <Text style={styles.buttonText}>Claim a Player</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => setMode("follow")}>
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Just Follow the Team</Text>
          </Pressable>
        </>
      ) : mode === "follow" ? (
        <>
          <Text style={styles.hint}>
            You'll be able to see the Roster, Player Profiles, Team Leaders, and League Leaders -- without
            claiming a player. You can always claim a player later.
          </Text>
          {submitError && <Text style={styles.error}>{submitError}</Text>}
          <Pressable style={[styles.button, submitting && styles.buttonDisabled]} disabled={submitting} onPress={handleFollow}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Follow This Team</Text>}
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => setMode("choose")}>
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
          </Pressable>
        </>
      ) : (
        <>
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
            onPress={handleRegisterPlayer}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Register Player</Text>}
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => setMode("choose")}>
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14 },
  plainText: { color: colors.textPrimary },
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
  legalText: { marginTop: 12, textAlign: "center", fontSize: 13, color: colors.textSecondary },
  legalLink: { color: colors.accent },
});
