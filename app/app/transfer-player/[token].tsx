import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  getPlayerTransferInfo,
  claimPlayerTransfer,
  InvalidTransferTokenError,
  TransferAlreadyUsedError,
  type PlayerTransferInfo,
} from "../../lib/claimRepository";
import { colors } from "../../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function TransferPlayerScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session: contextSession, signUp, signIn } = useAuth();
  // Same session-propagation lag as /join/[teamId] -- fetch directly after
  // signUp/signIn rather than trusting AuthContext to have flipped yet.
  const [localSession, setLocalSession] = useState<Session | null>(null);
  const session = contextSession ?? localSession;

  const [info, setInfo] = useState<PlayerTransferInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!token) return;
    getPlayerTransferInfo(supabase, token)
      .then(setInfo)
      .catch((err) => setInfoError(errorMessage(err)));
  }, [token]);

  async function handleAuth() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (mode === "signup") {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Signed in, but no session came back -- try again.");
      setLocalSession(data.session);
    } catch (err) {
      setAuthError(errorMessage(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleClaim() {
    if (!token) return;
    setClaiming(true);
    setClaimError(null);
    try {
      await claimPlayerTransfer(supabase, token);
      setClaimed(true);
    } catch (err) {
      setClaimError(
        err instanceof TransferAlreadyUsedError || err instanceof InvalidTransferTokenError
          ? err.message
          : errorMessage(err)
      );
    } finally {
      setClaiming(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.plainText}>No transfer link specified.</Text>
      </View>
    );
  }

  if (infoError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Couldn't load this transfer link: {infoError}</Text>
      </View>
    );
  }

  if (!info) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (info.alreadyUsed) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>This link has already been used</Text>
        <Text style={styles.hint}>Ask the coach to generate a new transfer link if you still need one.</Text>
      </View>
    );
  }

  if (claimed) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're all set</Text>
        <Text style={styles.hint}>
          {info.playerDisplayName} on {info.teamName} is now linked to your account.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Go to @Batz</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Claim {info.playerDisplayName}</Text>
      <Text style={styles.hint}>
        #{info.uniformNumber} on {info.teamName}
      </Text>

      {!session ? (
        <>
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeTab, mode === "signin" && styles.modeTabActive]} onPress={() => setMode("signin")}>
              <Text style={[styles.modeTabText, mode === "signin" && styles.modeTabTextActive]}>Log In</Text>
            </Pressable>
            <Pressable style={[styles.modeTab, mode === "signup" && styles.modeTabActive]} onPress={() => setMode("signup")}>
              <Text style={[styles.modeTabText, mode === "signup" && styles.modeTabTextActive]}>Sign Up</Text>
            </Pressable>
          </View>
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
          {authError && <Text style={styles.error}>{authError}</Text>}
          <Pressable
            style={[styles.button, (!email || !password || authBusy) && styles.buttonDisabled]}
            disabled={!email || !password || authBusy}
            onPress={handleAuth}
          >
            {authBusy ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{mode === "signup" ? "Sign Up" : "Log In"}</Text>
            )}
          </Pressable>
          {mode === "signup" && (
            <Text style={styles.legalText}>
              By continuing, you agree to our{" "}
              <Link href="/terms-of-service"><Text style={styles.legalLink}>Terms of Service</Text></Link> and{" "}
              <Link href="/privacy-policy"><Text style={styles.legalLink}>Privacy Policy</Text></Link>.
            </Text>
          )}
        </>
      ) : (
        <>
          {claimError && <Text style={styles.error}>{claimError}</Text>}
          <Pressable style={[styles.button, claiming && styles.buttonDisabled]} disabled={claiming} onPress={handleClaim}>
            {claiming ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Claim Player</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 14 },
  plainText: { color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontWeight: "600", fontSize: 18 },
  legalText: { marginTop: 12, textAlign: "center", fontSize: 13, color: colors.textSecondary },
  legalLink: { color: colors.accent },
  modeRow: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden", marginBottom: 8 },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  modeTabActive: { backgroundColor: colors.accentMuted },
  modeTabText: { color: colors.textSecondary, fontWeight: "600" },
  modeTabTextActive: { color: colors.accent },
});
