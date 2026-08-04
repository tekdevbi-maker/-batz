import { Text, StyleSheet, ScrollView, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { getDevWizardState, resetDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import CopyableLink from "../components/CopyableLink";

// Page 11 of 11 (first of its sub-pages). Historical-stats registrations
// (Inactive, excluded from leaderboards) skip the competitive "how you
// stack up" messaging entirely and get a short, simple confirmation
// instead -- unified across both paths that can lead to a historical
// registration, and kept as a single page (nothing to split).
export default function DevRegisterCompleteScreen() {
  const router = useRouter();
  const state = getDevWizardState();
  const joinLink = state.createdTeamId ? Linking.createURL(`/join/${state.createdTeamId}`) : "";

  function handleDone() {
    resetDevWizardState();
    router.replace("/");
  }

  if (state.isHistorical) {
    return (
      <>
        <SafeTopSpacer />
        <FadeIn>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Team registered for historical record-keeping</Text>
          <Text style={styles.body}>
            "{state.teamName}" has been created as an Inactive team -- it won't appear on any leaderboard
            or count toward other teams' standings, since it's just here to preserve past stats.
          </Text>
          <Text style={styles.label}>Share this with parents to join and claim their Player:</Text>
          <CopyableLink value={joinLink} />
          <View style={styles.spacer} />
          <Pressable style={styles.button} onPress={handleDone}>
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </ScrollView>
        </FadeIn>
      </>
    );
  }

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
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 8, color: colors.textPrimary },
  teamList: { marginBottom: 12 },
  teamListItem: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textPrimary, paddingVertical: 2 },
  spacer: { minHeight: 24 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});
