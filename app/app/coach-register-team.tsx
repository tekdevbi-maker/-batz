import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import AgeAttestationGate from "../components/AgeAttestationGate";
import Dropdown from "../components/Dropdown";
import CategoryTabs from "../components/CategoryTabs";
import CopyableLink from "../components/CopyableLink";
import { takePendingCoachRegistration, type PendingCoachRegistration } from "../lib/pendingCoachRegistration";
import {
  assignPrimaryCoach,
  createDivision,
  createPendingLeague,
  createTeam,
  listDivisions,
  listLeagues,
  type Division,
  type League,
} from "../lib/leaguesRepository";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const DIVISIONS = ["Tee Ball", "Rookies", "Minors", "Majors", "Juniors", "Seniors"] as const;
const DIVISION_TABS = DIVISIONS.map((d) => ({ key: d, label: d }));

const SPORTS = ["Baseball", "Softball"] as const;
const SPORT_TABS = SPORTS.map((s) => ({ key: s, label: s }));

const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;
const SEASON_TABS = SEASONS.map((s) => ({ key: s, label: s }));

function currentYear(): number {
  return new Date().getFullYear();
}
const YEAR_OPTIONS = Array.from({ length: 9 }, (_, i) => currentYear() - 2 + i);

// Page 2 of 2 for Coach Register: team details. The account itself is only
// ever created here, at "Complete Registration" -- page 1 ("Continue to
// Team Registration") just verified the email wasn't taken. The identity
// fields it collected arrive via pendingCoachRegistration (in-memory only,
// never router params -- see that file for why), consumed exactly once;
// landing here without them (e.g. a deep link, or a reload mid-flow) sends
// the coach back to page 1 to start over.
export default function CoachRegisterTeamScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [identity] = useState<PendingCoachRegistration | null>(() => takePendingCoachRegistration());

  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [enteringNewLeague, setEnteringNewLeague] = useState(false);

  const [sport, setSport] = useState<(typeof SPORTS)[number]>("Baseball");

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivisionTab, setSelectedDivisionTab] = useState<(typeof DIVISIONS)[number] | null>(null);

  const [season, setSeason] = useState<(typeof SEASONS)[number]>("Spring");
  const [year, setYear] = useState<number>(currentYear());
  const [teamName, setTeamName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [pendingLeagueName, setPendingLeagueName] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "attest">("form");

  useEffect(() => {
    if (!identity) {
      router.replace("/coach-register");
    }
  }, [identity, router]);

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
  const canSubmit = leagueChosen && !!selectedDivisionTab && !!teamName.trim() && !submitting;

  async function handleCompleteRegistration() {
    if (!identity) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const userId = await signUp(identity.email, identity.password, {
        firstName: identity.firstName,
        lastName: identity.lastName,
      });

      let leagueId: string;
      let leagueIsPending = false;
      if (enteringNewLeague) {
        const created = await createPendingLeague(supabase, { name: newLeagueName.trim() });
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
        sport,
        season,
        year,
      });
      await assignPrimaryCoach(supabase, {
        teamId: team.id,
        userId,
        firstName: identity.firstName,
        lastName: identity.lastName,
      });

      setCreatedTeamId(team.id);
      setPendingLeagueName(leagueIsPending ? (enteringNewLeague ? newLeagueName.trim() : selectedLeague!.name) : null);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!identity) return null;

  if (step === "attest") {
    return (
      <>
        <SafeTopSpacer />
        <AgeAttestationGate
          confirming={submitting}
          onConfirm={handleCompleteRegistration}
          onCancel={() => setStep("form")}
        />
      </>
    );
  }

  if (createdTeamId) {
    return (
      <>
        <SafeTopSpacer />
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
          <CopyableLink value={Linking.createURL(`/join/${createdTeamId}`)} />
          <Text style={styles.hint}>
            Paste this into your own welcome message to parents (text, email, whatever you'd already
            send) -- the app never sends it for you.
          </Text>
          <Pressable style={styles.button} onPress={() => router.replace("/")}>
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <SafeTopSpacer />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Team Registration</Text>
        <Text style={styles.hint}>Registering as {identity.firstName} {identity.lastName} ({identity.email})</Text>

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

        <Text style={styles.label}>Sport</Text>
        <CategoryTabs categories={SPORT_TABS} selectedKey={sport} onSelect={setSport} />

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
          onPress={() => setStep("attest")}
        >
          <Text style={styles.buttonText}>Complete Registration</Text>
        </Pressable>
        <Text style={styles.legalText}>
          By continuing, you agree to our{" "}
          <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
          <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", marginBottom: 4, color: colors.textPrimary },
  legalText: { marginTop: 16, textAlign: "center", fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary },
  legalLink: { color: colors.accent, fontFamily: "Montserrat_400Regular" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  warning: { color: colors.warningText, backgroundColor: colors.warningBg, padding: 8, borderRadius: 6, fontSize: 14, fontFamily: "Montserrat_400Regular" },
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
});
