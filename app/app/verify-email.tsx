import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Landed on right after signUp() -- email confirmation is required
// (Supabase Auth "Confirm email" is on), so signUp() no longer returns an
// active session. This screen is what actually completes sign-up: entering
// the 6-digit code emailed to them both verifies the address and logs
// them in (verifySignUpCode returns a real session via onAuthStateChange).
export default function VerifyEmailScreen() {
  const { verifySignUpCode, resendSignUpCode } = useAuth();
  const router = useRouter();
  const { email, next } = useLocalSearchParams<{ email: string; next?: string }>();

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleVerify() {
    if (!email) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifySignUpCode(email, code.trim());
      router.replace((next as any) ?? "/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setResending(true);
    setError(null);
    setResendMessage(null);
    try {
      await resendSignUpCode(email);
      setResendMessage("A new code has been sent.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <SafeTopSpacer />
      <View style={styles.container}>
        <Text style={styles.title}>Check Your Email</Text>
        <Text style={styles.body}>
          We sent a 6-digit code to <Text style={styles.emphasis}>{email}</Text>. Enter it below to finish
          creating your account.
        </Text>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          placeholderTextColor={colors.textMuted}
          autoFocus
        />

        {error && <Text style={styles.error}>{error}</Text>}
        {resendMessage && <Text style={styles.hint}>{resendMessage}</Text>}

        <Pressable
          style={[styles.button, (submitting || code.trim().length < 6) && styles.buttonDisabled]}
          disabled={submitting || code.trim().length < 6}
          onPress={handleVerify}
        >
          {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Verify</Text>}
        </Pressable>

        <Pressable style={styles.resendButton} disabled={resending} onPress={handleResend}>
          <Text style={styles.resendText}>{resending ? "Sending…" : "Resend code"}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 24, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, textAlign: "center" },
  body: { fontSize: 16, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, lineHeight: 22, textAlign: "center" },
  emphasis: { fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 24,
    fontFamily: "Montserrat_700Bold",
    textAlign: "center",
    letterSpacing: 8,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    marginTop: 8,
  },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular", textAlign: "center" },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", textAlign: "center" },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  resendButton: { alignItems: "center", padding: 8 },
  resendText: { color: colors.accent, fontFamily: "Montserrat_600SemiBold", fontSize: 15 },
});
