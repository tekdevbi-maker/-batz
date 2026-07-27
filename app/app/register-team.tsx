import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useRequireAuth } from "../lib/AuthContext";
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

// For a coach who already has an account (e.g. one kid in Majors, another
// in Minors) and needs to become Head Coach of a second, separate team.
// Reuses the same league/division/season/team-name picker as
// coach-register.tsx, minus the account-creation step -- createTeam() and
// assignPrimaryCoach() only ever needed a userId, so this signed-in path
// was always possible at the data layer, just missing a screen.
export default function RegisterTeamScreen() {
  const router = useRouter();
  const { session } = useRequireAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

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
    !!firstName && !!lastName && leagueChosen && !!selectedDivisionTab && !!teamName.trim() && !submitting;

  async function handleSubmit() {
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

  if (!session) return null;

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
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Register a New Team</Text>
      <Text style={styles.hint}>
        Already coach a team here? Use this to become Head Coach of a second, separate team -- e.g. one
        kid in Majors, another in Minors.
      </Text>

      <Text style={styles.label}>Your First Name</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
      <Text style={styles.label}>Your Last Name</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />

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
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Register Team</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 8 },
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
