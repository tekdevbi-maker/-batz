import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { getDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import CopyableLink from "../components/CopyableLink";

// Page 11 of 11, sub-page 2: the shareable join link.
export default function DevRegisterCompleteLinkScreen() {
  const router = useRouter();
  const state = getDevWizardState();
  const joinLink = state.createdTeamId ? Linking.createURL(`/join/${state.createdTeamId}`) : "";

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>
          As Head Coach, make sure to send the link below to all of your parents so they can follow your
          team's journey and see their Players' hitting performance throughout the season. You will be
          able to see all of your followers in your Team's Home Page.
        </Text>
        <CopyableLink value={joinLink} />

        <View style={styles.spacer} />
        <WizardNav onBack={() => router.back()} onNext={() => router.push("/dev-register-complete-followers")} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 4, justifyContent: "center" },
  body: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 21, marginBottom: 12 },
  spacer: { minHeight: 24 },
});
