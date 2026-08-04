import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { isEmailAvailable } from "../lib/claimRepository";
import { resetDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import FadeIn from "../components/FadeIn";
import AgeAttestationGate from "../components/AgeAttestationGate";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Coach registration wizard, page 1 of 11: identity -- confirms the email
// isn't taken and gates on age attestation before any account is created,
// same order as the plain Sign Up flow.
export default function DevRegisterScreen() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "attest">("form");

  const canSubmit =
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!email.trim() &&
    !!password &&
    password === confirmPassword &&
    !submitting;

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const available = await isEmailAvailable(supabase, email.trim());
      if (!available) {
        setError("An account with this email already exists. Log in instead.");
        return;
      }
      setStep("attest");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleAttestConfirm() {
    resetDevWizardState();
    updateDevWizardState({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
    router.push("/dev-register-intro");
  }

  if (step === "attest") {
    return (
      <>
        <SafeTopSpacer />
        <AgeAttestationGate onConfirm={handleAttestConfirm} onCancel={() => setStep("form")} />
      </>
    );
  }

  return (
    <>
      <SafeTopSpacer />
      <FadeIn>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Register as Coach</Text>
        <Text style={styles.hint}>Create your @Batz account. Team details come next.</Text>

        <Text style={styles.label}>First Name</Text>
        <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />

        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        {!!confirmPassword && password !== confirmPassword && (
          <Text style={styles.error}>Passwords don't match.</Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} disabled={!canSubmit} onPress={handleContinue}>
          {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
      </ScrollView>
      </FadeIn>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8 },
  title: { fontSize: 26, fontFamily: "Montserrat_700Bold", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 8 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 8, color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
});
