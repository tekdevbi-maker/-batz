import { useState } from "react";
import { Text, StyleSheet, ScrollView, View, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import {
  assignPrimaryCoach,
  createDivision,
  createPendingLeague,
  createTeam,
  listDivisions,
  listSameGroupTeams,
} from "../lib/leaguesRepository";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Page 10 of 11: "Please confirm all your selections below." This is where
// the account and team actually get created -- everything before this
// point was just collecting answers in memory.
export default function DevRegisterConfirmScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const state = getDevWizardState();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setSubmitting(true);
    setError(null);
    try {
      const userId = await signUp(state.email, state.password, {
        firstName: state.firstName,
        lastName: state.lastName,
      });

      let leagueId: string;
      if (state.isNewLeague) {
        const created = await createPendingLeague(supabase, { name: state.leagueName!.trim() });
        leagueId = created.id;
      } else {
        leagueId = state.leagueId!;
      }

      const divisions = await listDivisions(supabase, leagueId);
      const existingDivision = divisions.find((d) => d.name.toLowerCase() === state.division!.toLowerCase());
      const divisionId = existingDivision
        ? existingDivision.id
        : (await createDivision(supabase, { leagueId, name: state.division! })).id;

      const team = await createTeam(supabase, {
        divisionId,
        name: state.teamName,
        sport: state.sport!,
        season: state.season!,
        year: state.year!,
        isActive: !state.isHistorical,
      });
      await assignPrimaryCoach(supabase, {
        teamId: team.id,
        userId,
        firstName: state.firstName,
        lastName: state.lastName,
      });

      const sameGroupTeams = state.isHistorical
        ? []
        : await listSameGroupTeams(supabase, {
            divisionId,
            sport: state.sport!,
            season: state.season!,
            year: state.year!,
            excludeTeamId: team.id,
          });

      updateDevWizardState({ createdTeamId: team.id, sameGroupTeams });
      router.push("/dev-register-complete");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const rows: [string, string][] = [
    ["League", state.leagueName ?? ""],
    ["Sport", state.sport ?? ""],
    ["Classification", state.competesRecBall ? "Recreation" : "Competitive"],
    ["Division", state.division ?? ""],
    ["Season", `${state.season} ${state.year}`],
    ["Team Name", state.teamName],
  ];

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Please confirm all your selections below:</Text>

        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
          </View>
        ))}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.buttonRow}>
          <Pressable style={styles.editButton} disabled={submitting} onPress={() => router.push("/dev-register-league")}>
            <Text style={styles.editText}>Edit Choices</Text>
          </Pressable>
          <Pressable style={[styles.completeButton, submitting && styles.completeDisabled]} disabled={submitting} onPress={handleComplete}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.completeText}>Complete Registration</Text>}
          </Pressable>
        </View>
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", flex: 0.7, textAlign: "right", marginRight: 12 },
  rowValue: { color: colors.textPrimary, fontSize: 14, fontFamily: "Montserrat_600SemiBold", flex: 1.3, textAlign: "left" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular", marginTop: 12 },
  buttonRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 12 },
  editButton: { flex: 0, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center", backgroundColor: colors.surface },
  editText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 15 },
  completeButton: { flex: 0, paddingHorizontal: 20, backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  completeDisabled: { backgroundColor: colors.accentDisabled },
  completeText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 15 },
});
