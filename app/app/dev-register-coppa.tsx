import { useState } from "react";
import { Text, StyleSheet, ScrollView, View, Modal, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import WizardNav from "../components/WizardNav";
import TileSelect from "../components/TileSelect";

const COPPA_TEXT =
  "COPPA Compliance & Roster Age Certification\n\n" +
  "I hereby certify and attest that my team is in full compliance with the Children’s Online Privacy " +
  "Protection Act (COPPA). I explicitly confirm that there are no individuals under the age of 13 on this " +
  "roster or participating in team operations. I acknowledge my ongoing responsibility to ensure no personal " +
  "information from children under 13 is introduced to this platform through my team.";

// Page 4 of 12: right before "What league do you represent?" -- if the
// team has no players under 13, the coach must certify COPPA compliance
// via an explicit popup before continuing. The answer is recorded on the
// wizard (hasPlayersUnder13) and is what later decides whether the
// "Transfer to Parent" explainer shows in the completion flow -- "Yes"
// shows it (there are real kids under 13 who'll need a parent claim),
// "No"/certified skips it.
export default function DevRegisterCoppaScreen() {
  const router = useRouter();
  const [showCertify, setShowCertify] = useState(false);

  function proceed(hasPlayersUnder13: boolean) {
    updateDevWizardState({ hasPlayersUnder13 });
    setShowCertify(false);
    router.push("/dev-register-league");
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          Let's get your team set up!{"\n\n"}Will there be <Text style={styles.emphasis}>ANY</Text> children
          under the age of 13 that will be on your team?
        </Text>
        <TileSelect
          options={[
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ]}
          selected={null}
          onSelect={(key) => (key === "yes" ? proceed(true) : setShowCertify(true))}
          columns={2}
        />
        <WizardNav onBack={() => router.back()} />
      </ScrollView>

      <Modal visible={showCertify} transparent animationType="fade" onRequestClose={() => setShowCertify(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>{COPPA_TEXT}</Text>
            </ScrollView>
            <Pressable style={styles.modalCancel} onPress={() => setShowCertify(false)}>
              <Text style={styles.modalCancelText}>Go Back</Text>
            </Pressable>
            <Pressable style={styles.modalAgree} onPress={() => proceed(false)}>
              <Text style={styles.modalAgreeText}>
                I Agree. I certify that my team complies with COPPA regulations and that no children under
                the age of 13 are present on this roster.
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Montserrat_400Regular", marginBottom: 16, color: colors.textPrimary, textAlign: "center" },
  emphasis: { fontFamily: "Montserrat_700Bold", color: colors.error },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 12, width: "100%", maxWidth: 420, maxHeight: "80%" },
  modalScroll: { flexGrow: 0 },
  modalText: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_400Regular", lineHeight: 21 },
  modalCancel: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  modalCancelText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 15 },
  modalAgree: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 12, alignItems: "center" },
  modalAgreeText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 14, textAlign: "center" },
});
