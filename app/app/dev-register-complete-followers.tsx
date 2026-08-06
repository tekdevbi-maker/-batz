import { useEffect } from "react";
import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 11 of 11, sub-page 3: "Transfer to Parent" explainer.
// TODO(backlog): drop a real screenshot of the Roster card's "Transfer to
// Parent" button into the placeholder box below once available.
export default function DevRegisterCompleteFollowersScreen() {
  const router = useRouter();
  const { hasPlayersUnder13 } = getDevWizardState();
  // Gated on the COPPA screen's answer, not division -- "Yes" (there ARE
  // kids under 13) is what actually implies a coach-fallback roster spot
  // needing a parent claim later; "No"/certified skips it.
  const applies = hasPlayersUnder13 === true;

  useEffect(() => {
    if (!applies) router.replace("/dev-register-complete-multiteam");
  }, [applies, router]);

  if (!applies) return null;

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>
          Once you have your Followers, you can connect your Players to the rightful Parent in the Roster
          screen. Simply click on the Player's Card and select the "Transfer to Follower" button at the top
          of the screen. Only 1 Player/Parent link is allowed to be able to update your Player's
          demographic... so choose wisely!
        </Text>

        <View style={styles.screenshotPlaceholder}>
          <Text style={styles.screenshotLabel}>Screenshot coming soon</Text>
        </View>

        <View style={styles.spacer} />
        <WizardNav onBack={() => router.back()} onNext={() => router.push("/dev-register-complete-multiteam")} />
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 4, justifyContent: "center" },
  body: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 21, marginBottom: 12 },
  screenshotPlaceholder: {
    height: 220,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  screenshotLabel: { color: colors.textMuted, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  spacer: { minHeight: 24 },
});
