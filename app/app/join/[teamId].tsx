import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { getTeamJoinContext, joinTeamAsFollower, TeamAtCapacityError, type TeamJoinContext } from "../../lib/claimRepository";
import { colors } from "../../lib/theme";
import AgeAttestationGate from "../../components/AgeAttestationGate";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// The team join link only ever adds a Follower (view-only: Roster, Player
// Profiles, Team Leaders, League Leaders, no player claim). Claiming a
// player is a separate, coach-initiated action (Team Members ->
// Claim/Transfer), not something a new member does at sign-up time.
export default function JoinTeamScreen() {
  const { teamId, resume, firstName: resumeFirstName, lastName: resumeLastName } = useLocalSearchParams<{
    teamId: string;
    resume?: string;
    firstName?: string;
    lastName?: string;
  }>();
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

  // Account creation. firstName/lastName default from the resume params --
  // email confirmation is required now, so a fresh signUp() no longer
  // returns a session; this screen hands off to /verify-email and, once
  // confirmed, gets navigated straight back here with these round-tripped
  // through the URL (local component state doesn't survive that
  // navigate-away-and-back cycle).
  const [firstName, setFirstName] = useState(resumeFirstName ?? "");
  const [lastName, setLastName] = useState(resumeLastName ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [followed, setFollowed] = useState(false);
  const [step, setStep] = useState<"form" | "attest">("form");

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
      // No active session yet -- email confirmation is required. Hand off
      // to /verify-email, round-tripping first/last name through the URL
      // since this screen unmounts (and its local state resets) in the
      // meantime; once confirmed it comes straight back here with
      // ?resume=1 and the effect below finishes joining automatically.
      router.push({
        pathname: "/verify-email",
        params: {
          email,
          next: `/join/${teamId}?resume=1&firstName=${encodeURIComponent(firstName.trim())}&lastName=${encodeURIComponent(lastName.trim())}`,
        },
      });
    } catch (err) {
      setAccountError(errorMessage(err));
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleFollow() {
    if (!session || !teamId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await joinTeamAsFollower(supabase, teamId, firstName.trim(), lastName.trim());
      setFollowed(true);
    } catch (err) {
      setSubmitError(err instanceof TeamAtCapacityError ? err.message : errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const resumedRef = useRef(false);
  useEffect(() => {
    if (resume === "1" && session && context && !followed && !resumedRef.current) {
      resumedRef.current = true;
      handleFollow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, session, context]);

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

  if (step === "attest") {
    return (
      <AgeAttestationGate
        confirming={creatingAccount}
        error={accountError}
        onConfirm={handleCreateAccount}
        onCancel={() => setStep("form")}
      />
    );
  }

  if (followed) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.hint}>
          You're following this team -- you can see the Roster, Player Profiles, Team Leaders, and League
          Leaders any time.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Go to @Batz</Text>
        </Pressable>
      </View>
    );
  }

  const coachName =
    context.coachFirstName || context.coachLastName
      ? `Coach ${`${context.coachFirstName ?? ""} ${context.coachLastName ?? ""}`.trim()}`
      : "your coach";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        Join the {context.leagueInitials} | {context.divisionName} | {context.teamName}
      </Text>
      <Text style={styles.hint}>
        You have been invited by {coachName} to follow the {context.teamName} during their{" "}
        {context.season} {context.year}! This is open to all family and friends to follow the team's
        hitting performance all season long for FREE! Just fill out the information below and follow each
        player's progression all season long.
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
            style={[
              styles.button,
              (!firstName.trim() || !lastName.trim() || !email || !password || creatingAccount) &&
                styles.buttonDisabled,
            ]}
            disabled={!firstName.trim() || !lastName.trim() || !email || !password || creatingAccount}
            onPress={() => setStep("attest")}
          >
            <Text style={styles.buttonText}>Continue Registration</Text>
          </Pressable>
          <Text style={styles.legalText}>
            By continuing, you agree to our{" "}
            <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
            <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
          </Text>
        </>
      ) : (
        <>
          {submitError && <Text style={styles.error}>{submitError}</Text>}
          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            disabled={submitting}
            onPress={handleFollow}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Follow This Team</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 12 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
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
  legalText: { marginTop: 12, textAlign: "center", fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  legalLink: { color: colors.accent, fontFamily: "Montserrat_400Regular" },
});
