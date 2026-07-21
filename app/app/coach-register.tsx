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
import { Link, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import {
  SANCTIONING_BODIES,
  assignPrimaryCoach,
  createDivision,
  createPendingLeague,
  createTeam,
  listDivisions,
  listLeagues,
  type Division,
  type League,
  type SanctioningBody,
} from "../lib/leaguesRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function currentTwoDigitYear(): number {
  return new Date().getFullYear();
}

export default function CoachRegisterScreen() {
  const router = useRouter();
  const { session, signUp } = useAuth();

  // Phase 1: account creation.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Phase 2: league/division/team.
  const [leagues, setLeagues] = useState<League[]>([]);
  const [sanctioningBody, setSanctioningBody] = useState<SanctioningBody>(SANCTIONING_BODIES[0]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [enteringNewLeague, setEnteringNewLeague] = useState(false);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [newDivisionName, setNewDivisionName] = useState("");
  const [enteringNewDivision, setEnteringNewDivision] = useState(false);

  const [season, setSeason] = useState<"Spring" | "Fall">("Spring");
  const [year, setYear] = useState(String(currentTwoDigitYear()));
  const [teamName, setTeamName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [pendingLeagueName, setPendingLeagueName] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listLeagues(supabase).then(setLeagues).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!selectedLeague) {
      setDivisions([]);
      return;
    }
    listDivisions(supabase, selectedLeague.id).then(setDivisions).catch(() => {});
  }, [selectedLeague]);

  async function handleCreateAccount() {
    setCreatingAccount(true);
    setAccountError(null);
    try {
      await signUp(email, password, { firstName, lastName });
    } catch (err) {
      setAccountError(errorMessage(err));
    } finally {
      setCreatingAccount(false);
    }
  }

  const leagueChosen = enteringNewLeague ? newLeagueName.trim().length > 0 : !!selectedLeague;
  const divisionChosen = enteringNewDivision ? newDivisionName.trim().length > 0 : !!selectedDivision;
  const canSubmit =
    leagueChosen && divisionChosen && season && year.length > 0 && teamName.trim().length > 0 && !submitting;

  async function handleCompleteRegistration() {
    if (!session) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let leagueId: string;
      let leagueIsPending = false;
      if (enteringNewLeague) {
        const created = await createPendingLeague(supabase, {
          name: newLeagueName.trim(),
          sanctioningBody,
        });
        leagueId = created.id;
        leagueIsPending = true;
      } else {
        leagueId = selectedLeague!.id;
        leagueIsPending = selectedLeague!.verificationStatus === "pending";
      }

      let divisionId: string;
      if (enteringNewDivision) {
        const created = await createDivision(supabase, { leagueId, name: newDivisionName.trim() });
        divisionId = created.id;
      } else {
        divisionId = selectedDivision!.id;
      }

      const team = await createTeam(supabase, {
        divisionId,
        name: teamName.trim(),
        season,
        year: Number.parseInt(year, 10),
      });
      await assignPrimaryCoach(supabase, {
        teamId: team.id,
        userId: session.user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      setCreatedTeamId(team.id);
      setPendingLeagueName(leagueIsPending ? (enteringNewLeague ? newLeagueName.trim() : selectedLeague!.name) : null);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (createdTeamId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Team registered</Text>
        {pendingLeagueName ? (
          <Text style={styles.warning}>
            "{pendingLeagueName}" is a new league and is pending admin verification. Your team already
            exists, but full visibility to other users waits until it's verified.
          </Text>
        ) : (
          <Text style={styles.hint}>Your league is already verified -- you're all set.</Text>
        )}
        <Text style={styles.label}>Share this with parents to join your team:</Text>
        <Text selectable style={styles.code}>
          {Linking.createURL(`/join/${createdTeamId}`)}
        </Text>
        <Text style={styles.hint}>
          Paste this into your own welcome message to parents (text, email, whatever you'd already
          send) -- the app never sends it for you.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Register as Coach</Text>
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
            (!firstName || !lastName || !email || !password || creatingAccount) && styles.buttonDisabled,
          ]}
          disabled={!firstName || !lastName || !email || !password || creatingAccount}
          onPress={handleCreateAccount}
        >
          {creatingAccount ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </Pressable>
        <Text style={styles.legalText}>
          By continuing, you agree to our{" "}
          <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
          <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set Up Your Team</Text>

      <Text style={styles.label}>Sanctioning Body</Text>
      <View style={styles.chipRow}>
        {SANCTIONING_BODIES.map((body) => (
          <Pressable
            key={body}
            style={[styles.chip, sanctioningBody === body && styles.chipSelected]}
            onPress={() => setSanctioningBody(body)}
          >
            <Text style={styles.chipText}>{body}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>League Name</Text>
      <View style={styles.chipRow}>
        {leagues.map((league) => (
          <Pressable
            key={league.id}
            style={[styles.chip, selectedLeague?.id === league.id && !enteringNewLeague && styles.chipSelected]}
            onPress={() => {
              setSelectedLeague(league);
              setEnteringNewLeague(false);
              setSelectedDivision(null);
            }}
          >
            <Text style={styles.chipText}>
              {league.name}
              {league.verificationStatus === "pending" ? " (pending)" : ""}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, enteringNewLeague && styles.chipSelected]}
          onPress={() => {
            setEnteringNewLeague(true);
            setSelectedLeague(null);
            setSelectedDivision(null);
          }}
        >
          <Text style={styles.chipText}>Other...</Text>
        </Pressable>
      </View>
      {enteringNewLeague && (
        <>
          <TextInput
            style={styles.input}
            value={newLeagueName}
            onChangeText={setNewLeagueName}
            placeholder="League name"
          />
          <Text style={styles.hint}>New leagues are held for admin verification before they're public.</Text>
        </>
      )}

      <Text style={styles.label}>Division</Text>
      <View style={styles.chipRow}>
        {divisions.map((division) => (
          <Pressable
            key={division.id}
            style={[
              styles.chip,
              selectedDivision?.id === division.id && !enteringNewDivision && styles.chipSelected,
            ]}
            onPress={() => {
              setSelectedDivision(division);
              setEnteringNewDivision(false);
            }}
          >
            <Text style={styles.chipText}>{division.name}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, enteringNewDivision && styles.chipSelected]}
          onPress={() => {
            setEnteringNewDivision(true);
            setSelectedDivision(null);
          }}
        >
          <Text style={styles.chipText}>Other...</Text>
        </Pressable>
      </View>
      {enteringNewDivision && (
        <TextInput
          style={styles.input}
          value={newDivisionName}
          onChangeText={setNewDivisionName}
          placeholder="e.g. 12U"
        />
      )}

      <Text style={styles.label}>Season</Text>
      <View style={styles.chipRow}>
        {(["Spring", "Fall"] as const).map((s) => (
          <Pressable key={s} style={[styles.chip, season === s && styles.chipSelected]} onPress={() => setSeason(s)}>
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Year</Text>
      <TextInput style={styles.input} value={year} onChangeText={setYear} keyboardType="number-pad" />

      <Text style={styles.label}>Team Name</Text>
      <TextInput style={styles.input} value={teamName} onChangeText={setTeamName} placeholder="Team name" />

      {submitError && <Text style={styles.error}>{submitError}</Text>}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={handleCompleteRegistration}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Complete Registration</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  legalText: { marginTop: 16, textAlign: "center", fontSize: 12, color: colors.textSecondary },
  legalLink: { color: colors.accent },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13 },
  warning: { color: colors.warningText, backgroundColor: colors.warningBg, padding: 8, borderRadius: 6, fontSize: 13 },
  error: { color: colors.error, fontSize: 13 },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textPrimary },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
});
