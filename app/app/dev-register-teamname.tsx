import { useState } from "react";
import { Text, TextInput, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { findDuplicateTeamNames, type DuplicateTeamMatch } from "../lib/leaguesRepository";
import { getDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 9 of 11: "What is your Team Name?"
export default function DevRegisterTeamNameScreen() {
  const router = useRouter();
  const state = getDevWizardState();
  const [teamName, setTeamName] = useState(state.teamName);
  const [checking, setChecking] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateTeamMatch[]>([]);

  function proceed(finalName: string) {
    updateDevWizardState({ teamName: finalName });
    router.push("/dev-register-confirm");
  }

  async function handleNext() {
    const trimmed = teamName.trim();
    setDuplicateWarning(null);
    setDuplicateMatches([]);

    // A brand-new League/Division can't already contain a team, so the
    // duplicate check only matters when reusing an existing League.
    if (state.isNewLeague || !state.leagueId) {
      proceed(trimmed);
      return;
    }

    setChecking(true);
    try {
      const matches = await findDuplicateTeamNames(supabase, {
        leagueId: state.leagueId,
        divisionName: state.division!,
        sport: state.sport!,
        season: state.season!,
        year: state.year!,
        name: trimmed,
      });
      if (matches.length > 0) {
        // Auto-append the disambiguating suffix directly to what's already
        // typed rather than making the user tap a button to accept it.
        const suggestion = `${trimmed} (Coach ${state.lastName})`;
        setTeamName(suggestion);
        setDuplicateMatches(matches);
        setDuplicateWarning(
          `A team with the same name has already been created for the ${state.division} division ` +
            `during this ${state.season} ${state.year} season.`
        );
        return;
      }
    } finally {
      setChecking(false);
    }

    proceed(trimmed);
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>What is your Team Name?</Text>
        <TextInput
          style={styles.input}
          value={teamName}
          onChangeText={(text) => {
            setTeamName(text);
            setDuplicateWarning(null);
            setDuplicateMatches([]);
          }}
          placeholder="Team name"
          autoFocus
        />

        {duplicateWarning && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>{duplicateWarning}</Text>
            <View style={styles.matchList}>
              {duplicateMatches.map((m, i) => (
                <Text key={i} style={styles.matchItem}>
                  • {m.name} - Head Coach {m.coachFirstName ?? "Unknown"}
                  {m.coachLastInitial ? ` ${m.coachLastInitial}` : ""}
                </Text>
              ))}
            </View>
            <Text style={styles.warningQuestion}>
              Would you like to use the name suggested? If not, please use a different name.
            </Text>
          </View>
        )}

        <WizardNav
          onBack={() => router.back()}
          onNext={handleNext}
          nextDisabled={!teamName.trim() || checking}
          nextLabel={checking ? "Checking..." : "Confirm Selections"}
          centered
        />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_700Bold", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  warningBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warningText,
    backgroundColor: colors.warningBg,
  },
  warningText: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.warningText, lineHeight: 20 },
  matchList: { marginTop: 8 },
  matchItem: { fontSize: 14, fontFamily: "Montserrat_600SemiBold", color: colors.warningText, paddingVertical: 2 },
  warningQuestion: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.warningText, lineHeight: 20, marginTop: 8 },
});
