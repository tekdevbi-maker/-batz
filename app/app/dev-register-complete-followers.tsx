import { useEffect } from "react";
import { Text, StyleSheet, ScrollView, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { getDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 11 of 11, sub-page 3: "Transfer Player" explainer.
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
          Once you have your Followers, you can connect your Players to the rightful Parent from that
          Player's Profile screen. Simply tap on the Player's Card and select the "Transfer Player" button.
          Only 1 Player/Parent link is allowed to be able to update your Player's demographic... so choose
          wisely!
        </Text>

        <Image
          source={require("../assets/onboarding/transfer-player-tile.jpg")}
          style={styles.screenshot}
          resizeMode="contain"
        />

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
  screenshot: {
    width: "100%",
    height: 220,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  spacer: { minHeight: 24 },
});
