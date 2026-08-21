import { Text, StyleSheet, ScrollView, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";

// Page 11 of 11 (first of its sub-pages).
export default function DevRegisterCompleteScreen() {
  const router = useRouter();
  const state = getDevWizardState();

  // The newly created team is deliberately excluded from
  // listSameGroupTeams (it's meant for "every OTHER team in the group"),
  // so it's added back in here to show the full current list.
  const allTeams = [{ id: state.createdTeamId ?? "self", name: state.teamName }, ...state.sameGroupTeams];

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          Congratulations Coach {state.firstName} {state.lastName}!
        </Text>

        <Text style={styles.body}>
          Your team has officially joined the {state.leagueName} | {state.sport} | {state.division} |{" "}
          {state.season} {state.year} season!
        </Text>

        <Text style={styles.body}>
          You and your team will be able to see how you stack up against all of the hitters in your
          League and Division. Encourage other coaches to join as well! Here is the current list of
          teams so far:
        </Text>

        <View style={styles.teamList}>
          {allTeams.map((t) => (
            <Text key={t.id} style={styles.teamListItem}>• {t.name}</Text>
          ))}
        </View>

        <View style={styles.spacer} />
        <Pressable style={styles.button} onPress={() => router.push("/dev-register-complete-link")}>
          <Text style={styles.buttonText}>Next</Text>
        </Pressable>
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 4, justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", marginBottom: 8, color: colors.textPrimary },
  body: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 21, marginBottom: 12 },
  teamList: { marginBottom: 12 },
  teamListItem: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textPrimary, paddingVertical: 2 },
  spacer: { minHeight: 24 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});
