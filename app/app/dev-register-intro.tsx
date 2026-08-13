import { View, Text, Image, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";

// Page 2 of 11: a plain explanation screen before the team-detail
// questions start. No data collected here.
export default function DevRegisterIntroScreen() {
  const router = useRouter();

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          Welcome to <Image source={require("../assets/wordmark-transparent.png")} style={styles.titleLogo} resizeMode="contain" />!
        </Text>
        <Text style={styles.body}>
          @Batz is a free dashboard app built around the game data provided by coaches. You and your
          team will all benefit from the work you've already put in with tracking your players' hitting
          performance. Just import your game stats, and we'll take care of the rest!
        </Text>
        <Text style={styles.emphasis}>
          No Fees. No Subscriptions.
        </Text>
        <Text style={styles.bodyClosing}>
          Keep it fun. Keep your hitters motivated. And watch them improve at every{" "}
          <Image source={require("../assets/favicon.png")} style={styles.inlineThumb} resizeMode="contain" />.
        </Text>
        <Text style={styles.note}>
          If you are the Head Coach of another team, click on "Head Coach? Start New Team!" in the @Batz
          Home screen menu on the top-right.
        </Text>
        <View style={styles.navSpacer}>
          {/* No Back button -- the account (via email verification) already
              exists by this point; going back would only land on the now-
              consumed /verify-email code-entry screen, which doesn't make
              sense to return to. The team itself isn't created until the
              coach finishes this click-through. */}
          <WizardNav onNext={() => router.push("/dev-register-bucketing")} />
        </View>
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontFamily: "Montserrat_700Bold", marginBottom: 12, color: colors.textPrimary, textAlign: "center" },
  titleLogo: { width: 81, height: 36, marginLeft: 4, transform: [{ translateY: 11 }] },
  body: { fontSize: 16, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, marginBottom: 12, lineHeight: 32, textAlign: "center" },
  bodyClosing: { fontSize: 16, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, marginBottom: 12, lineHeight: 32, textAlign: "center" },
  emphasis: { fontSize: 16, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 12, textAlign: "center" },
  note: { fontSize: 14, fontFamily: "Montserrat_400Regular", color: colors.textMuted, marginTop: 4, lineHeight: 20, textAlign: "center" },
  inlineThumb: { width: 38, height: 38, marginLeft: 4, transform: [{ translateY: 10 }] },
  navSpacer: { marginTop: 24 },
});
