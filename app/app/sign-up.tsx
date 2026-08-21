import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";
import AgeAttestationGate from "../components/AgeAttestationGate";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Bare-bones account with no team attached -- for a parent/fan who isn't
// claiming a player or coaching yet. Coaches use /dev-register instead
// (which gathers the same identity fields plus their team in one flow);
// this is the plain "just an account" path linked from the Log In screen.
export default function SignUpScreen() {
  const { session, signUp } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "attest">("form");

  // No longer waits on `session` -- email confirmation is required, so
  // signUp() doesn't return an active session anymore. Success now means
  // routing straight to /verify-email instead.
  useEffect(() => {
    if (session) {
      router.replace("/");
    }
  }, [session, router]);

  const canSubmit =
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!email.trim() &&
    !!password &&
    password === confirmPassword &&
    !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await signUp(email.trim(), password, { firstName: firstName.trim(), lastName: lastName.trim() });
      router.push({ pathname: "/verify-email", params: { email: email.trim() } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "attest") {
    return (
      <>
        <SafeTopSpacer />
        <AgeAttestationGate
          confirming={submitting}
          error={error}
          onConfirm={handleSubmit}
          onCancel={() => router.replace("/login")}
        />
      </>
    );
  }

  return (
    <>
      <SafeTopSpacer />
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sign Up</Text>
      <Text style={styles.hint}>Create your @Batz account. You can join or register a team afterward.</Text>

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

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={() => setStep("attest")}
      >
        <Text style={styles.buttonText}>Continue Registration</Text>
      </Pressable>

      <Link href="/login" style={styles.link}>
        <Text>Already have an account? Log in</Text>
      </Link>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  link: { marginTop: 16, textAlign: "center", color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
});
