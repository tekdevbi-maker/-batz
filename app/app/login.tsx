import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";

export default function LoginScreen() {
  const { session, signIn } = useAuth();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigate off this screen only once AuthContext's session state has
  // actually updated -- not right after signIn()'s promise resolves.
  // Supabase updates the session via a separate async onAuthStateChange
  // event, so replacing the route immediately after signIn() can land on
  // the next screen before React has re-rendered with the new session,
  // which bounces straight back to /login via useRequireAuth (looks like
  // login silently does nothing: spinner runs, then you're right back
  // where you started).
  useEffect(() => {
    if (session) {
      router.replace(returnTo || "/");
    }
  }, [session, returnTo, router]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log In</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (!email || !password || submitting) && styles.buttonDisabled]}
        disabled={!email || !password || submitting}
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Log In</Text>}
      </Pressable>
      <Link href="/coach-register" style={styles.link}>
        <Text>New coach? Register your team</Text>
      </Link>
      <Link href="/forgot-password" style={styles.link}>
        <Text>Forgot password?</Text>
      </Link>
      <Text style={styles.legalText}>
        By continuing, you agree to our{" "}
        <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
        <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  error: { color: colors.error, fontSize: 13 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  link: { marginTop: 12, textAlign: "center", color: colors.textPrimary },
  legalText: { marginTop: 16, textAlign: "center", fontSize: 12, color: colors.textSecondary },
  legalLink: { color: colors.accent },
});
