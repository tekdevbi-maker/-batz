import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { updateEmail, updateName, deleteMyAccount, HeadCoachOfActiveTeamError } from "../lib/accountRepository";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function UserSettingsScreen() {
  const { session, completePasswordReset, signOut } = useRequireAuth();
  const router = useRouter();

  const [email, setEmail] = useState(session?.user.email ?? "");
  const [firstName, setFirstName] = useState((session?.user.user_metadata?.first_name as string | undefined) ?? "");
  const [lastName, setLastName] = useState((session?.user.user_metadata?.last_name as string | undefined) ?? "");
  const [newPassword, setNewPassword] = useState("");

  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSaveEmail() {
    if (!email.trim()) return;
    setSavingEmail(true);
    setEmailError(null);
    setEmailSaved(false);
    try {
      await updateEmail(supabase, email.trim());
      setEmailSaved(true);
    } catch (err) {
      setEmailError(errorMessage(err));
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveName() {
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await updateName(supabase, firstName.trim(), lastName.trim());
      setNameSaved(true);
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      await completePasswordReset(newPassword);
      setNewPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete your account?",
      "This removes your access to every player linked to your account -- each one reverts back to their team's Head Coach. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            setDeleteError(null);
            try {
              await deleteMyAccount(supabase);
              await signOut();
              router.replace("/login");
            } catch (err) {
              setDeleteError(
                err instanceof HeadCoachOfActiveTeamError ? err.message : errorMessage(err)
              );
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (!session) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Email Address</Text>
      <TextInput
        style={styles.input}
        value={email}
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={(t) => {
          setEmail(t);
          setEmailSaved(false);
        }}
      />
      {emailError && <Text style={styles.error}>{emailError}</Text>}
      {emailSaved && <Text style={styles.success}>Check your inbox to confirm the new email.</Text>}
      <Pressable
        style={[styles.button, (!email.trim() || savingEmail) && styles.buttonDisabled]}
        disabled={!email.trim() || savingEmail}
        onPress={handleSaveEmail}
      >
        {savingEmail ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Save Email</Text>}
      </Pressable>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={firstName}
        placeholder="First name"
        onChangeText={(t) => {
          setFirstName(t);
          setNameSaved(false);
        }}
      />
      <TextInput
        style={styles.input}
        value={lastName}
        placeholder="Last name"
        onChangeText={(t) => {
          setLastName(t);
          setNameSaved(false);
        }}
      />
      {nameError && <Text style={styles.error}>{nameError}</Text>}
      {nameSaved && <Text style={styles.success}>Saved.</Text>}
      <Pressable style={[styles.button, savingName && styles.buttonDisabled]} disabled={savingName} onPress={handleSaveName}>
        {savingName ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Save Name</Text>}
      </Pressable>

      <Text style={styles.label}>Change Password</Text>
      <TextInput
        style={styles.input}
        value={newPassword}
        placeholder="New password"
        secureTextEntry
        onChangeText={(t) => {
          setNewPassword(t);
          setPasswordSaved(false);
        }}
      />
      {passwordError && <Text style={styles.error}>{passwordError}</Text>}
      {passwordSaved && <Text style={styles.success}>Password updated.</Text>}
      <Pressable
        style={[styles.button, (!newPassword || savingPassword) && styles.buttonDisabled]}
        disabled={!newPassword || savingPassword}
        onPress={handleChangePassword}
      >
        {savingPassword ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Update Password</Text>}
      </Pressable>

      <Text style={styles.label}>Season Totals</Text>
      <Text style={styles.hint}>View or save the Season Totals CSVs you've saved from ending a season.</Text>
      <Pressable style={styles.button} onPress={() => router.push("/season-totals")}>
        <Text style={styles.buttonText}>View Season Totals</Text>
      </Pressable>

      <Text style={styles.label}>Delete Account</Text>
      <Text style={styles.hint}>
        Permanently deletes your account. Any player you have access to will revert back to their team's Head
        Coach.
      </Text>
      {deleteError && <Text style={styles.error}>{deleteError}</Text>}
      <Pressable style={[styles.dangerButton, deleting && styles.buttonDisabled]} disabled={deleting} onPress={confirmDeleteAccount}>
        {deleting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Delete Account</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 8 },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 16, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular", marginBottom: 4 },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  success: { color: colors.success, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  dangerButton: { backgroundColor: colors.danger, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
});
