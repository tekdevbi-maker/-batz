import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../lib/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: "#b91c1c", fontSize: 13 },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#93b4ec" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  link: { marginTop: 12, textAlign: "center" },
  legalText: { marginTop: 16, textAlign: "center", fontSize: 12, color: "#555" },
  legalLink: { color: "#1d4ed8" },
});
