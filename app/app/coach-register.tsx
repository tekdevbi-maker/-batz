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
import Dropdown from "../components/Dropdown";
import CategoryTabs from "../components/CategoryTabs";
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

const DIVISIONS = ["Tee Ball", "Minors", "Majors", "Juniors", "Seniors"] as const;
const DIVISION_TABS = DIVISIONS.map((d) => ({ key: d, label: d }));

const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;
const SEASON_TABS = SEASONS.map((s) => ({ key: s, label: s }));

function currentYear(): number {
  return new Date().getFullYear();
}
const YEAR_OPTIONS = Array.from({ length: 9 }, (_, i) => currentYear() - 2 + i);

export default function CoachRegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  // Personal info + credentials -- account isn't created until Complete
  // Registration is pressed (previously this screen created the account
  // the moment "Continue" was tapped, before the coach had even entered
  // their team's info -- a coach who abandoned the second half still ended
  // up with a live, teamless account).
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [leagues, setLeagues] = useState<League[]>([]);
  const [sanctioningBody, setSanctioningBody] = useState<SanctioningBody>(SANCTIONING_BODIES[0]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [enteringNewLeague, setEnteringNewLeague] = useState(false);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivisionTab, setSelectedDivisionTab] = useState<(typeof DIVISIONS)[number] | null>(null);

  const [season, setSeason] = useState<(typeof SEASONS)[number]>("Spring");
  const [year, setYear] = useState<number>(currentYear());
  const [teamName, setTeamName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [pendingLeagueName, setPendingLeagueName] = useState<string | null>(null);

  // Leagues/divisions are readable anonymously (RLS: "anon can read
  // leagues"/"anon can read divisions"), which is what makes it possible to
  // fill out the whole form before an account exists at all.
  useEffect(() => {
    listLeagues(supabase).then(setLeagues).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedLeague) {
      setDivisions([]);
      return;
    }
    listDivisions(supabase, selectedLeague.id).then(setDivisions).catch(() => {});
  }, [selectedLeague]);

  const leagueChosen = enteringNewLeague ? newLeagueName.trim().length > 0 : !!selectedLeague;
  const canSubmit =
    !!firstName &&
    !!lastName &&
    !!email &&
    !!password &&
    leagueChosen &&
    !!selectedDivisionTab &&
    !!teamName.trim() &&
    !submitting;

  async function handleCompleteRegistration() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const userId = await signUp(email, password, { firstName, lastName });

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

      // Reuse an existing division on this league with the same name
      // (e.g. another team already created "Majors" under this league)
      // instead of creating a duplicate row -- division names aren't
      // globally unique, only unique per league (see the schema's
      // `unique (league_id, name)` constraint).
      const existingDivision = divisions.find(
        (d) => d.name.toLowerCase() === selectedDivisionTab!.toLowerCase()
      );
      const divisionId = existingDivision
        ? existingDivision.id
        : (await createDivision(supabase, { leagueId, name: selectedDivisionTab! })).id;

      const team = await createTeam(supabase, {
        divisionId,
        name: teamName.trim(),
        season,
        year,
      });
      await assignPrimaryCoach(supabase, {
        teamId: team.id,
        userId,
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

      <Dropdown
        label="Sanctioning Body"
        options={SANCTIONING_BODIES}
        selected={sanctioningBody}
        onSelect={setSanctioningBody}
      />

      <Dropdown
        label="League Name"
        options={[...leagues.map((l) => l.id), "__other__"] as string[]}
        optionLabels={Object.fromEntries([
          ...leagues.map((l) => [l.id, l.name + (l.verificationStatus === "pending" ? " (pending)" : "")]),
          ["__other__", "Other (new league)..."],
        ])}
        selected={enteringNewLeague ? "__other__" : selectedLeague?.id ?? null}
        onSelect={(id) => {
          if (id === "__other__") {
            setEnteringNewLeague(true);
            setSelectedLeague(null);
          } else {
            setEnteringNewLeague(false);
            setSelectedLeague(leagues.find((l) => l.id === id) ?? null);
          }
          setSelectedDivisionTab(null);
        }}
      />
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
      <CategoryTabs categories={DIVISION_TABS} selectedKey={selectedDivisionTab} onSelect={setSelectedDivisionTab} />

      <Text style={styles.label}>Season</Text>
      <CategoryTabs categories={SEASON_TABS} selectedKey={season} onSelect={setSeason} />

      <Dropdown label="Year" options={YEAR_OPTIONS} selected={year} onSelect={setYear} />

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
      <Text style={styles.legalText}>
        By continuing, you agree to our{" "}
        <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
        <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  legalText: { marginTop: 16, textAlign: "center", fontSize: 13, color: colors.textSecondary },
  legalLink: { color: colors.accent },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14 },
  warning: { color: colors.warningText, backgroundColor: colors.warningBg, padding: 8, borderRadius: 6, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 6,
    fontSize: 14,
    color: colors.textPrimary,
  },
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
});
