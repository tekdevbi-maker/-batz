import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function ResetPasswordScreen() {
  const { session, isPasswordRecovery, loading, completePasswordReset } = useAuth();
  const router = useRouter();
  const { token_hash: tokenHash, type } = useLocalSearchParams<{ token_hash?: string; type?: string }>();

  const [verifying, setVerifying] = useState(!!tokenHash);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verifies the recovery token directly from query params via
  // verifyOtp(), rather than relying on detectSessionInUrl's URL-fragment
  // auto-parsing (which only works on web and only after a round trip
  // through Supabase's own /auth/v1/verify redirect). This is the
  // documented cross-platform-correct approach and is what the email
  // template should link to: {{ .SiteURL }}/reset-password?token_hash=
  // {{ .TokenHash }}&type=recovery
  useEffect(() => {
    if (!tokenHash || type !== "recovery") {
      setVerifying(false);
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error }) => {
      if (error) setVerifyError(errorMessage(error));
      setVerifying(false);
    });
  }, [tokenHash, type]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await completePasswordReset(password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || verifying) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Password updated</Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Continue to @Batz</Text>
        </Pressable>
      </View>
    );
  }

  // Recovery sessions come from clicking the emailed link (spec Section
  // 10: "standard password reset / account recovery flow") -- without one,
  // there's no verified request to act on, so this doesn't fall back to
  // treating an unrelated signed-in session as authorization to reset.
  if (verifyError || !isPasswordRecovery || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No password reset in progress</Text>
        <Text style={styles.hint}>
          {verifyError ?? "Use the link from your password reset email to get here."}
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/forgot-password")}>
          <Text style={styles.buttonText}>Request a reset link</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose a New Password</Text>
      <TextInput style={styles.input} placeholder="New password" value={password} onChangeText={setPassword} secureTextEntry />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (!password || submitting) && styles.buttonDisabled]}
        disabled={!password || submitting}
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Update Password</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  error: { color: colors.error, fontSize: 14 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 18 },
});
